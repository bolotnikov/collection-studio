import { VisualPatterns } from '../domain/VisualPatterns';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { CatalogCard } from '../shared/VisualCatalogContracts';
import { VisualCatalogContracts } from '../shared/VisualCatalogContracts';
import { CatalogPolicy } from '../shared/CatalogPolicy';
import type { CodexRunner } from './CodexRunner';
import { PreparationCache } from './PreparationCache';
import type { PromptCatalog } from '../application/prompts/PromptCatalog';

/** A separately cached visual pass for geometry and placement; never derives tags from subject nouns. */
export class CodexPatternAnalysis {
  constructor(
    private readonly runner: CodexRunner,
    private readonly resources: string,
    private readonly cacheRoot: string,
    private readonly prompts: PromptCatalog,
  ) {}
  async enrich(
    cards: CatalogCard[],
    model: string,
    stopped: () => boolean,
    progress: (done: number, total: number) => void,
  ): Promise<CatalogCard[]> {
    const result: CatalogCard[] = [];
    const facets = VisualCatalogContracts.facets.pick({ backdrop: true, pattern: true }).extend({
      subjectPosition: VisualCatalogContracts.facets.shape.subjectPosition.unwrap(),
      backgroundColor: VisualCatalogContracts.facets.shape.backgroundColor.unwrap(),
    });
    for (let start = 0; start < cards.length; start += CatalogPolicy.values.cardAnalysisBatchSize) {
      if (stopped()) throw new Error('Knowledge synchronization cancelled.');
      const batch = cards.slice(start, start + CatalogPolicy.values.cardAnalysisBatchSize);
      const key = JSON.stringify([
        model,
        this.prompts.values.patterns,
        batch.map(({ id, sha256 }) => ({ id, sha256 })),
      ]);
      const digest = createHash('sha256').update(key).digest('hex');
      const schema = z.object({
        entries: z.array(z.object({ id: z.enum(batch.map((card) => card.id)), facets })).length(batch.length),
      });
      const value = await new PreparationCache(path.join(this.cacheRoot, 'patterns')).getOrCreate(
        key,
        schema,
        async () => {
          if (batch.every((card) => card.patternAnalysisKey === digest))
            return {
              entries: batch.map((card) => ({ id: card.id, facets: facets.parse(card.observation.facets) })),
            };
          const files = await Promise.all(
            batch.map(async (card) => {
              const file = path.resolve(this.resources, 'references', card.filename);
              if (
                !file.startsWith(path.resolve(this.resources, 'references') + path.sep) ||
                createHash('sha256')
                  .update(await fs.readFile(file))
                  .digest('hex') !== card.sha256
              )
                throw new Error('Pattern source integrity mismatch.');
              return file;
            }),
          );
          return (
            await this.runner.run(
              this.prompts.render('patterns', { images: batch.map((card) => ({ id: card.id })) }),
              schema,
              files,
            )
          ).value;
        },
      );
      if (new Set(value.entries.map((entry) => entry.id)).size !== batch.length)
        throw new Error('Pattern analysis returned duplicate or missing card IDs.');
      for (const card of batch) {
        const entry = value.entries.find((entry) => entry.id === card.id);
        if (!entry) throw new Error('Pattern observation missing.');
        VisualPatterns.validate(entry.facets);
        result.push(
          VisualCatalogContracts.card.parse({
            ...card,
            patternAnalysisKey: digest,
            observation: { ...card.observation, facets: { ...card.observation.facets, ...entry.facets } },
          }),
        );
      }
      progress(result.length, cards.length);
    }
    return result;
  }
}
