import { z } from 'zod';
import defaults from '../../resources/position-planning.json';
import type { SlotPlan } from '../shared/CompositionPlanningContracts';
import type { VisualCatalog } from '../shared/VisualCatalogContracts';
import { CollectionCorpusStatistics } from './CollectionCorpusStatistics';

/** Derive positional constraints from observed membership, without changing card classification. */
export class SourcePositionPlanner {
  private readonly config = z
    .object({
      version: z.literal('source-position-v1'),
      minimumMixedSets: z.number().int().min(3),
      requireUnanimousGoldSuffix: z.literal(true),
      prompt: z.string().min(20),
    })
    .parse(defaults);
  apply(plan: SlotPlan, catalog: VisualCatalog): SlotPlan {
    const evidence = new CollectionCorpusStatistics(catalog).positionStatistics().goldSuffix;
    if (
      evidence.mixedSetCount < this.config.minimumMixedSets ||
      evidence.supportingSetCount !== evidence.mixedSetCount
    )
      return plan;
    const slots = [
      ...plan.slots.filter((slot) => slot.target.category !== '5'),
      ...plan.slots.filter((slot) => slot.target.category === '5'),
    ].map((slot, index) => ({ ...slot, index, target: { ...slot.target, index } }));
    const result = {
      slots,
      composition: {
        ...plan.composition,
        positionPolicy: {
          version: this.config.version,
          goldSuffix: true as const,
          mixedSetCount: evidence.mixedSetCount,
          supportingSetCount: evidence.supportingSetCount,
          sourceSetIds: evidence.sourceSetIds,
        },
        targets: slots.map((slot) => slot.target),
      },
    };
    SourcePositionPlanner.validate(result.composition);
    return result;
  }
  static validate(composition: SlotPlan['composition']): void {
    const policy = composition.positionPolicy;
    if (!policy) return;
    if (
      policy.mixedSetCount < 3 ||
      policy.supportingSetCount !== policy.mixedSetCount ||
      policy.sourceSetIds.length !== policy.mixedSetCount ||
      new Set(policy.sourceSetIds).size !== policy.sourceSetIds.length ||
      policy.sourceSetIds.some((id) => !composition.sourceSetIds.includes(id))
    )
      throw new Error('Invalid source positional evidence.');
    const goldCount = composition.targets.filter((target) => target.category === '5').length;
    if (composition.targets.some((target) => (target.category === '5') !== target.index >= 10 - goldCount))
      throw new Error('Gold cards must occupy the final consecutive slots.');
  }
}
