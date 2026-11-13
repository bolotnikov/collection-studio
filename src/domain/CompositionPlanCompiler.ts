import { Contracts, type Plan, type Profile } from '../shared/Contracts';
import type { CompositionBlueprint, CompositionDetails } from '../shared/CompositionPlanningContracts';

/** Descriptive model output cannot overwrite subjects, slot constraints or canonical rendering. */
export class CompositionPlanCompiler {
  static compile(blueprints: CompositionBlueprint[], details: CompositionDetails, profile: Profile): Plan {
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
        const pilot = [...blueprint.slots].sort(
          (a, b) =>
            Number(b.target.category === '3' || b.target.category === '4') -
              Number(a.target.category === '3' || a.target.category === '4') ||
            b.subject.materials.length - a.subject.materials.length ||
            a.index - b.index,
        )[0];
        if (!pilot) throw new Error('Pilot slot missing.');
        return {
          title: blueprint.title,
          concept: blueprint.concept,
          artContract: {
            version: 'set-contract-v1',
            story: blueprint.concept,
            categoryAllocation: allocation,
            rendering: profile.rules.join('\n'),
            lighting: config.prompts.lighting,
            materialTreatment: config.prompts.materialTreatment,
            paletteRhythm: described.paletteRhythm,
            compositionRhythm: blueprint.composition.rationale,
            avoid: [config.prompts.avoid],
            pilotIndex: pilot.index,
            pilotRationale: config.prompts.pilot,
            composition: blueprint.composition,
          },
          cards: blueprint.slots.map((slot) => {
            const detail = described.cards.find((card) => card.index === slot.index);
            if (!detail) throw new Error('Missing slot description.');
            return {
              subject: slot.subject.subject,
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
