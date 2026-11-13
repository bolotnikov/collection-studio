import path from 'node:path';
import type { Profile } from '../shared/Contracts';
import type { SlotPlan } from '../shared/CompositionPlanningContracts';

/** Reuse catalogue representatives for the planned joint patterns. */
export class SlotPlanningReferences {
  static select(root: string | undefined, profile: Profile, plans: SlotPlan[], fallback: string[]): string[] {
    if (!root) return fallback;
    const references: string[] = [];
    for (const plan of plans)
      for (const slot of plan.slots) {
        for (const id of slot.target.selectedReferenceIds ?? [slot.sourceCardId]) {
          const item =
            profile.library?.find((item) => item.id === id) ??
            profile.references.find((item) => item.id === id);
          if (!item) throw new Error('Planned slot reference is unavailable.');
          references.push(path.join(root, item.filename));
        }
      }
    return [...new Set(references)];
  }
}
