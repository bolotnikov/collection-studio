import type { CatalogCard, CatalogSet, VisualCatalog } from '../../shared/VisualCatalogContracts';
import type { LibraryItem } from '../../shared/StyleContracts';
import type { SourceKnowledge } from '../../shared/KnowledgeContracts';

export interface CatalogInput {
  model: string;
  rules: unknown;
  decisions: import('../../shared/CatalogCurationContracts').CatalogDecision[];
  dependencyHash: string;
  library: LibraryItem[];
  knowledge: SourceKnowledge;
  memberships: { id: string; cards: CatalogSet['cards'] }[];
}
export interface CatalogAnalysisPort {
  categoryRevision(input: CatalogInput): string;
  categories(
    input: CatalogInput,
    stopped: () => boolean,
  ): Promise<
    import('zod').z.infer<
      typeof import('../../shared/VisualCatalogContracts').VisualCatalogContracts.categoryProfile
    >[]
  >;
  cards(
    input: CatalogInput,
    stopped: () => boolean,
    progress: (done: number, total: number, stage?: 'cards' | 'patterns') => void,
  ): Promise<CatalogCard[]>;
  sets(
    input: CatalogInput,
    cards: CatalogCard[],
    stopped: () => boolean,
    progress: (done: number, total: number) => void,
  ): Promise<CatalogSet[]>;
}
export interface CatalogPublicationPort {
  publish(catalog: VisualCatalog): Promise<void>;
}
