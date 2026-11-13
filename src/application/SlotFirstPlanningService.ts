import { AggregateCompositionPlanner } from '../domain/AggregateCompositionPlanner';
import { SetRhythmPlanner } from '../domain/SetRhythmPlanner';
import { CompositionPlanCompiler } from '../domain/CompositionPlanCompiler';
import { SubjectAssignment } from '../domain/SubjectAssignment';
import {
  CompositionPlanningContracts,
  type CompositionBlueprint,
} from '../shared/CompositionPlanningContracts';
import type { Brief, Profile, Run } from '../shared/Contracts';
import type { CompositionPlanningPort } from './CompositionPlanningPort';
import { SlotPlanningReferences } from './SlotPlanningReferences';

/** Freeze source-derived slots and reference candidates before the single design-model request. */
export class SlotFirstPlanningService {
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
    root?: string,
    finalAttempt = false,
  ) {
    const config = profile.compositionPlanning,
      catalog = profile.visualCatalog;
    if (!config?.aggregation || !catalog) throw new Error('Prepared aggregate slot planning is unavailable.');
    const originalIds = profile.library
      ?.filter((item) => item.origin === 'anchor' && item.approved)
      .map((item) => item.id);
    const planner = new AggregateCompositionPlanner(config.aggregation, originalIds);
    if (state.compositionDraft?.attempt !== attempt)
      state.compositionDraft = { attempt, slotPlans: state.compositionDraft?.slotPlans };
    const draft = state.compositionDraft;
    if (!draft.slotPlans) {
      const excluded = [...(profile.previousRhythmLayouts ?? [])];
      draft.slotPlans = Array.from({ length: brief.variants }, (_, index) => {
        const plan = planner.planSlots(
          catalog,
          Boolean(brief.includeGold),
          profile.productionRunId ? `${profile.productionRunId}/${index}` : undefined,
          excluded,
        );
        if (plan.composition.rhythm) excluded.push(SetRhythmPlanner.layoutKey(plan.composition));
        return plan;
      });
      await checkpoint('Ten composition slots and reference candidates are ready');
      if (draft.slotPlans.some((plan) => plan.composition.rhythm))
        await checkpoint('Background colors, patterns and grid neighbors validated before model design');
    }
    if (stopped()) return null;
    const inputs = SlotPlanningReferences.select(root, profile, draft.slotPlans, references);
    try {
      if (!draft.assignedSubjects) {
        await checkpoint('Designing the concept and subjects for the fixed slots');
        const schema =
          profile.entityUniqueness === 'depicted-entities-v1'
            ? CompositionPlanningContracts.entityAssignedSubjects
            : profile.subjectUniqueness === 'batch-unique-v1' && brief.variants > 1
              ? CompositionPlanningContracts.batchAssignedSubjects
              : CompositionPlanningContracts.assignedSubjects;
        draft.assignedSubjects = schema.parse(
          await provider.designSlotSet(brief, profile, draft.slotPlans, inputs, correction),
        );
        await checkpoint();
      }
      if (stopped()) return null;
      const designed = draft.assignedSubjects.variants;
      if (
        designed.length !== brief.variants ||
        new Set(designed.map((variant) => variant.variantIndex)).size !== designed.length
      )
        throw new Error('Set design must cover every fixed slot plan exactly once.');
      const blueprints: CompositionBlueprint[] = draft.slotPlans.map((plan, variantIndex) => {
        const design = designed.find((variant) => variant.variantIndex === variantIndex);
        if (!design || new Set(design.cards.map((card) => card.index)).size !== 10)
          throw new Error('Set design must cover all ten slot indices exactly once.');
        const cards = [...design.cards].sort((a, b) => a.index - b.index);
        const concept = { title: design.title, concept: design.concept, candidates: cards };
        SubjectAssignment.validate(concept, Boolean(brief.includeGold));
        const compatible = plan.slots.every((slot) => {
          const subject = cards[slot.index];
          return subject && SubjectAssignment.compatible(subject, slot.target);
        });
        const warnings: string[] = [];
        if (!compatible) {
          if (!profile.allowQualityWarnings || !finalAttempt)
            throw new Error(
              'Subject composition compatibility contradicts one or more fixed slots. Choose different suitable subjects for those slots.',
            );
          const indices = plan.slots
            .filter((slot) => {
              const subject = cards[slot.index];
              return !subject || !SubjectAssignment.compatible(subject, slot.target);
            })
            .map((slot) => slot.index + 1);
          warnings.push(
            `Subject compatibility remains unconfirmed for slots ${indices.join(', ')} after bounded repairs. Original slot patterns and references are unchanged.`,
          );
        }
        return {
          warnings,
          title: design.title,
          concept: design.concept,
          composition: plan.composition,
          slots: plan.slots.map((slot) => {
            const subject = cards[slot.index];
            if (!subject) throw new Error('Missing slot subject.');
            return { ...slot, subject };
          }),
        };
      });
      draft.blueprints = blueprints;
      const details = {
        variants: blueprints.map((blueprint, variantIndex) => {
          const design = designed.find((entry) => entry.variantIndex === variantIndex);
          if (!design) throw new Error('Missing set design.');
          return {
            ...design,
            cards: blueprint.slots.map((slot) => {
              const card = design.cards.find((card) => card.id === slot.subject.id);
              if (!card) throw new Error('Missing subject description.');
              return {
                index: slot.index,
                description: card.description,
                composition: card.composition,
                paletteRole: card.paletteRole,
              };
            }),
          };
        }),
      };
      return {
        plan: CompositionPlanCompiler.compile(
          blueprints,
          details,
          profile,
          finalAttempt && Boolean(profile.allowQualityWarnings),
        ),
        errors: [],
      };
    } catch (error) {
      return {
        plan: { variants: [] },
        errors: [error instanceof Error ? error.message : 'Invalid slot design'],
      };
    }
  }
}
