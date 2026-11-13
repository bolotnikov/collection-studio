import { CompositionPlanningService } from './CompositionPlanningService';
import { Contracts, type Brief, type Plan, type Profile, type Run } from '../shared/Contracts';
import type { GenerationPort } from './GenerationPort';
import type { PlanningPolicy, PlanReview } from '../shared/SetContract';
import { ProductionRules } from '../domain/ProductionRules';
import { SetComposition } from '../domain/SetComposition';
import { BatchSubjectRules } from '../domain/BatchSubjectRules';

/** Persist each proposal and review before advancing; resume partially reviewed proposals. */
export class SetPlanningService {
  constructor(private readonly referenceRoot?: string) {}
  async plan(
    provider: GenerationPort,
    brief: Brief,
    profile: Profile,
    references: string[],
    policy: PlanningPolicy,
    history: NonNullable<Run['planHistory']>,
    checkpoint: (message?: string) => Promise<void>,
    stopped: () => boolean,
    state: Pick<Run, 'compositionDraft' | 'planningSessionStart'> = {},
  ): Promise<{
    plan: Plan;
    reviews: PlanReview[];
    warnings?: string[];
    validation?: 'deterministic-slots-first-v1';
  } | null> {
    while (!stopped()) {
      let entry = history.length > (state.planningSessionStart ?? 0) ? history.at(-1) : undefined;
      if (entry && this.accepted(entry, policy)) return { plan: entry.plan, reviews: entry.reviews };
      const partial = entry && !entry.errors.length && entry.reviews.length < entry.plan.variants.length;
      if (!partial) {
        if (history.length - (state.planningSessionStart ?? 0) >= 1 + policy.maxPlanRepairs)
          return this.fallback(history, policy);
        const previous = entry ?? history.at(-1);
        const correction = previous
          ? JSON.stringify({
              errors: previous.errors,
              reviews: previous.reviews,
              ...(profile.subjectUniqueness === 'batch-unique-v1'
                ? { previousDesign: previous.compositionDraft?.assignedSubjects }
                : {}),
            })
          : '';
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
              this.referenceRoot,
              history.length - (state.planningSessionStart ?? 0) >= policy.maxPlanRepairs,
            )
          : { plan: await provider.plan(brief, profile, references, correction), errors: [] };
        if (!result) return null;
        const { plan, errors } = result;
        entry = {
          at: new Date().toISOString(),
          plan,
          reviews: [],
          errors,
          ...(profile.compositionPlanning?.version === 'slots-first-v1'
            ? { validation: 'deterministic-slots-first-v1' as const }
            : {}),
          ...(profile.compositionPlanning
            ? { compositionDraft: structuredClone(state.compositionDraft) }
            : {}),
        };

        try {
          if (entry.errors.length) throw new Error(entry.errors[0]);
          Contracts.productionPlan.parse(plan);
          ProductionRules.validatePlan(plan, brief.variants, Boolean(brief.includeGold));
          if (profile.subjectUniqueness === 'batch-unique-v1' && brief.variants > 1)
            BatchSubjectRules.validate(plan);
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
      if (entry.validation === 'deterministic-slots-first-v1')
        return { plan: entry.plan, reviews: entry.reviews, validation: entry.validation };
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
          if (ProductionRules.allowsWarnings(policy)) return this.fallback(history, policy);
          throw error;
        }
        await checkpoint();
      }
    }
    return null;
  }
  private fallback(history: NonNullable<Run['planHistory']>, policy: PlanningPolicy) {
    if (!ProductionRules.allowsWarnings(policy)) return null;
    const entry = history
      .filter((entry) => !entry.errors.length && entry.plan.variants.length)
      .map((entry, index) => ({
        entry,
        index,
        score:
          entry.reviews.reduce(
            (sum, review) =>
              sum + review.thematicCohesion + review.visualDiversity + review.styleFaithfulness,
            0,
          ) / entry.plan.variants.length,
      }))
      .sort((a, b) => b.score - a.score || b.index - a.index)[0]?.entry;
    if (!entry) return null;
    return {
      plan: entry.plan,
      reviews: entry.reviews,
      validation: entry.validation,
      warnings: [
        entry.reviewError ||
          entry.reviews.flatMap((review) => review.findings).join('; ') ||
          'Independent plan review did not pass. Continuing with the strongest structurally valid plan.',
      ],
    };
  }
  private accepted(entry: NonNullable<Run['planHistory']>[number], policy: PlanningPolicy): boolean {
    return (
      !entry.errors.length &&
      entry.reviews.length === entry.plan.variants.length &&
      entry.reviews.every((review) => ProductionRules.acceptsPlan(review, policy.minimumPlanScore))
    );
  }
}
