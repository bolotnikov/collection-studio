import { GenerationRepairContracts } from '../shared/GenerationRepairContracts';
import { PromptCatalog } from './prompts/PromptCatalog';
import { ContextOptimization } from '../shared/ContextOptimization';
import { CompositionPlanningContracts } from '../shared/CompositionPlanningContracts';
import { GenerationContentPolicy } from './GenerationContentPolicy';
import { RunEdits } from '../domain/RunEdits';
import type { ActiveRun } from './ActiveRun';
import { ProductionContext } from './ProductionContext';
import { ProductionWorkflow } from './ProductionWorkflow';
import productionDefaults from '../../resources/production-config.json';
import { SetContract } from '../shared/SetContract';
import type { SourceContextPort } from './style/SourceContextPort';
import { StyleContracts, type ProductionPolicy } from '../shared/StyleContracts';
import type { StylePreparationPort } from './style/StylePreparationPort';
import { randomUUID } from 'node:crypto';
import {
  Contracts,
  type Brief,
  type Card,
  type Profile,
  type Run,
  type Settings,
  type Variant,
} from '../shared/Contracts';
import { SetRules } from '../domain/SetRules';
import type { RunStore } from './RunStore';
import type { ImageStore } from './ImageStore';
import type { GenerationPort } from './GenerationPort';
import { ProductionRules } from '../domain/ProductionRules';

