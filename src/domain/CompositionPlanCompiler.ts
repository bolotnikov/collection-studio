import { Contracts, type Plan, type Profile } from '../shared/Contracts';
import type { CompositionBlueprint, CompositionDetails } from '../shared/CompositionPlanningContracts';
import { SubjectAssignment } from './SubjectAssignment';

/** Descriptive model output cannot overwrite subjects, slot constraints or canonical rendering. */
export class CompositionPlanCompiler {
  static compile(
    blueprints: CompositionBlueprint[],
    details: CompositionDetails,
    profile: Profile,
    allowSubjectWarnings = false,
  ): Plan {
    const config = profile.compositionPlanning;
    if (!config) throw new Error('Composition planner configuration missing.');
    if (
      details.variants.length !== blueprints.length ||
      new Set(details.variants.map((variant) => variant.variantIndex)).size !== blueprints.length
    )
      throw new Error('Descriptive output must cover every assigned set exactly once.');
    return Contracts.preparedProductionPlan.parse({
      variants: blueprints.map((blueprint, variantIndex) => {
        const described = details.variants.find((variant) => variant.variantIndex === variantIndex);
        if (!described || new Set(described.cards.map((card) => card.index)).size !== 10)
          throw new Error('Descriptive output must cover all ten assigned slots exactly once.');
        const allocation = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
        for (const slot of blueprint.slots) allocation[slot.target.category]++;
        if (
          !allowSubjectWarnings &&
          blueprint.slots.some((slot) => !SubjectAssignment.compatible(slot.subject, slot.target))
        )
          throw new Error('Subject composition constraints are incompatible with its assigned slot.');
        return {
          title: blueprint.title,
          concept: blueprint.concept,
          artContract: {
            warnings: blueprint.warnings,
            version: 'set-contract-v1',
            story: blueprint.concept,
            categoryAllocation: allocation,
            rendering: profile.rules.join('\n'),
            lighting: described.lighting ?? config.prompts.lighting,
            materialTreatment: described.materialTreatment ?? config.prompts.materialTreatment,
            paletteRhythm: described.paletteRhythm,
            compositionRhythm: blueprint.composition.rationale,
            avoid: [config.prompts.avoid],
            composition: blueprint.composition,
          },
          cards: blueprint.slots.map((slot) => {
            const detail = described.cards.find((card) => card.index === slot.index);
            if (!detail) throw new Error('Missing slot description.');
            return {
              subject: slot.subject.subject,
              subjectType: slot.subject.subjectType,
              role: slot.subject.role,
              category: slot.target.category,
              description: detail.description,
              visual: {
                materials: slot.subject.materials,
                silhouette: slot.subject.silhouette,
                paletteRole: detail.paletteRole,
                composition: detail.composition,
              },
            };
          }),
        };
      }),
    });
  }
}
