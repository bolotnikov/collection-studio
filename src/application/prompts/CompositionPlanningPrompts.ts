import { AggregateCompositionPlanner } from '../../domain/AggregateCompositionPlanner';
import { PromptCatalog } from './PromptCatalog';
import { PromptBuilder } from '../PromptBuilder';
import type { Brief, Profile } from '../../shared/Contracts';
import {
  CompositionPlanningContracts,
  type CompositionBlueprint,
} from '../../shared/CompositionPlanningContracts';
import { SourceCompositionPlanner } from '../../domain/SourceCompositionPlanner';
import protocol from '../../../resources/planning-protocol.json';
import slotPrompts from '../../../resources/slot-first-prompts.json';
import rhythm from '../../../resources/set-rhythm.json';
import positions from '../../../resources/position-planning.json';
import type { SlotPlan } from '../../shared/CompositionPlanningContracts';

export class CompositionPlanningPrompts {
  static design(
    brief: Brief,
    profile: Profile,
    slots: SlotPlan[],
    correction: string,
    references: string[],
  ): string {
    return (
      new PromptCatalog(slotPrompts, slotPrompts).render('design', {
        sourceContext: PromptBuilder.sourceContext(PromptBuilder.planningContext(profile, references)),
        setCount: brief.variants,
        rules: profile.rules,
        categories: profile.categories,
        brief,
        slots,
        correction,
      }) +
      (slots.some((plan) => plan.composition.rhythm) ? '\n' + rhythm.prompt : '') +
      (slots.some((plan) => plan.composition.positionPolicy) ? '\n' + positions.prompt : '')
    );
  }
  static subjects(brief: Brief, profile: Profile, correction: string): string {
    if (!profile.compositionPlanning || !profile.visualCatalog)
      throw new Error('Prepared composition context missing.');
    const config = profile.compositionPlanning;
    const originalIds = profile.library
      ?.filter((item) => item.origin === 'anchor' && item.approved)
      .map((item) => item.id);
    const prototypes =
      config.version === 'aggregate-pattern-v1' && config.aggregation
        ? new AggregateCompositionPlanner(config.aggregation, originalIds).summary(
            profile.visualCatalog,
            Boolean(brief.includeGold),
          )
        : new SourceCompositionPlanner(config, originalIds)
            .prototypes(profile.visualCatalog, Boolean(brief.includeGold))
            .map(({ set, slots }) => ({
              id: set.id,
              theme: set.analysis.theme,
              slots: slots.map((slot) => ({
                index: slot.index,
                category: slot.target.category,
                required: slot.target.required,
              })),
            }));
    return (
      this.catalog(profile).render('subjects', {
        sourceContext: PromptBuilder.sourceContext(profile),
        setCount: brief.variants,
        rules: profile.rules,
        categories: profile.categories,
        brief,
        correction,
        prototypes,
      }) +
      '\n' +
      protocol.subjects
    );
  }
  static details(
    brief: Brief,
    profile: Profile,
    blueprints: CompositionBlueprint[],
    correction: string,
  ): string {
    return (
      this.catalog(profile).render('details', {
        sourceContext: PromptBuilder.sourceContext(profile),
        rules: profile.rules,
        categories: profile.categories,
        brief,
        blueprints,
        correction,
      }) +
      '\n' +
      protocol.details
    );
  }
  private static catalog(profile: Profile): PromptCatalog {
    if (!profile.compositionPlanning) throw new Error('Composition planner configuration missing.');
    return new PromptCatalog(
      profile.compositionPlanning.prompts,
      CompositionPlanningContracts.defaults.prompts,
    );
  }
}
