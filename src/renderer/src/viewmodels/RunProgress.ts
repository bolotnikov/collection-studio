import type { Run } from '../../../shared/Contracts';
import { SetComposition } from '../../../domain/SetComposition';
import { DeliveryReadiness } from '../../../domain/DeliveryReadiness';

/** Completed milestones only; elapsed model-request time never pretends to be progress. */
export class RunProgress {
  static snapshot(run: Run) {
    const total = run.brief.variants * 22;
    let completed = 0,
      verified = 0;
    for (const variant of run.variants) {
      completed += 1; // Independently reviewed plan.
      completed += variant.cards.filter((card) =>
        card.attempts.some((attempt) => attempt.id === card.selectedAttemptId),
      ).length;
      const accepted = SetComposition.snapshot(
        variant,
        new Set(),
        run.productionPolicy?.styleThreshold ?? 4,
      ).accepted;
      completed += accepted;
      verified += accepted;
      if (DeliveryReadiness.accepts(run, variant)) completed += 1;
    }
    return {
      completed,
      total,
      verified,
      cards: run.brief.variants * 10,
      percent: Math.floor((completed * 100) / total),
    };
  }
}
