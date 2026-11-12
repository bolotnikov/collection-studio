import type { ActiveRun } from './ActiveRun';
import type { GenerationPort } from './GenerationPort';
import { ProductionContext } from './ProductionContext';
import { SetRules } from '../domain/SetRules';
import path from 'node:path';
import type { Variant } from '../shared/Contracts';

export class SetReviewService {
  constructor(private readonly context: ProductionContext) {}
  async review(active: ActiveRun, provider: GenerationPort, variant: Variant): Promise<void> {
    const context = await this.context.sourceContext(active, 'set-review', variant);
    if (active.stop) return;
    const attempts = variant.cards.map((card) => card.selectedAttemptId ?? '');
    try {
      const sheet = await this.context.images.sheet(
        this.context.repository.directory(active.run.id),
        variant,
      );
      variant.sourceEvidence = context?.evidence;
      variant.review = await provider.reviewSet(
        variant,
        sheet,
        {
          ...(context?.profile ?? this.context.reviewProfile(active)),
          activeArtContract: variant.artContract,
        },
        [
          ...active.profile.references
            .slice(0, context ? 4 : 8)
            .map((r) => path.join(this.context.referenceRoot, r.filename)),
          ...(context?.referencePaths ?? []),
        ],
        active.run.brief,
      );
      SetRules.validateSetReview(variant.review, variant);
      variant.review.passed = SetRules.acceptsSetReview(
        variant.review,
        active.run.productionPolicy?.styleThreshold ?? 4,
        active.run.reviewProtocol === 'set-v2',
      );
      variant.reviewedAttemptIds = attempts;
      variant.reviewError = null;
    } catch (error) {
      variant.review = null;
      variant.reviewError = this.context.errorMessage(error);
    }
    variant.reviewHistory ??= [];
    variant.reviewHistory.push({
      at: new Date().toISOString(),
      attemptIds: attempts,
      review: structuredClone(variant.review),
      error: variant.reviewError,
      sourceEvidence: context?.evidence,
    });
    await this.context.publish(active.run);
  }
}
