import type { Run, Variant } from '../shared/Contracts';
import { ProductionRules } from './ProductionRules';
import { SetRules } from './SetRules';

/** One acceptance gate shared by presentation and production delivery. */
export class DeliveryReadiness {
  static accepts(run: Run, variant: Variant | undefined): boolean {
    if (!variant || variant.cards.length !== 10) return false;
    if (run.reviewProtocol === 'composition-v1' || ProductionRules.allowsWarnings(run.planningPolicy))
      return variant.cards.every((card) =>
        card.attempts.some((attempt) => attempt.id === card.selectedAttemptId),
      );
    const minimum = run.productionPolicy?.styleThreshold ?? 4;
    return (
      (run.reviewProtocol !== 'set-v3' || SetRules.hasCleanSetEvidence(variant)) &&
      (!run.workflowVersion || ProductionRules.readyForExport(variant, minimum, run.planningPolicy)) &&
      SetRules.acceptsSetReview(variant.review, minimum, Boolean(run.reviewProtocol)) &&
      SetRules.reviewMatchesSelection(variant, Boolean(run.reviewProtocol)) &&
      !variant.reviewError &&
      variant.cards.every((card) => {
        const attempt = card.attempts.find((item) => item.id === card.selectedAttemptId);
        return SetRules.acceptsReview(attempt?.review, minimum) && !attempt?.reviewError;
      })
    );
  }
}
