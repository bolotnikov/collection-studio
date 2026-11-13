import { CatalogCurator } from '../../domain/CatalogCurator';
import type { CatalogAnalysisPort, CatalogInput, CatalogPublicationPort } from './CatalogAnalysisPort';
import { VisualCatalogContracts } from '../../shared/VisualCatalogContracts';
import { VisualCatalogRules } from '../../domain/VisualCatalogRules';

/** Only a fully validated revision replaces the published catalog. */
export class CatalogSyncService {
  private busy = false;
  constructor(
    private readonly analysis: CatalogAnalysisPort,
    private readonly publication: CatalogPublicationPort,
  ) {}
  async sync(
    input: CatalogInput,
    stopped: () => boolean = () => false,
    progress: (stage: string, done: number, total: number) => void = () => {},
  ): Promise<void> {
    if (this.busy) throw new Error('Knowledge synchronization is already running.');
    this.busy = true;
    try {
      VisualCatalogRules.validateSources(input.library, input.knowledge, input.memberships);
      const categoryProfiles = await this.analysis.categories(input, stopped);
      const cards = CatalogCurator.apply(
        await this.analysis.cards(input, stopped, (done, total, stage = 'cards') =>
          progress(stage, done, total),
        ),
        input.decisions,
      );
      if (stopped()) throw new Error('Knowledge synchronization cancelled.');
      const sets = await this.analysis.sets(input, cards, stopped, (done, total) =>
        progress('sets', done, total),
      );
      if (stopped()) throw new Error('Knowledge synchronization cancelled.');
      const catalog = VisualCatalogContracts.catalog.parse({
        version: 'visual-catalog-v1',
        model: input.model,
        dependencyHash: input.dependencyHash,
        createdAt: new Date().toISOString(),
        categoryProfiles,
        categoryAnalysisKey: this.analysis.categoryRevision(input),
        cards,
        sets,
        documents: input.knowledge.documents,
        images: input.knowledge.images,
        categoryExamples: input.knowledge.images.filter((image) => image.role === 'category-example'),
      });
      VisualCatalogRules.validate(
        catalog,
        input.library.map((card) => card.id),
      );
      await this.publication.publish(catalog);
    } finally {
      this.busy = false;
    }
  }
}
