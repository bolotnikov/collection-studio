import type { Run } from '../shared/Contracts';
import { ProductionRules } from './ProductionRules';

/** User intents invalidate only the approvals whose inputs changed. */
export class RunEdits {
  static selectAttempt(run: Run, cardId: string, attemptId: string): void {
    const variant = run.variants.find((v) => v.cards.some((card) => card.id === cardId));
    const card = variant?.cards.find((card) => card.id === cardId);
    if (!variant || !card || !card.attempts.some((attempt) => attempt.id === attemptId))
      throw new Error('Version not found.');
    if (card.locked) throw new Error('Unlock the card first.');
    if (card.selectedAttemptId === attemptId) return;
    card.selectedAttemptId = attemptId;
    variant.review = null;
    delete variant.reviewedAttemptIds;
    if (run.workflowVersion && ProductionRules.pilot(variant).id === cardId) delete variant.pilotAttemptId;
    variant.reviewError = 'Selection changed manually; set review is now outdated.';
    run.status = 'paused';
    run.stage = variant.reviewError;
  }
  static lock(run: Run, cardId: string, locked: boolean): void {
    const card = run.variants.flatMap((v) => v.cards).find((card) => card.id === cardId);
    if (!card) throw new Error('Card not found.');
    if (locked && !card.selectedAttemptId) throw new Error('Generate an image first.');
    card.locked = locked;
  }
  static selectVariant(run: Run, variantId: string): void {
    if (!run.variants.some((v) => v.id === variantId)) throw new Error('Variant not found.');
    run.selectedVariantId = variantId;
  }
  static setBudget(run: Run, maximum: number): void {
    if (
      !Number.isSafeInteger(maximum) ||
      maximum > 150 ||
      maximum < run.imageCalls ||
      maximum < run.brief.variants * 10
    )
      throw new Error('The limit must cover existing requests and the base set size.');
    run.brief.maxImageCalls = maximum;
  }
}
