import { CompositionPlanningService } from './CompositionPlanningService';
import { Contracts, type Brief, type Plan, type Profile, type Run } from '../shared/Contracts';
import type { GenerationPort } from './GenerationPort';
import type { PlanningPolicy, PlanReview } from '../shared/SetContract';
import { ProductionRules } from '../domain/ProductionRules';
import { SetComposition } from '../domain/SetComposition';

/** Persist each proposal and review before advancing; resume partially reviewed proposals. */
export class SetPlanningService {
  async plan(
    provider: GenerationPort,
    brief: Brief,
    profile: Profile,
    references: string[],
    policy: PlanningPolicy,
    history: NonNullable<Run['planHistory']>,
    checkpoint: (message?: string) => Promise<void>,
    stopped: () => boolean,
    state: Pick<Run, 'compositionDraft'> = {},
  ): Promise<{ plan: Plan; reviews: PlanReview[] } | null> {
    while (!stopped()) {
      let entry = history.at(-1);
      if (entry && this.accepted(entry, policy)) return { plan: entry.plan, reviews: entry.reviews };
      const partial = entry && !entry.errors.length && entry.reviews.length < entry.plan.variants.length;
      if (!partial) {
        if (history.length >= 1 + policy.maxPlanRepairs) return null;
        const correction = entry ? JSON.stringify({ errors: entry.errors, reviews: entry.reviews }) : '';
        const result = profile.compositionPlanning
          ? await new CompositionPlanningService().propose(
              provider,
              brief,
              profile,
              references,
              correction,
              history.length,
              state,
              checkpoint,
              stopped,
            )
          : { plan: await provider.plan(brief, profile, references, correction), errors: [] };
        if (!result) return null;
        const { plan, errors } = result;
        entry = {
          at: new Date().toISOString(),
          plan,
          reviews: [],
          errors,
          ...(profile.compositionPlanning
            ? { compositionDraft: structuredClone(state.compositionDraft) }
            : {}),
        };

        try {
          if (entry.errors.length) throw new Error(entry.errors[0]);
          Contracts.productionPlan.parse(plan);
          ProductionRules.validatePlan(plan, brief.variants, Boolean(brief.includeGold));
          ProductionRules.validateReferenceBindings(plan);
          if (profile.visualCatalog)
            SetComposition.validate(
              plan,
              profile.visualCatalog,
              profile.library
                ?.filter((item) => item.origin === 'anchor' && item.approved)
                .map((item) => item.id),
            );
        } catch (error) {
          if (!entry.errors.length)
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
          await checkpoint('Reviewing the set plan');
          entry.reviews.push(await provider.reviewPlan(brief, variant, profile, references));
          delete entry.reviewError;
        } catch (error) {
          entry.reviewError = error instanceof Error ? error.message : 'Plan review unavailable';
          await checkpoint();
          throw error;
        }
        await checkpoint();
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
