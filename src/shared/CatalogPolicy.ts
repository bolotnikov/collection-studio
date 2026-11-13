import { z } from 'zod';
import defaults from '../../resources/catalog-policy.json';

export class CatalogPolicy {
  static readonly schema = z.object({
    minimumReferenceConfidence: z.number().min(0.5).max(1),
    minimumCompositionReferences: z.number().int().min(2).max(4),
    cardAnalysisBatchSize: z.number().int().min(1).max(8),
    setAnalysisConcurrency: z.number().int().min(1).max(2),
  });
  static readonly values = CatalogPolicy.schema.parse(defaults);
}
