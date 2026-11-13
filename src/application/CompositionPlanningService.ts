import { AggregateCompositionPlanner } from '../domain/AggregateCompositionPlanner';
import { SourceCompositionPlanner } from '../domain/SourceCompositionPlanner';
import { CompositionPlanCompiler } from '../domain/CompositionPlanCompiler';
import type { Brief, Plan, Profile, Run } from '../shared/Contracts';
import { CompositionPlanningContracts } from '../shared/CompositionPlanningContracts';
import type { CompositionPlanningPort } from './CompositionPlanningPort';

/** Checkpoint each expensive semantic phase; transport retries reuse the exact assignment. */
export class CompositionPlanningService {
  async propose(
    provider: CompositionPlanningPort,
    brief: Brief,
    profile: Profile,
    references: string[],
    correction: string,
    attempt: number,
    state: Pick<Run, 'compositionDraft'>,
    checkpoint: (message?: string) => Promise<void>,
    stopped: () => boolean,
  ): Promise<{ plan: Plan; errors: string[] } | null> {
    if (!profile.visualCatalog || !profile.compositionPlanning)
      throw new Error('Prepared composition planning is unavailable.');
    const originalIds = profile.library
      ?.filter((item) => item.origin === 'anchor' && item.approved)
      .map((item) => item.id);
    const aggregate = profile.compositionPlanning.version === 'aggregate-pattern-v1';
    const weights = profile.compositionPlanning.aggregation;
    if (aggregate && !weights) throw new Error('Aggregate composition policy missing.');
    const planner =
      aggregate && weights
        ? new AggregateCompositionPlanner(weights, originalIds)
        : new SourceCompositionPlanner(profile.compositionPlanning, originalIds);
    if (planner instanceof AggregateCompositionPlanner)
      planner.profile(profile.visualCatalog, Boolean(brief.includeGold));
    else if (!planner.prototypes(profile.visualCatalog, Boolean(brief.includeGold)).length)
      throw new Error('No supported source prototype for this historical planning protocol.');
    if (state.compositionDraft?.attempt !== attempt) state.compositionDraft = { attempt };
    const draft = state.compositionDraft;
    if (!draft.concepts) {
      await checkpoint('Choosing the set concept and subjects');
      draft.concepts = CompositionPlanningContracts.concepts.parse(
        await provider.proposeSubjects(brief, profile, references, correction),
      );
      await checkpoint(
        aggregate
          ? 'Assigning subjects to aggregate composition slots'
          : 'Matching subjects to source composition slots',
      );
    }
    if (stopped()) return null;
    if (!draft.blueprints) {
      try {
        if (draft.concepts.variants.length !== brief.variants)
          throw new Error('Semantic proposal does not match the requested set count.');
        draft.blueprints =
          planner instanceof AggregateCompositionPlanner
            ? planner.select(draft.concepts.variants, profile.visualCatalog, Boolean(brief.includeGold))
            : planner.select(
                draft.concepts.variants,
                profile.visualCatalog,
                Boolean(brief.includeGold),
                profile.knowledgeContext?.images
                  .filter((image) => image.role === 'collection-example')
                  .map((image) => image.id),
              );
      } catch (error) {
        return {
          plan: { variants: [] },
          errors: [error instanceof Error ? error.message : 'Invalid semantic proposal'],
        };
      }
      await checkpoint();
    }
    if (stopped()) return null;
    await checkpoint('Describing the assigned card slots');
    const details = CompositionPlanningContracts.details.parse(
      await provider.describeComposition(brief, profile, draft.blueprints, references, correction),
    );
    try {
      return { plan: CompositionPlanCompiler.compile(draft.blueprints, details, profile), errors: [] };
    } catch (error) {
      return {
        plan: { variants: [] },
        errors: [error instanceof Error ? error.message : 'Invalid composition description'],
      };
    }
  }
}
