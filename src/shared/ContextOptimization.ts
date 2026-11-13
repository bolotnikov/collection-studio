import { z } from 'zod';
import defaults from '../../resources/context-optimization.json';

export class ContextOptimization {
  static readonly schema = z
    .object({
      version: z.literal('prepared-context-v1'),
      minimumSets: z.number().int().min(2).max(4),
      maximumSets: z.number().int().min(2).max(4),
      categoryWeight: z.number().positive(),
      patternWeight: z.number().positive(),
      semanticWeight: z.number().nonnegative(),
      guidance: z.string().min(10),
    })
    .refine((value) => value.maximumSets >= value.minimumSets, 'Comparison set limits are inconsistent.');
  static readonly defaults = ContextOptimization.schema.parse(defaults);
}
export type ContextOptimizationConfig = z.infer<typeof ContextOptimization.schema>;
