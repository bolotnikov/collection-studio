import defaults from '../../resources/retrieval-config.json';
import { z } from 'zod';

export class RetrievalConfiguration {
  static readonly schema = z.object({
    weights: z.object({
      title: z.number().nonnegative(),
      tags: z.number().nonnegative(),
      subject: z.number().nonnegative(),
      materials: z.number().nonnegative(),
      silhouette: z.number().nonnegative(),
      background: z.number().nonnegative(),
      rendering: z.number().nonnegative(),
      lighting: z.number().nonnegative(),
      palette: z.number().nonnegative(),
    }),
    categoryBoost: z.number().nonnegative(),
    anchorBoost: z.number().nonnegative(),
  });
  readonly values;
  constructor(input: unknown = defaults) {
    this.values = RetrievalConfiguration.schema.parse(input);
  }
}
