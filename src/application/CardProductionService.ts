import { PromptCatalog } from './prompts/PromptCatalog';
import type { ActiveRun } from './ActiveRun';
import type { GenerationPort } from './GenerationPort';
import { ProductionContext } from './ProductionContext';
import { SetRules } from '../domain/SetRules';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Variant, Card } from '../shared/Contracts';
import { PromptBuilder } from './PromptBuilder';

export class CardProductionService {
  constructor(private readonly context: ProductionContext) {}
  async produce(
    active: ActiveRun,
    provider: GenerationPort,
    variant: Variant,
    card: Card,
    instruction = '',
  ): Promise<void> {
    const run = active.run;
    if (card.locked) return;
    const folder = this.context.repository.directory(run.id),
      references = this.context.references(card, active.profile);
    await this.context.publish(run, `Preparing reference context: ${card.subject}`);
    const context = await this.context.sourceContext(active, 'card', variant, card);
    if (active.stop) return;
    const cardProfile = {
      ...(context?.profile ?? this.context.reviewProfile(active)),
      activeArtContract: variant.artContract,
    };
    const prepared = await active.preparation?.prepare(run.brief, card, variant, cardProfile, instruction);
    if (active.stop) return;
    const selectedReferences = [...(prepared?.references ?? references), ...(context?.referencePaths ?? [])];
    const prompt = prepared?.prompt ?? PromptBuilder.build(card, variant, cardProfile, instruction);
    SetRules.reserveImage(run);
    card.status = 'generating';
    card.error = null;
    await this.context.publish(run, `Generating: ${card.subject}`);
    const started = Date.now();
    const result = await provider.image(prompt, selectedReferences, run.brief.quality);
    const id = randomUUID();
    const files = await this.context.images.save(folder, id, result.bytes);
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
      sourceEvidence: context?.evidence,
    };
    card.attempts.push(attempt);
    card.selectedAttemptId = id;
    card.status = 'reviewing';
    await this.context.publish(run, `Reviewing: ${card.subject}`);
    const stored = card.attempts.find((a) => a.id === id);
    if (!stored) throw new Error('Attempt was not persisted.');
    try {
      stored.review = await provider.review(
        card,
        path.join(folder, files.preview),
        selectedReferences,
        cardProfile,
        run.brief,
      );
      stored.review.passed = SetRules.acceptsReview(stored.review, run.productionPolicy?.styleThreshold ?? 4);
    } catch (error) {
      stored.reviewError = this.context.errorMessage(error);
    }
    card.status = 'done';
    await this.context.publish(run);
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
          PromptCatalog.render('correction.cardFallback', {}, active.profile.promptCatalog),
      );
      const repaired = this.context.images.selected(card);
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
        await this.context.publish(run, 'Retained the stronger previous version');
      }
    }
  }
}
