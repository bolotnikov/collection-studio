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
      const profile = { ...structuredClone(this.profile), analysisModel: settings.codexModel };
      const brief = Contracts.brief.parse(input);
      SetRules.validateBrief(brief);
      const provider = this.makeProvider(settings, profile);
      const now = new Date().toISOString();
      const run: Run = {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        brief,
        status: 'planning',
        stage: 'Planning set variants',
        imageCalls: 0,
        variants: [],
        events: [],
        provider: settings.provider,
        imageModel: settings.provider === 'codex' ? 'gpt-image-2 (Codex built-in)' : settings.imageModel,
        textModel: settings.provider === 'codex' ? settings.codexModel : settings.textModel,
        selectedVariantId: null,
        productionPolicy: policy,
        workflowVersion: 'planned-pilot-v1',
        planningPolicy: structuredClone(this.planningDefaults),
        planHistory: [],
        reviewProtocol:
          profile.knowledge && this.makeSourceContext
            ? profile.knowledge.cleanSets?.length
              ? 'set-v3'
              : 'set-v2'
            : undefined,
      };
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
  async resume(id: string, policy?: ProductionPolicy): Promise<void> {
    return this.whenIdle(async () => {
      const run = await this.repository.get(id);
      if (!run.productionPolicy && policy) run.productionPolicy = policy;
      if (run.status === 'completed')
        throw new Error('Run already completed. Select a card to create another version.');
      for (const v of run.variants)
        for (const c of v.cards)
          if (c.status === 'failed') {
            c.status = c.selectedAttemptId ? 'done' : 'pending';
            c.error = null;
          }
      const savedProfile = await this.repository.getProfile(run.id);
      this.launch(
        run,
        this.makeProvider(
          Contracts.settings.parse({
            provider: run.provider,
            imageModel: run.imageModel,
            textModel: run.textModel,
            codexModel: run.provider === 'codex' ? run.textModel : undefined,
          }),
          savedProfile,
        ),
        savedProfile,
      );
    });
  }
  async retry(runId: string, cardId: string, instruction: string, policy?: ProductionPolicy): Promise<void> {
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
      this.launch(
        run,
        this.makeProvider(
          Contracts.settings.parse({
            provider: run.provider,
            imageModel: run.imageModel,
            textModel: run.textModel,
            codexModel: run.provider === 'codex' ? run.textModel : undefined,
          }),
          savedProfile,
        ),
        savedProfile,
        { card, variant, instruction },
      );
    });
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
