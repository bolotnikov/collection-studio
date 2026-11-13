import { CodexPatternAnalysis } from './CodexPatternAnalysis';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CatalogAnalysisPort, CatalogInput } from '../application/knowledge/CatalogAnalysisPort';
import {
  VisualCatalogContracts,
  type CatalogCard,
  type CatalogSet,
  type VisualCatalog,
} from '../shared/VisualCatalogContracts';
import { PromptCatalog } from '../application/prompts/PromptCatalog';
import { CodexRunner } from './CodexRunner';
import { PreparationCache } from './PreparationCache';
import { CatalogPolicy } from '../shared/CatalogPolicy';

/** Release/explicit-sync analysis. Ordinary project creation never invokes this adapter. */
export class CodexCatalogAnalysis implements CatalogAnalysisPort {
  private readonly cache: PreparationCache;
  constructor(
    private readonly runner: CodexRunner,
    private readonly resources: string,
    private readonly cacheRoot: string,
    private readonly prompts: PromptCatalog,
    private readonly rules: unknown,
    private readonly seed?: VisualCatalog,
  ) {
    this.cache = new PreparationCache(path.join(cacheRoot, 'tasks'));
  }
  private identity(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
  categoryRevision(input: CatalogInput): string {
    return this.identity([
      input.model,
      input.knowledge.images.filter((image) => image.role === 'category-example'),
      this.rules,
      this.prompts.values.categories,
    ]);
  }
  private async file(root: string, filename: string, sha256: string): Promise<string> {
    const file = path.resolve(root, filename);
    if (!file.startsWith(path.resolve(root) + path.sep))
      throw new Error('Catalog asset path escapes its root.');
    if (
      createHash('sha256')
        .update(await fs.readFile(file))
        .digest('hex') !== sha256
    )
      throw new Error(`Catalog source integrity mismatch: ${filename}`);
    return file;
  }
  async categories(input: CatalogInput, stopped: () => boolean) {
    const examples = input.knowledge.images.filter((image) => image.role === 'category-example');
    if (examples.length !== 5) throw new Error('Five category sheets are required before cataloging.');
    const exemplarFiles = await Promise.all(
      examples.map((image) =>
        this.file(path.join(this.resources, 'knowledge'), image.filename, image.sha256),
      ),
    );
    const schema = z
      .object({
        profiles: z
          .array(
            z.object({
              id: z.enum(examples.map((image) => image.id)),
              category: VisualCatalogContracts.category,
              permittedVariations: z.array(z.string()).min(1),
              cautions: z.array(z.string()),
            }),
          )
          .length(5),
      })
      .superRefine((value, context) => {
        if (
          new Set(value.profiles.map((profile) => profile.id)).size !== 5 ||
          value.profiles.some(
            (profile) =>
              !examples.some((image) => image.id === profile.id && image.category === profile.category),
          )
        )
          context.addIssue({ code: 'custom', message: 'Category profile evidence mismatch.' });
      });
    if (stopped()) throw new Error('Knowledge synchronization cancelled.');
    const categoryIdentity = [input.model, examples, this.rules, this.prompts.values.categories];
    const profiles = await this.cache.getOrCreate(JSON.stringify(categoryIdentity), schema, async () =>
      this.seed?.categoryAnalysisKey === this.categoryRevision(input)
        ? { profiles: this.seed.categoryProfiles }
        : (
            await this.runner.run(
              this.prompts.render('categories', { rules: this.rules, images: examples }),
              schema,
              exemplarFiles,
            )
          ).value,
    );
    return profiles.profiles;
  }
  async cards(
    input: CatalogInput,
    stopped: () => boolean,
    progress: (done: number, total: number, stage?: 'cards' | 'patterns') => void,
  ): Promise<CatalogCard[]> {
    const examples = input.knowledge.images.filter((image) => image.role === 'category-example');
    if (examples.length !== 5) throw new Error('Five category sheets are required before cataloging.');
    const exemplarFiles = await Promise.all(
      examples.map((image) =>
        this.file(path.join(this.resources, 'knowledge'), image.filename, image.sha256),
      ),
    );
    const categoryIdentity = [input.model, examples, this.rules, this.prompts.values.categories];
    const profiles = { profiles: await this.categories(input, stopped) };
    const result: CatalogCard[] = [],
      missing: typeof input.library = [];
    const keys = new Map<string, string>();
    const repairs = new Set<string>();
    for (const item of input.library) {
      await this.file(path.join(this.resources, 'references'), item.filename, item.sha256);
      const key = this.identity([
        'card-observation-v1',
        input.model,
        item.id,
        item.sha256,
        categoryIdentity,
        profiles,
        this.prompts.values.cards,
      ]);
      keys.set(item.id, key);
      const seeded = this.seed?.cards.find(
        (card) =>
          (card.analysisKey === key ||
            card.analysisKey === this.identity([key, 'backdrop-v2', this.prompts.values.backdropReview])) &&
          card.id === item.id &&
          card.sha256 === item.sha256 &&
          card.filename === item.filename,
      );
      if (
        seeded &&
        (seeded.backdropSchemaVersion === 2 ||
          seeded.observation.facets.backdrop !== 'environment' ||
          seeded.observation.facets.contextDensity === 'contextual')
      ) {
        result.push(seeded);
        continue;
      }
      try {
        const card = VisualCatalogContracts.card.parse(
          JSON.parse(await fs.readFile(path.join(this.cacheRoot, 'cards', `${key}.json`), 'utf8')),
        );
        if (card.id !== item.id || card.sha256 !== item.sha256 || card.filename !== item.filename)
          throw new Error('Cached card identity mismatch.');
        if (
          card.backdropSchemaVersion !== 2 &&
          card.observation.facets.backdrop === 'environment' &&
          card.observation.facets.contextDensity !== 'contextual'
        ) {
          const revisedKey = this.identity([key, 'backdrop-v2', this.prompts.values.backdropReview]);
          keys.set(item.id, revisedKey);
          try {
            const revised = VisualCatalogContracts.card.parse(
              JSON.parse(await fs.readFile(path.join(this.cacheRoot, 'cards', `${revisedKey}.json`), 'utf8')),
            );
            if (
              revised.id !== item.id ||
              revised.sha256 !== item.sha256 ||
              revised.filename !== item.filename ||
              revised.backdropSchemaVersion !== 2
            )
              throw new Error('Revised observation identity mismatch.');
            result.push(revised);
          } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
            repairs.add(item.id);
            missing.push(item);
          }
          continue;
        }
        card.analysisKey = key;
        card.backdropSchemaVersion = 2;
        result.push(card);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        missing.push(item);
      }
    }
    progress(result.length, input.library.length);
    for (let start = 0; start < missing.length; start += CatalogPolicy.values.cardAnalysisBatchSize) {
      if (stopped()) throw new Error('Knowledge synchronization cancelled.');
      const batch = missing.slice(start, start + CatalogPolicy.values.cardAnalysisBatchSize);
      const response = z
        .object({
          entries: z
            .array(
              z.object({
                id: z.enum(batch.map((item) => item.id)),
                observation: VisualCatalogContracts.observation.extend({
                  exemplarIds: z.array(z.enum(examples.map((image) => image.id))).min(1),
                }),
              }),
            )
            .length(batch.length),
        })
        .superRefine((value, context) => {
          if (
            new Set(value.entries.map((entry) => entry.id)).size !== batch.length ||
            value.entries.some(
              (entry) =>
                !batch.some((item) => item.id === entry.id) ||
                entry.observation.exemplarIds.some((id) => !examples.some((image) => image.id === id)),
            )
          )
            context.addIssue({ code: 'custom', message: 'Card observation identity/evidence mismatch.' });
        });
      const manifest = [
        ...examples.map((image, index) => ({
          image: index + 1,
          id: image.id,
          role: 'category-example',
          category: image.category,
        })),
        ...batch.map((item, index) => ({
          image: examples.length + index + 1,
          id: item.id,
          role: 'individual-card',
        })),
      ];
      const value = (
        await this.runner.run(
          this.prompts.render(batch.some((item) => repairs.has(item.id)) ? 'backdropReview' : 'cards', {
            rules: this.rules,
            profiles,
            images: manifest,
          }),
          response,
          [
            ...exemplarFiles,
            ...batch.map((item) => path.resolve(this.resources, 'references', item.filename)),
          ],
        )
      ).value;
      for (const entry of value.entries) {
        const item = batch.find((item) => item.id === entry.id),
          key = keys.get(entry.id);
        if (!item || !key) throw new Error('Observation source missing.');
        const card = {
          backdropSchemaVersion: 2 as const,
          analysisKey: key,
          id: item.id,
          sha256: item.sha256,
          filename: item.filename,
          observation: entry.observation,
        };
        await fs.mkdir(path.join(this.cacheRoot, 'cards'), { recursive: true });
        const file = path.join(this.cacheRoot, 'cards', `${key}.json`),
          temporary = `${file}.${randomUUID()}.tmp`;
        await fs.writeFile(temporary, JSON.stringify(card));
        await fs.rename(temporary, file);
        result.push(card);
      }
      progress(result.length, input.library.length);
    }
    const ordered = input.library.map((item) => {
      const card = result.find((card) => card.id === item.id);
      if (!card) throw new Error('Incomplete individual catalog.');
      return card;
    });
    return new CodexPatternAnalysis(this.runner, this.resources, this.cacheRoot, this.prompts).enrich(
      ordered,
      input.model,
      stopped,
      (done, total) => progress(done, total, 'patterns'),
    );
  }
  async sets(
    input: CatalogInput,
    cards: CatalogCard[],
    stopped: () => boolean,
    progress: (done: number, total: number) => void,
  ): Promise<CatalogSet[]> {
    const sources = input.knowledge.images.filter((image) => image.role === 'collection-example');
    const result: CatalogSet[] = [];
    const analyze = async (source: (typeof sources)[number]): Promise<CatalogSet> => {
      if (stopped()) throw new Error('Knowledge synchronization cancelled.');
      const membership = input.memberships.find((set) => set.id === source.id);
      if (!membership) throw new Error(`Set membership missing: ${source.title}`);
      const observations = membership.cards.map((member) => {
        const card = cards.find((card) => card.id === member.id && card.sha256 === member.sha256);
        if (!card) throw new Error('Set member observation missing.');
        return {
          slot: member.slot,
          id: card.id,
          sha256: card.sha256,
          filename: card.filename,
          observation: card.observation,
        };
      });
      const clean = input.knowledge.cleanSets?.find((set) => set.sourceImageId === source.id);
      const files = [await this.file(path.join(this.resources, 'knowledge'), source.filename, source.sha256)];
      if (clean)
        files.unshift(await this.file(path.join(this.resources, 'knowledge'), clean.filename, clean.sha256));
      const identity = JSON.stringify([
        'set-observation-v1',
        input.model,
        source,
        clean,
        observations,
        this.prompts.values.sets,
      ]);
      const analysisKey = createHash('sha256').update(identity).digest('hex');
      const seeded = this.seed?.sets.find((set) => set.analysisKey === analysisKey && set.id === source.id);
      const analysis = await this.cache.getOrCreate(identity, VisualCatalogContracts.setAnalysis, async () =>
        seeded
          ? seeded.analysis
          : (
              await this.runner.run(
                this.prompts.render('sets', {
                  cards: observations,
                  images: clean ? ['clean-art-sheet', 'original-ui-screenshot'] : ['original-ui-screenshot'],
                }),
                VisualCatalogContracts.setAnalysis,
                files,
              )
            ).value,
      );
      return {
        analysisKey,
        id: source.id,
        sourceSha256: source.sha256,
        cleanSha256: clean?.sha256 ?? null,
        cards: membership.cards,
        analysis,
      };
    };
    let next = 0;
    let failed = false;
    const worker = async () => {
      while (!failed && !stopped()) {
        const source = sources[next++];
        if (!source) return;
        try {
          result.push(await analyze(source));
          progress(result.length, sources.length);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    };
    const workers = await Promise.allSettled(
      Array.from({ length: CatalogPolicy.values.setAnalysisConcurrency }, worker),
    );
    for (const worker of workers) if (worker.status === 'rejected') throw worker.reason;
    if (stopped()) throw new Error('Knowledge synchronization cancelled.');
    return sources.map((source) => {
      const set = result.find((set) => set.id === source.id);
      if (!set) throw new Error('Set analysis incomplete.');
      return set;
    });
  }
}
