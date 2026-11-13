import { z } from 'zod';
import { CompositionContract } from './CompositionContract';

/** Persisted proposals and reviews; deterministic acceptance lives in domain rules. */
export class SetContract {
  static readonly category = z.enum(['1', '2', '3', '4', '5']);
  static readonly visual = z.object({
    materials: z.array(z.string().min(1)).min(1),
    silhouette: z.string().min(3),
    paletteRole: z.string().min(3),
    composition: z.string().min(3),
  });
  static readonly art = z.object({
    warnings: z.array(z.string()).optional(),
    version: z.literal('set-contract-v1'),
    story: z.string().min(10),
    categoryAllocation: z.object({
      '1': z.number().int().min(1).max(7),
      '2': z.number().int().min(1).max(7),
      '3': z.number().int().min(1).max(7),
      '4': z.number().int().min(1).max(7),
      '5': z.number().int().min(0).max(6).optional(),
    }),
    rendering: z.string().min(10),
    lighting: z.string().min(10),
    materialTreatment: z.string().min(10),
    paletteRhythm: z.string().min(10),
    compositionRhythm: z.string().min(10),
    avoid: z.array(z.string().min(3)).min(1),
    composition: CompositionContract.set.optional(),
  });
  // Decode archived evidence without reintroducing the removed execution stage.
  static readonly persistedArt = SetContract.art.extend({
    pilotIndex: z.number().int().min(0).max(9).optional(),
    pilotRationale: z.string().optional(),
  });
  static readonly review = z.object({
    passed: z.boolean(),
    thematicCohesion: z.number().min(1).max(5),
    visualDiversity: z.number().min(1).max(5),
    styleFaithfulness: z.number().min(1).max(5),
    categoryAllocationValid: z.boolean(),
    producerRequirementsMet: z.boolean(),
    findings: z.array(z.string()),
    correction: z.string(),
  });
  static readonly planningPolicy = z.object({
    qualityMode: z.enum(['strict-v1', 'best-effort-v1']).optional(),
    maxPlanRepairs: z.number().int().min(0).max(3),
    minimumPlanScore: z.number().min(4).max(5),
    productionConcurrency: z.number().int().min(1).max(2),
  });
}
export type ArtContract = z.infer<typeof SetContract.art>;
export type PlanReview = z.infer<typeof SetContract.review>;
export type PlanningPolicy = z.infer<typeof SetContract.planningPolicy>;
