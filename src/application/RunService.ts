import { StyleContracts, type ProductionPolicy } from '../shared/StyleContracts';
import type { StylePreparationPort } from './style/StylePreparationPort';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
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
import { PromptBuilder } from './PromptBuilder';

type ActiveRun = { run: Run; stop: boolean; profile: Profile; preparation?: StylePreparationPort };

export class RunService {
  private active: ActiveRun | null = null;
  private transitioning = false;
  constructor(
    private readonly repository: RunStore,
    private readonly images: ImageStore,
    private readonly profile: Profile,
    private readonly referenceRoot: string,
    private readonly makeProvider: (settings: Settings) => GenerationPort,
    private readonly notify: (run: Run) => void,
    private readonly makePreparation?: (policy: ProductionPolicy) => StylePreparationPort,
  ) {}
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
      const brief = Contracts.brief.parse(input);
      SetRules.validateBrief(brief);
      const provider = this.makeProvider(settings);
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
      };
      await this.publish(run, run.stage);
      await this.repository.saveProfile(run.id, this.profile);
      this.launch(run, provider, this.profile);
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
      preparation: this.makePreparation?.(run.productionPolicy ?? StyleContracts.policy.parse({})),
    };
    this.active = active;
    void this.execute(active, provider, singleCard)
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
      this.launch(
        run,
        this.makeProvider(
          Contracts.settings.parse({
            provider: run.provider,
            imageModel: run.imageModel,
            textModel: run.textModel,
            codexModel: run.provider === 'codex' ? run.textModel : undefined,
          }),
        ),
        await this.repository.getProfile(id),
      );
    });
  }
  private reviewProfile(active: ActiveRun): Profile {
    return {
      ...active.profile,
      rules: [...new Set([...active.profile.rules, ...(active.run.productionPolicy?.rules ?? [])])],
    };
  }
  private references(card: Card, profile: Profile): string[] {
    const matched = profile.references.filter((r) => r.category === card.category);
    const other = profile.references.find((r) => r.category !== card.category);
    return [...matched.slice(0, 2), ...(other ? [other] : [])].map((r) =>
      path.join(this.referenceRoot, r.filename),
    );
  }
  private async execute(
    active: ActiveRun,
    provider: GenerationPort,
    singleCard?: { card: Card; variant: Variant; instruction: string },
  ): Promise<void> {
    const run = active.run;
    if (active.preparation) {
      await this.publish(run, 'Analyzing the reference library');
      await active.preparation.initialize?.(
        () => active.stop,
        async (indexed, total) => {
          await this.publish(run, `Reference library: ${indexed}/${total} analyzed`);
        },
      );
      if (active.stop) {
        run.status = 'paused';
        await this.publish(run, 'Reference analysis paused. Cached results retained.');
        return;
      }
    }
    if (run.variants.length === 0) {
      run.status = 'planning';
      await this.publish(run, 'Planning ten subjects for each variant');
      const plan = await provider.plan(
        run.brief,
        this.reviewProfile(active),
        active.profile.references.map((ref) => path.join(this.referenceRoot, ref.filename)),
      );
      SetRules.validatePlan(plan, run.brief.variants);
      run.variants = plan.variants.map((v) => ({
        ...v,
        id: randomUUID(),
        review: null,
        reviewError: null,
        cards: v.cards.map((c) => ({
          ...c,
          id: randomUUID(),
          status: 'pending',
          attempts: [],
          selectedAttemptId: null,
          locked: false,
          error: null,
        })),
      }));
      run.selectedVariantId = run.variants[0]?.id ?? null;
      await this.publish(run, 'Set plans validated');
    }
    run.status = 'generating';
    if (singleCard) {
      await this.produce(active, provider, singleCard.variant, singleCard.card, singleCard.instruction);
    } else {
      const jobs = run.variants.flatMap((variant) =>
        variant.cards
          .filter(
            (card) =>
              card.status !== 'done' ||
              (run.productionPolicy &&
                !card.locked &&
                (!SetRules.acceptsReview(
                  this.images.selected(card)?.review,
                  run.productionPolicy.styleThreshold,
                ) ||
                  Boolean(this.images.selected(card)?.reviewError)) &&
                card.attempts.length < 1 + run.productionPolicy.maxRepairsPerCard),
          )
          .map((card) => ({ variant, card })),
      );
      let next = 0;
      const worker = async () => {
        while (!active.stop) {
          const job = jobs[next++];
          if (!job) break;
          try {
            await this.produce(active, provider, job.variant, job.card);
          } catch (error) {
            job.card.status = 'failed';
            job.card.error = this.errorMessage(error);
            active.stop = true;
            await this.publish(run, job.card.error);
          }
        }
      };
      await Promise.all([worker(), worker()]);
    }
    if (active.stop) {
      run.status = 'paused';
      await this.publish(run, 'Paused. Finished cards are saved.');
      return;
    }
    if (run.variants.some((v) => v.cards.some((c) => !this.images.selected(c)))) {
      run.status = 'paused';
      await this.publish(run, 'The collection is incomplete. Resume to generate the remaining cards.');
      return;
    }
    run.status = 'reviewing';
    await this.publish(run, 'Reviewing set coherence');
    const variants = singleCard ? [singleCard.variant] : run.variants;
    for (const variant of variants) {
      if (active.stop) break;
      if (variant.cards.some((c) => !c.selectedAttemptId)) continue;
      try {
        const sheet = await this.images.sheet(this.repository.directory(run.id), variant);
        variant.review = await provider.reviewSet(
          variant,
          sheet,
          this.reviewProfile(active),
          active.profile.references.slice(0, 8).map((ref) => path.join(this.referenceRoot, ref.filename)),
          run.brief,
        );
        variant.reviewError = null;
        const policy = run.productionPolicy;
        if (policy) {
          for (
            let round = 0;
            round < policy.maxRepairsPerCard && !variant.review?.passed && !active.stop;
            round++
          ) {
            const targets = variant.cards.filter(
              (card) =>
                variant.review?.outlierCardIds.includes(card.id) &&
                !card.locked &&
                card.attempts.length < 1 + policy.maxRepairsPerCard,
            );
            if (!targets.length) break;
            const correction =
              variant.review?.findings.join('; ') ?? 'Improve consistency with the original reference style.';
            for (const target of targets) {
              if (active.stop || run.imageCalls >= run.brief.maxImageCalls) break;
              await this.produce(active, provider, variant, target, correction);
            }
            const updatedSheet = await this.images.sheet(this.repository.directory(run.id), variant);
            variant.review = await provider.reviewSet(
              variant,
              updatedSheet,
              this.reviewProfile(active),
              active.profile.references.slice(0, 8).map((ref) => path.join(this.referenceRoot, ref.filename)),
              run.brief,
            );
          }
        }
      } catch (error) {
        variant.reviewError = this.errorMessage(error);
      }
      await this.publish(run);
    }
    run.status = active.stop ? 'paused' : 'completed';
    const needsReview = run.variants.some(
      (v) =>
        !v.review?.passed ||
        Boolean(v.reviewError) ||
        v.cards.some(
          (c) =>
            !SetRules.acceptsReview(
              this.images.selected(c)?.review,
              run.productionPolicy?.styleThreshold ?? 4,
            ) || Boolean(this.images.selected(c)?.reviewError),
        ),
    );
    if (needsReview) run.status = 'paused';
    await this.publish(
      run,
      active.stop
        ? 'Review paused'
        : needsReview
          ? 'Generation complete · needs art review'
          : 'Generation complete · automated checks passed',
    );
  }
  private async produce(
    active: ActiveRun,
    provider: GenerationPort,
    variant: Variant,
    card: Card,
    instruction = '',
  ): Promise<void> {
    const run = active.run;
    if (card.locked) return;
    const folder = this.repository.directory(run.id),
      references = this.references(card, active.profile);
    await this.publish(run, `Preparing reference context: ${card.subject}`);
    const prepared = await active.preparation?.prepare(run.brief, card, variant, active.profile, instruction);
    if (active.stop) return;
    const selectedReferences = prepared?.references ?? references;
    const prompt = prepared?.prompt ?? PromptBuilder.build(card, variant, active.profile, instruction);
    SetRules.reserveImage(run);
    card.status = 'generating';
    card.error = null;
    await this.publish(run, `Generating: ${card.subject}`);
    const started = Date.now();
    const result = await provider.image(prompt, selectedReferences, run.brief.quality);
    const id = randomUUID();
    const files = await this.images.save(folder, id, result.bytes);
    const attempt = {
      id,
      ...files,
      prompt,
      model: run.imageModel,
      createdAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      requestId: result.requestId,
      usage: result.usage,
      review: null,
      reviewError: null,
      evidence: prepared?.evidence,
    };
    card.attempts.push(attempt);
    card.selectedAttemptId = id;
    card.status = 'reviewing';
    await this.publish(run, `Reviewing: ${card.subject}`);
    const stored = card.attempts.find((a) => a.id === id);
    if (!stored) throw new Error('Attempt was not persisted.');
    try {
      stored.review = await provider.review(
        card,
        path.join(folder, files.preview),
        selectedReferences,
        this.reviewProfile(active),
        run.brief,
      );
      stored.review.passed = SetRules.acceptsReview(stored.review, run.productionPolicy?.styleThreshold ?? 4);
    } catch (error) {
      stored.reviewError = this.errorMessage(error);
    }
    card.status = 'done';
    await this.publish(run);
    const outstanding = run.variants
      .flatMap((v) => v.cards)
      .filter((c) => c.status === 'pending' && !c.selectedAttemptId).length;
    if (
      !active.stop &&
      (run.productionPolicy ? true : run.brief.autoRepair) &&
      stored.review &&
      !stored.review.passed &&
      card.attempts.length < 1 + (run.productionPolicy?.maxRepairsPerCard ?? 1) &&
      run.imageCalls + outstanding < run.brief.maxImageCalls
    ) {
      await this.produce(
        active,
        provider,
        variant,
        card,
        stored.review.correction ||
          stored.review.findings.join('; ') ||
          'Correct the failed style/category review against original references.',
      );
      const repaired = this.images.selected(card);
      const originalScore =
        stored.review.style +
        stored.review.readability +
        stored.review.subjectMatch +
        (stored.review.passed ? 20 : 0);
      const newScore = repaired?.review
        ? repaired.review.style +
          repaired.review.readability +
          repaired.review.subjectMatch +
          (repaired.review.passed ? 20 : 0)
        : 0;
      if (newScore < originalScore) {
        card.selectedAttemptId = stored.id;
        await this.publish(run, 'Retained the stronger previous version');
      }
    }
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
      this.launch(
        run,
        this.makeProvider(
          Contracts.settings.parse({
            provider: run.provider,
            imageModel: run.imageModel,
            textModel: run.textModel,
            codexModel: run.provider === 'codex' ? run.textModel : undefined,
          }),
        ),
        await this.repository.getProfile(runId),
        { card, variant, instruction },
      );
    });
  }
  async edit(id: string, mutate: (run: Run) => void): Promise<void> {
    return this.whenIdle(async () => {
      const run = await this.repository.get(id);
      mutate(run);
      await this.publish(run);
    });
  }
}
