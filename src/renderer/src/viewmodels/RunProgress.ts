import type { Run } from '../../../shared/Contracts';
import { SetComposition } from '../../../domain/SetComposition';
import { DeliveryReadiness } from '../../../domain/DeliveryReadiness';
import { ProductionRules } from '../../../domain/ProductionRules';

/** Completed milestones only; elapsed model-request time never pretends to be progress. */
export class RunProgress {
  static activityGroups(run: Run) {
    const activities = run.activities ?? [];
    const kinds: NonNullable<Run['activities']>[number]['kind'][] = [
      'references',
      'generation',
      'card-review',
      'set-references',
      'assembly',
      'set-review',
    ];
    return kinds
      .map((kind) => ({
        kind,
        items: activities
          .filter((activity) => activity.kind === kind)
          .sort((left, right) => left.index - right.index || left.key.localeCompare(right.key)),
      }))
      .filter((group) => group.items.length > 0);
  }

  static snapshot(run: Run) {
    const compositionOnly = run.reviewProtocol === 'composition-v1';
    const hasSetCheck = Boolean(run.repairPolicy?.maxSetRegenerationRounds);
    const total = run.brief.variants * (compositionOnly && !hasSetCheck ? 21 : 22);
    let completed = 0,
      verified = 0,
      generated = 0,
      reviewed = 0;
    for (const variant of run.variants) {
      completed += 1; // Independently reviewed plan.
      completed += variant.cards.filter((card) =>
        card.attempts.some((attempt) => attempt.id === card.selectedAttemptId),
      ).length;
      generated += variant.cards.filter((card) =>
        card.attempts.some((attempt) => attempt.id === card.selectedAttemptId),
      ).length;
      reviewed += variant.cards.filter((card) =>
        card.attempts.some(
          (attempt) =>
            attempt.id === card.selectedAttemptId &&
            Boolean(
              attempt.compositionCheck ||
              attempt.compositionCheckError ||
              attempt.review ||
              attempt.reviewError,
            ),
        ),
      ).length;
      const accepted = SetComposition.snapshot(
        variant,
        new Set(),
        run.productionPolicy?.styleThreshold ?? 4,
      ).accepted;
      completed += compositionOnly
        ? variant.cards.filter((card) =>
            card.attempts.some(
              (attempt) =>
                attempt.id === card.selectedAttemptId &&
                (attempt.compositionCheck ||
                  attempt.compositionCheckError ||
                  attempt.compositionCheckSkipped),
            ),
          ).length
        : ProductionRules.allowsWarnings(run.planningPolicy)
          ? variant.cards.filter((card) =>
              card.attempts.some(
                (attempt) =>
                  attempt.id === card.selectedAttemptId &&
                  (attempt.compositionCheck ||
                    attempt.compositionCheckError ||
                    attempt.review ||
                    attempt.reviewError),
              ),
            ).length
          : accepted;
      verified += compositionOnly
        ? variant.cards.filter((card) =>
            card.attempts.some(
              (attempt) => attempt.id === card.selectedAttemptId && attempt.compositionCheck?.matches,
            ),
          ).length
        : accepted;
      const gridReview = variant.gridReviewHistory?.at(-1);
      const currentGrid =
        JSON.stringify(gridReview?.attemptIds) ===
        JSON.stringify(variant.cards.map((card) => card.selectedAttemptId));
      if (
        compositionOnly && hasSetCheck
          ? currentGrid &&
            Boolean(
              gridReview?.observation ||
              (gridReview?.error && gridReview.error !== 'Set composition request outcome is unknown.'),
            ) &&
            !variant.gridRepairRounds?.some((round) => !round.completedAt)
          : !compositionOnly &&
            (ProductionRules.allowsWarnings(run.planningPolicy)
              ? variant.review || variant.reviewError
              : DeliveryReadiness.accepts(run, variant))
      )
        completed += 1;
    }
    const finished = run.status === 'completed' && generated === run.brief.variants * 10;
    return {
      completed: finished ? total : completed,
      total,
      verified,
      generated,
      reviewed,
      cards: run.brief.variants * 10,
      percent: finished ? 100 : Math.floor((completed * 100) / total),
    };
  }
}
