import { Contracts, type Brief, type Plan, type Profile, type Run } from '../shared/Contracts';
import type { GenerationPort } from './GenerationPort';
import type { PlanningPolicy, PlanReview } from '../shared/SetContract';
import { ProductionRules } from '../domain/ProductionRules';

/** Persist each proposal and review before advancing; resume partially reviewed proposals. */
export class SetPlanningService {
  async plan(
    provider: GenerationPort,
    brief: Brief,
    profile: Profile,
    references: string[],
    policy: PlanningPolicy,
    history: NonNullable<Run['planHistory']>,
    checkpoint: () => Promise<void>,
    stopped: () => boolean,
  ): Promise<{ plan: Plan; reviews: PlanReview[] } | null> {
    while (!stopped()) {
      let entry = history.at(-1);
      if (entry && this.accepted(entry, policy)) return { plan: entry.plan, reviews: entry.reviews };
      const partial = entry && !entry.errors.length && entry.reviews.length < entry.plan.variants.length;
      if (!partial) {
        if (history.length >= 1 + policy.maxPlanRepairs) return null;
        const correction = entry ? JSON.stringify({ errors: entry.errors, reviews: entry.reviews }) : '';
        const plan = await provider.plan(brief, profile, references, correction);
        entry = { at: new Date().toISOString(), plan, reviews: [], errors: [] };
        try {
          Contracts.productionPlan.parse(plan);
          ProductionRules.validatePlan(plan, brief.variants);
        } catch (error) {
          entry.errors.push(error instanceof Error ? error.message : 'Invalid plan');
        }
        history.push(entry);
        await checkpoint();
      }
      if (!entry) throw new Error('Plan proposal was not persisted.');
      if (entry.errors.length) continue;
      for (let index = entry.reviews.length; index < entry.plan.variants.length; index++) {
        if (stopped()) return null;
        const variant = entry.plan.variants[index];
        if (!variant) throw new Error('Plan variant missing.');
        try {
          entry.reviews.push(await provider.reviewPlan(brief, variant, profile, references));
        } catch (error) {
          entry.errors.push(error instanceof Error ? error.message : 'Plan review unavailable');
        }
        await checkpoint();
        if (entry.errors.length) break;
      }
    }
    return null;
  }
  private accepted(entry: NonNullable<Run['planHistory']>[number], policy: PlanningPolicy): boolean {
    return (
      !entry.errors.length &&
      entry.reviews.length === entry.plan.variants.length &&
      entry.reviews.every((review) => ProductionRules.acceptsPlan(review, policy.minimumPlanScore))
    );
  }
}