export class RunService {
  private active: ActiveRun | null = null;
  private transitioning = false;
  constructor(
    private readonly repository: RunStore,
    private readonly images: ImageStore,
    private profile: Profile,
    private readonly referenceRoot: string,
    private readonly makeProvider: (settings: Settings, profile: Profile) => GenerationPort,
    private readonly notify: (run: Run) => void,
    private readonly makePreparation?: (policy: ProductionPolicy, profile: Profile) => StylePreparationPort,
    private readonly makeSourceContext?: (profile: Profile) => SourceContextPort,
    private readonly planningDefaults = SetContract.planningPolicy.parse(productionDefaults),
  ) {}
  updateProfile(profile: Profile): void {
    this.profile = structuredClone(profile);
  }
  private async publish(run: Run, message?: string): Promise<void> {
    if (message) {
      run.stage = message;
      run.events.push({ at: new Date().toISOString(), message });
    }
    await this.repository.save(run);
    this.notify(structuredClone(run));
  }
  private async whenIdle<T>(action: () => Promise<T>): Promise<T> {
    if (this.active || this.transitioning) throw new Error('Wait until the active run finishes or pauses.');
    this.transitioning = true;
    try {
      return await action();
    } finally {
      this.transitioning = false;
    }
  }
  async start(input: Brief, settings: Settings, policy?: ProductionPolicy): Promise<Run> {
    return this.whenIdle(async () => {
      let profile = { ...structuredClone(this.profile), analysisModel: settings.codexModel };
      const brief = Contracts.brief.parse(input);
      SetRules.validateBrief(brief);
      const content = GenerationContentPolicy.apply(profile, policy, Boolean(brief.includeGold));
      profile = { ...content.profile, analysisModel: settings.codexModel };
      if (profile.visualCatalog)
        profile.compositionPlanning ??= structuredClone(CompositionPlanningContracts.defaults);
      if (
        profile.visualCatalog &&
        ['aggregate-pattern-v1', 'slots-first-v1'].includes(profile.compositionPlanning?.version ?? '')
      )
        profile.contextOptimization ??= structuredClone(ContextOptimization.defaults);
      if (profile.compositionPlanning?.version === 'slots-first-v1')
        profile.referenceSelection = 'catalogue-v1';
      policy = content.policy;
      if (profile.referenceSelection === 'catalogue-v1' && policy) policy = { ...policy, referenceLimit: 8 };
      const id = randomUUID();
      profile.productionRunId = id;
      const provider = this.makeProvider(settings, profile);
      const now = new Date().toISOString();
      const run: Run = {
        id,
        createdAt: now,
        updatedAt: now,
        brief: provider.verifyComposition ? { ...brief, autoRepair: false } : brief,
        status: 'planning',
        stage: 'Planning set variants',
        imageCalls: 0,
        variants: [],
        events: [],
        provider: 'codex',
        imageModel: 'gpt-image-2 (Codex built-in)',
        textModel: settings.codexModel,
        planningModel: settings.planningModel,
        selectedVariantId: null,
        productionPolicy: provider.verifyComposition && policy ? { ...policy, maxRepairsPerCard: 0 } : policy,
        workflowVersion: 'planned-set-v2',
        planningPolicy: structuredClone(this.planningDefaults),
        planHistory: [],
        reviewProtocol: provider.verifyComposition
          ? 'composition-v1'
          : profile.knowledge && this.makeSourceContext
            ? profile.knowledge.cleanSets?.length
              ? 'set-v3'
              : 'set-v2'
            : undefined,
      };
      if (provider.verifyComposition) this.enableRepairPolicy(run, profile, settings, 'new-run');
      await this.publish(run, run.stage);
      await this.repository.saveProfile(run.id, profile);
      this.launch(run, provider, profile);
      return structuredClone(run);
    });
  }
  private launch(
    run: Run,
    provider: GenerationPort,
    profile: Profile,
    singleCard?: { card: Card; variant: Variant; instruction: string },
  ): void {
    run.activities = [];
    const active: ActiveRun = {
      run,
      stop: false,
      profile,
      preparation: this.makePreparation?.(run.productionPolicy ?? StyleContracts.policy.parse({}), profile),
      sourceContext: profile.knowledge ? this.makeSourceContext?.(profile) : undefined,
    };
    this.active = active;
    void new ProductionWorkflow(
      new ProductionContext(this.repository, this.images, this.referenceRoot, (run, message) =>
        this.publish(run, message),
      ),
    )
      .execute(active, provider, singleCard)
      .catch(async (error) => {
        run.status = active.stop ? 'paused' : 'failed';
        if (singleCard) {
          singleCard.card.status = 'failed';
          singleCard.card.error = this.errorMessage(error);
        }
        await this.publish(run, this.errorMessage(error));
      })
      .finally(() => {
        if (this.active === active) this.active = null;
      });
  }
  private errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return message.replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 1200);
  }
  async pause(id: string): Promise<void> {
    if (this.active?.run.id !== id) return;
    this.active.stop = true;
    await this.publish(this.active.run, 'Pausing the queue. Waiting for in-flight requests to finish.');
  }
  async remove(id: string): Promise<void> {
    return this.whenIdle(async () => {
      const run = await this.repository.get(id);
      if (['planning', 'generating', 'reviewing'].includes(run.status))
        throw new Error('Pause generation before deleting a project.');
      await this.repository.remove(id);
    });
  }
  async resume(id: string, policy?: ProductionPolicy, settings?: Settings): Promise<void> {
    return this.whenIdle(async () => {
      const run = await this.repository.get(id);
      if (!run.productionPolicy && policy) run.productionPolicy = policy;
      if (run.status === 'completed')
        throw new Error('Run already completed. Select a card to create another version.');
      if (run.planningPolicy) {
        run.planningPolicy.qualityMode ??= this.planningDefaults.qualityMode;
        if (ProductionRules.allowsWarnings(run.planningPolicy))
          run.planningPolicy.maxPlanRepairs = Math.max(
            run.planningPolicy.maxPlanRepairs,
            this.planningDefaults.maxPlanRepairs,
          );
      }
      if (!run.variants.length && run.planHistory?.length) {
        const last = run.planHistory.at(-1);
        const exhausted =
          run.planHistory.length - (run.planningSessionStart ?? 0) >=
          1 + (run.planningPolicy?.maxPlanRepairs ?? 0);
        if (
          exhausted &&
          last &&
          (last.errors.length ||
            last.reviews.some(
              (review) => !ProductionRules.acceptsPlan(review, run.planningPolicy?.minimumPlanScore),
            ))
        ) {
          run.planningSessionStart = run.planHistory.length;
          run.status = 'planning';
          await this.publish(run, 'Retrying automatic planning with the recorded corrections');
        }
      }
      for (const v of run.variants)
        for (const c of v.cards)
          if (c.status === 'failed') {
            c.status = c.selectedAttemptId ? 'done' : 'pending';
            c.error = null;
          }
      const savedProfile = await this.repository.getProfile(run.id);
      savedProfile.productionRunId = run.id;
      if (
        !run.imageCalls &&
        !run.variants.length &&
        savedProfile.compositionPlanning?.version === 'aggregate-pattern-v1'
      ) {
        savedProfile.compositionPlanning = { ...savedProfile.compositionPlanning, version: 'slots-first-v1' };
        savedProfile.contextOptimization ??= structuredClone(ContextOptimization.defaults);
        savedProfile.referenceSelection = 'catalogue-v1';
        run.planningSessionStart = run.planHistory?.length ?? 0;
        await this.repository.saveProfile(run.id, savedProfile);
      }
      const effectiveSettings = this.executionSettings(run, settings);
      savedProfile.analysisModel = effectiveSettings.codexModel;
      const provider = this.makeProvider(effectiveSettings, savedProfile);
      this.enableCompositionProtocol(run, provider, 'user-requested-resume');
      if (provider.verifyComposition)
        this.enableRepairPolicy(run, savedProfile, effectiveSettings, 'user-requested-resume');
      await this.repository.saveProfile(run.id, savedProfile);
      this.launch(run, provider, savedProfile);
    });
  }
  async retry(
    runId: string,
    cardId: string,
    instruction: string,
    policy?: ProductionPolicy,
    settings?: Settings,
  ): Promise<void> {
    return this.whenIdle(async () => {
      const run = await this.repository.get(runId);
      if (!run.productionPolicy && policy) run.productionPolicy = policy;
      const variant = run.variants.find((v) => v.cards.some((c) => c.id === cardId)),
        card = variant?.cards.find((c) => c.id === cardId);
      if (!variant || !card) throw new Error('Card not found.');
      if (card.locked) throw new Error('Unlock the card first.');
      if (run.imageCalls >= run.brief.maxImageCalls) throw new Error('Generation limit reached.');
      variant.review = null;
      variant.reviewError = null;
      const savedProfile = await this.repository.getProfile(run.id);
      savedProfile.productionRunId = run.id;
      const effectiveSettings = this.executionSettings(run, settings);
      savedProfile.analysisModel = effectiveSettings.codexModel;
      const provider = this.makeProvider(effectiveSettings, savedProfile);
      this.enableCompositionProtocol(run, provider, 'user-requested-regeneration');
      if (provider.verifyComposition)
        this.enableRepairPolicy(run, savedProfile, effectiveSettings, 'user-requested-regeneration');
      await this.repository.saveProfile(run.id, savedProfile);
      run.status = 'generating';
      await this.publish(run, `Manual regeneration requested: ${card.subject}`);
      this.launch(run, provider, savedProfile, { card, variant, instruction });
    });
  }
  private executionSettings(run: Run, current?: Settings): Settings {
    const settings = current ?? Contracts.settings.parse({});
    if (run.provider !== 'codex') {
      (run.providerHistory ??= []).push({
        from: run.provider,
        to: 'codex',
        at: new Date().toISOString(),
        imageModel: run.imageModel,
        textModel: run.textModel,
      });
      run.provider = 'codex';
      run.imageModel = 'gpt-image-2 (Codex built-in)';
      run.textModel = settings.codexModel;
    }
    return Contracts.settings.parse({
      ...settings,
      codexModel: run.textModel,
      planningModel: run.planningModel,
    });
  }
  private enableRepairPolicy(
    run: Run,
    profile: Profile,
    settings: Settings,
    reason: 'new-run' | 'user-requested-resume' | 'user-requested-regeneration',
  ): void {
    run.repairPolicy ??= GenerationRepairContracts.policy.parse({
      ...settings,
      version: 'bounded-composition-v1',
      enabledAt: new Date().toISOString(),
      reason,
    });
    if (profile.promptCatalog) {
      const defaults = new PromptCatalog().values;
      for (const key of [
        'review.mandatoryViolations.v1',
        'correction.mandatory.v1',
        'review.grid.v1',
        'correction.grid.v1',
        'generation.context.v1',
        'generation.appearance.v1',
      ]) {
        const template = defaults[key];
        if (!template) throw new Error('Missing repair prompt template.');
        profile.promptCatalog[key] ??= template;
      }
    }
  }
  private enableCompositionProtocol(
    run: Run,
    provider: GenerationPort,
    reason: 'user-requested-resume' | 'user-requested-regeneration',
  ): void {
    if (!provider.verifyComposition || run.reviewProtocol === 'composition-v1') return;
    run.reviewProtocolHistory ??= [];
    run.reviewProtocolHistory.push({
      from: run.reviewProtocol,
      to: 'composition-v1',
      at: new Date().toISOString(),
      reason,
    });
    run.reviewProtocol = 'composition-v1';
    run.brief.autoRepair = false;
    if (run.productionPolicy) run.productionPolicy = { ...run.productionPolicy, maxRepairsPerCard: 0 };
  }
  selectAttempt(id: string, cardId: string, attemptId: string): Promise<void> {
    return this.edit(id, (run) => RunEdits.selectAttempt(run, cardId, attemptId));
  }
  lock(id: string, cardId: string, locked: boolean): Promise<void> {
    return this.edit(id, (run) => RunEdits.lock(run, cardId, locked));
  }
  selectVariant(id: string, variantId: string): Promise<void> {
    return this.edit(id, (run) => RunEdits.selectVariant(run, variantId));
  }
  setBudget(id: string, maximum: number): Promise<void> {
    return this.edit(id, (run) => RunEdits.setBudget(run, maximum));
  }
  async edit(id: string, mutate: (run: Run) => void): Promise<void> {
    return this.whenIdle(async () => {
      const run = await this.repository.get(id);
      mutate(run);
      await this.publish(run);
    });
  }
}
