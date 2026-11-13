import { z } from 'zod';
import { VisualCatalogContracts } from './VisualCatalogContracts';
import defaults from '../../resources/catalog-overrides.json';

export class CatalogCurationContracts {
  static readonly decision = z.object({
    id: z.string(),
    sha256: z.string().length(64),
    category: VisualCatalogContracts.category,
    characterCount: z.number().int().min(0).max(10),
    reason: z.string().min(10),
    evidenceSourceSha256: z.string().length(64),
    slot: z.number().int().min(1).max(10),
  });
  static readonly values = z
    .object({ version: z.literal(1), decisions: z.array(CatalogCurationContracts.decision) })
    .parse(defaults);
}
export type CatalogDecision = z.infer<typeof CatalogCurationContracts.decision>;
