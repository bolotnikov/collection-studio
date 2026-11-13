import { z } from 'zod';
import { VisualCatalogContracts } from './VisualCatalogContracts';
import { KnowledgeContracts } from './KnowledgeContracts';

export class KnowledgeEditorContracts {
  static readonly kind = z.enum(['card', 'set', 'category']);
  static readonly edit = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('card'), id: z.string(), observation: VisualCatalogContracts.observation }),
    z.object({ kind: z.literal('set'), id: z.string(), analysis: VisualCatalogContracts.setAnalysis }),
    z.object({
      kind: z.literal('category'),
      id: z.string(),
      profile: VisualCatalogContracts.categoryProfile,
    }),
  ]);
  static readonly import = z.object({
    kind: z.enum(['set', 'category']),
    title: z.string().min(2),
    category: VisualCatalogContracts.category.optional(),
    cardIds: z.array(z.string()).optional(),
  });
  static readonly overlay = z.object({
    version: z.literal(1),
    removed: z.array(z.object({ kind: KnowledgeEditorContracts.kind, id: z.string() })).default([]),
    edits: z.array(KnowledgeEditorContracts.edit).default([]),
    cleanSets: z.array(KnowledgeContracts.cleanSet).default([]),
    images: z.array(KnowledgeContracts.image).default([]),
    sets: z.array(VisualCatalogContracts.set).default([]),
    categories: z.array(VisualCatalogContracts.categoryProfile).default([]),
  });
}
export type KnowledgeEdit = z.infer<typeof KnowledgeEditorContracts.edit>;
export type KnowledgeKind = z.infer<typeof KnowledgeEditorContracts.kind>;
export type KnowledgeOverlay = z.infer<typeof KnowledgeEditorContracts.overlay>;

export type KnowledgeSnapshot = {
  catalog: import('./VisualCatalogContracts').VisualCatalog;
  library: import('./StyleContracts').LibraryItem[];
  cleanSets: NonNullable<import('./KnowledgeContracts').SourceKnowledge['cleanSets']>;
  job: import('./CatalogState').CatalogState;
};
