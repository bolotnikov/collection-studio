import { CatalogCurator } from '../src/domain/CatalogCurator';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { PromptCatalog } from '../src/application/prompts/PromptCatalog';
import { CatalogSyncService } from '../src/application/knowledge/CatalogSyncService';
import { CatalogInputLoader } from '../src/infrastructure/CatalogInputLoader';
import { CodexCatalogAnalysis } from '../src/infrastructure/CodexCatalogAnalysis';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { VisualCatalogStore } from '../src/infrastructure/VisualCatalogStore';
import { VisualCatalogContracts } from '../src/shared/VisualCatalogContracts';
import { VisualCatalogRules } from '../src/domain/VisualCatalogRules';
import defaults from '../resources/prompts/catalog.json';

class KnowledgeSyncCommand {
  static async run(): Promise<void> {
    const mode = z.enum(['cards', 'sets', 'sync']).parse(process.argv[2] ?? 'sync');
    const model = process.argv.find((arg) => arg.startsWith('--model='))?.slice(8) ?? 'gpt-6.1-sol';
    const resources = path.resolve(process.env.CATALOG_RESOURCES_DIR ?? 'resources');
    const cache = path.resolve(process.env.CATALOG_CACHE_DIR ?? 'output/catalog/cache');
    const prompts = new PromptCatalog(defaults, defaults);
    const input = await new CatalogInputLoader(resources).load(model, prompts.values);
    const executable = await CodexRunner.locate();
    await CodexRunner.check(executable);
    let cancelled = false;
    process.once('SIGINT', () => {
      cancelled = true;
      console.log('Cancellation requested; retaining completed observations.');
    });
    const publication = new VisualCatalogStore(path.join(resources, 'knowledge/visual-catalog.json'));
    let seed: import('../src/shared/VisualCatalogContracts').VisualCatalog | undefined;
    try {
      seed = await publication.read();
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    const adapter = new CodexCatalogAnalysis(
      new CodexRunner(executable, path.join(cache, 'jobs'), model),
      resources,
      cache,
      prompts,
      CatalogInputLoader.rules(),
      seed,
    );
    const progress = (stage: string, done: number, total: number) =>
      console.log(`${stage}: ${done}/${total}`);
    if (mode === 'sync') {
      await new CatalogSyncService(adapter, publication).sync(input, () => cancelled, progress);
    } else {
      const stage = path.join(cache, 'cards-stage.json');
      if (mode === 'cards') {
        const cards = CatalogCurator.apply(
          await adapter.cards(
            input,
            () => cancelled,
            (done, total) => progress('cards', done, total),
          ),
          input.decisions,
        );
        await fs.mkdir(cache, { recursive: true });
        await fs.writeFile(stage, JSON.stringify({ dependencyHash: input.dependencyHash, cards }));
        console.log('Card stage saved; full catalog is published only after set analysis.');
        return;
      }
      const saved = z
        .object({
          dependencyHash: z.literal(input.dependencyHash),
          cards: VisualCatalogContracts.card.array(),
        })
        .parse(JSON.parse(await fs.readFile(stage, 'utf8')));
      const sets = await adapter.sets(
        input,
        saved.cards,
        () => cancelled,
        (done, total) => progress('sets', done, total),
      );
      if (cancelled) throw new Error('Knowledge synchronization cancelled.');
      const catalog = VisualCatalogContracts.catalog.parse({
        version: 'visual-catalog-v1',
        model,
        dependencyHash: input.dependencyHash,
        createdAt: new Date().toISOString(),
        categoryProfiles: await adapter.categories(input, () => cancelled),
        categoryAnalysisKey: adapter.categoryRevision(input),
        cards: saved.cards,
        sets,
        documents: input.knowledge.documents,
        images: input.knowledge.images,
        categoryExamples: input.knowledge.images.filter((image) => image.role === 'category-example'),
      });
      VisualCatalogRules.validate(
        catalog,
        input.library.map((card) => card.id),
      );
      await publication.publish(catalog);
    }
    console.log('Published validated visual catalog. No images were generated.');
  }
}
void KnowledgeSyncCommand.run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Knowledge synchronization failed');
  process.exitCode = 1;
});
