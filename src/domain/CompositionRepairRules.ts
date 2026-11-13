import type { Attempt, Card, Run, Variant } from '../shared/Contracts';
import { SetComposition } from './SetComposition';
import { SlotTagRules } from './SlotTagRules';

/** Only explicit, observation-backed mandatory defects may spend a card repair request. */
export class CompositionRepairRules {
  static violations(variant: Variant, card: Card, attempt: Attempt) {
    const check = attempt.compositionCheck;
    if (!check || attempt.compositionCheckError || !SlotTagRules.reviewCurrent(card, attempt.slotTagRevision)) return [];
    const target = SetComposition.target(variant, card);
    return (check.confirmedViolations ?? []).filter((violation) => {
      switch (violation.kind) {
        case 'wrong-subject':
          return !check.subjectPresent;
        case 'clipped-silhouette':
          return !check.completeSilhouette;
        case 'forbidden-character':
          return card.category !== '5' && check.observedComposition.characterCount > 0;
        case 'wrong-category':
          return check.observedCategory !== card.category;
        case 'wrong-background':
          return Boolean(
            (attempt.backgroundReviewVersion === 'environment-background-v1' &&
              check.compositionDescriptionMatch === false &&
              (check.observedComposition.backdrop === 'environment' ||
                check.observedComposition.support === 'environment') &&
              check.unexpectedBackgroundObjects?.length) ||
            (target &&
              ((target.required.backdrop !== undefined &&
                target.required.backdrop !== check.observedComposition.backdrop) ||
                (target.required.pattern !== undefined &&
                  target.required.pattern !== check.observedComposition.pattern) ||
                (target.appearance?.backgroundColor !== undefined &&
                  target.appearance.backgroundColor !== check.observedComposition.backgroundColor) ||
                (target.required.backgroundColor !== undefined &&
                  target.required.backgroundColor !== check.observedComposition.backgroundColor))),
          );
      }
    });
  }
  static needsCardRepair(run: Run, variant: Variant, card: Card): boolean {
    const selected = card.attempts.find((attempt) => attempt.id === card.selectedAttemptId);
    if (!run.repairPolicy || card.locked || !selected || !this.violations(variant, card, selected).length)
      return false;
    const root = selected.repairRootId ?? selected.id;
    // Set corrections have their own round limit and never start a nested card repair loop.
    if (
      card.repairRequests?.some(
        (request) => request.scope === 'set' && request.resultAttemptId === selected.id,
      )
    )
      return false;
    return (
      (card.repairRequests ?? []).filter(
        (request) => request.scope === 'card' && request.rootAttemptId === root,
      ).length < run.repairPolicy.maxCardRegenerations
    );
  }
  static hasImageBudget(run: Run): boolean {
    const outstanding = run.variants
      .flatMap((variant) => variant.cards)
      .filter((card) => !card.selectedAttemptId && card.status !== 'generating').length;
    return run.imageCalls + outstanding < run.brief.maxImageCalls;
  }
}
