import { z } from 'zod';
import { CompositionContract } from './CompositionContract';

/** Explicit user revisions overlay immutable planning and image evidence. */
export class SlotTagContracts {
  static readonly facets = CompositionContract.requirements.omit({ characterCount: true }).strict();
  static readonly axis = SlotTagContracts.facets.keyof();
  static readonly edit = z
    .object({
      expectedRevision: z.number().int().nonnegative(),
      facets: SlotTagContracts.facets,
    })
    .strict();
  static readonly revision = z.object({
    version: z.literal('manual-slot-tags-v1'),
    revision: z.number().int().positive(),
    at: z.string(),
    facets: SlotTagContracts.facets,
    changedFacets: z.array(SlotTagContracts.axis),
    referenceIds: z.array(z.string()).min(2).max(8),
  });
}
export type SlotTagEdit = z.infer<typeof SlotTagContracts.edit>;
export type SlotTagFacets = z.infer<typeof SlotTagContracts.facets>;
export type SlotTagRevision = z.infer<typeof SlotTagContracts.revision>;
