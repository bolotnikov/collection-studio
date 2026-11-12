import legacyPrompts from '../../../resources/legacy-analysis-prompts.json';
import { RetrievalConfiguration } from '../../shared/RetrievalConfiguration';
import { PromptCatalog } from '../../application/prompts/PromptCatalog';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Brief, Card, Profile, Variant } from '../../shared/Contracts';
import {
  StyleContracts,
  type LibraryItem,
  type ReferenceAnalysis,
  type StylePolicy,
} from '../../shared/StyleContracts';
import type { PreparedStyle, StylePreparationPort } from '../../application/style/StylePreparationPort';
import { ReferenceRetriever } from '../../application/style/ReferenceRetriever';
import { PromptBuilder } from '../../application/PromptBuilder';
import { CodexRunner } from '../CodexRunner';

/** Bounded specialist tasks: brief analysis, cached library analysis, visual selection and direction. */
export class CodexStylePreparation implements StylePreparationPort {
  private initialization: Promise<void> | null = null;
  private readonly analyses = new Map<string, ReferenceAnalysis>();
  private readonly retriever: ReferenceRetriever;
  private readonly briefs = new Map<string, Promise<string>>();
  private readonly preparations = new Map<string, Promise<PreparedStyle>>();
  constructor(
    private readonly runner: CodexRunner,
    private readonly library: LibraryItem[],
    private readonly referenceRoot: string,
    private readonly cacheRoot: string,
    private readonly model: string,
    private readonly policy: StylePolicy,
    private readonly prompts = new PromptCatalog(),
    retrievalConfig = new RetrievalConfiguration().values,
  ) {
    this.retriever = new ReferenceRetriever(retrievalConfig);
  }
  private digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
  private filename(item: LibraryItem): string {
    const root = path.resolve(this.referenceRoot),
      file = path.resolve(root, item.filename);
    if (!file.startsWith(root + path.sep)) throw new Error('Reference path escapes the library.');
    return file;
  }
  private cachePath(item: LibraryItem): string {
    return path.join(
      this.cacheRoot,
      this.digest(
        `analysis-v4:${this.model}:${item.sha256}:${this.prompts.values['CodexStylePreparation.indexLibrary']}`,
      ) + '.json',
    );
  }
  private async readCachedAnalysis(item: LibraryItem): Promise<string> {
    try {
      return await fs.readFile(this.cachePath(item), 'utf8');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      const template = this.prompts.values['CodexStylePreparation.indexLibrary'] ?? '';
      if (this.digest(template) !== legacyPrompts['CodexStylePreparation.indexLibrary']) throw error;
      const legacy = path.join(
        this.cacheRoot,
        this.digest(`analysis-v3:${this.model}:${item.sha256}`) + '.json',
      );
      return fs.readFile(legacy, 'utf8');
    }
  }
  private async cached(item: LibraryItem): Promise<ReferenceAnalysis | null> {
    if (this.analyses.has(item.id)) return this.analyses.get(item.id) ?? null;
    try {
      const value = StyleContracts.analysis.parse(JSON.parse(await this.readCachedAnalysis(item)));
      this.analyses.set(item.id, value);
      return value;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }
  /** Read-only display projection; never invokes a model or mutates the source catalog. */
  async catalog(): Promise<LibraryItem[]> {
    return Promise.all(
      this.library.map(async (item) => {
        const analysis = await this.cached(item);
        if (!analysis) return { ...item, tags: [...item.tags] };
        const category = analysis.category === '5' ? item.category : analysis.category;
        const tags = [
          ...new Set([
            ...item.tags,
            ...analysis.materials,
            ...(analysis.eligible && analysis.category !== '5'
              ? []
              : ['exclude:ordinary-card-generation', analysis.exclusionReason].filter(Boolean)),
          ]),
        ];
        return { ...item, category, title: analysis.subject || item.title, tags };
      }),
    );
  }
  initialize(
    shouldStop: () => boolean = () => false,
    onProgress?: (indexed: number, total: number) => Promise<void>,
  ): Promise<void> {
    if (!this.initialization)
      this.initialization = this.indexLibrary(shouldStop, onProgress)
        .then(() => undefined)
        .catch((error) => {
          this.initialization = null;
          throw error;
        });
    return this.initialization;
  }
  async indexLibrary(
    shouldStop: () => boolean = () => false,
    onProgress?: (indexed: number, total: number) => Promise<void>,
  ): Promise<{ indexed: number; total: number }> {
    const items = this.library.filter(
      (r) => (r.origin === 'anchor' || r.approved) && !r.tags.includes('exclude:ordinary-card-generation'),
    );
    const missing: LibraryItem[] = [];
    for (const item of items) if (!(await this.cached(item))) missing.push(item);
    let indexed = items.length - missing.length;
    await onProgress?.(indexed, items.length);
    const schema = z.object({
      entries: z.array(z.object({ id: z.string(), analysis: StyleContracts.analysis })),
    });
    const analyzeBatch = async (batch: LibraryItem[]): Promise<void> => {
      for (const item of batch) {
        const hash = createHash('sha256')
          .update(await fs.readFile(this.filename(item)))
          .digest('hex');
        if (hash !== item.sha256) throw new Error(`Reference integrity mismatch: ${item.id}`);
      }
      const result = await this.runner.run(
        this.prompts.render('CodexStylePreparation.indexLibrary', {
          images: JSON.stringify(
            batch.map((r) => ({ id: r.id, title: r.title, source: r.source, origin: r.origin })),
          ),
        }),
        schema,
        batch.map((r) => this.filename(r)),
      );
      if (
        result.value.entries.length !== batch.length ||
        new Set(result.value.entries.map((r) => r.id)).size !== batch.length ||
        result.value.entries.some((r) => !batch.some((item) => item.id === r.id))
      )
        throw new Error('Library analysis returned missing, duplicated or unknown reference IDs.');
      await fs.mkdir(this.cacheRoot, { recursive: true });
      for (const item of batch) {
        const entry = result.value.entries.find((r) => r.id === item.id);
        if (!entry) throw new Error('Library analysis entry missing.');
        const destination = this.cachePath(item),
          temporary = `${destination}.${randomUUID()}.tmp`;
        await fs.writeFile(temporary, JSON.stringify(entry.analysis, null, 2));
        await fs.rename(temporary, destination);
        this.analyses.set(item.id, entry.analysis);
      }
    };
    for (let start = 0; start < missing.length; start += 16) {
      if (shouldStop()) throw new Error('Reference analysis paused. Cached results retained.');
      const batches = [missing.slice(start, start + 8), missing.slice(start + 8, start + 16)].filter(
        (batch) => batch.length > 0,
      );
      const results = await Promise.allSettled(batches.map(analyzeBatch));
      indexed = items.filter((item) => this.analyses.has(item.id)).length;
      await onProgress?.(indexed, items.length);
      for (const result of results) if (result.status === 'rejected') throw result.reason;
    }
    return { indexed: items.length, total: items.length };
  }
  private brief(brief: Brief): Promise<string> {
    const key = JSON.stringify([brief.theme, brief.wishes, this.policy.rules]);
    const existing = this.briefs.get(key);
    if (existing) return existing;
    const task = this.runner
      .run(
        this.prompts.render('CodexStylePreparation.brief', {
          brief: JSON.stringify({ theme: brief.theme, wishes: brief.wishes }),
          rules: JSON.stringify(this.policy.rules),
        }),
        z.object({
          direction: z.string(),
          retrievalTerms: z.array(z.string()),
          requirements: z.array(z.string()),
        }),
      )
      .then(({ value }) => JSON.stringify(value));
    this.briefs.set(key, task);
    return task;
  }
  async prepare(
    brief: Brief,
    card: Card,
    variant: Variant,
    profile: Profile,
    correction = '',
  ): Promise<PreparedStyle> {
    const key = this.digest(
      JSON.stringify([
        brief.theme,
        brief.wishes,
        card.subject,
        card.description,
        card.category,
        card.visual,
        variant.artContract,
        correction,
        profile.knowledgeContext,
        variant.concept,
        profile.rules,
        this.policy,
        this.library.map((r) => [r.id, r.sha256, r.approved]),
      ]),
    );
    let task = this.preparations.get(key);
    if (!task) {
      task = this.prepareOnce(brief, card, variant, profile, correction);
      this.preparations.set(key, task);
    }
    const prepared = await task;
    return {
      ...prepared,
      prompt:
        prepared.prompt + (correction ? this.prompts.render('correction.revision', { correction }) : ''),
    };
  }
  private async prepareOnce(
    brief: Brief,
    card: Card,
    variant: Variant,
    profile: Profile,
    correction = '',
  ): Promise<PreparedStyle> {
    await this.initialize();
    const direction = await this.brief(brief);
    const query = `${direction} ${variant.concept} ${card.subject} ${card.description} ${card.role} ${JSON.stringify(card.visual ?? {})} ${correction}`;
    await Promise.all(this.library.map((item) => this.cached(item)));
    const effective = (await this.catalog()).filter(
      (item) => this.analyses.get(item.id)?.eligible && this.analyses.get(item.id)?.category !== '5',
    );
    const ranked = this.retriever.rank(query, card.category, effective, this.analyses, 24);
    const categoryCandidates = this.retriever.rank(
      query,
      card.category,
      effective.filter((item) => item.category === card.category),
      this.analyses,
      8,
    );
    const fixed = profile.references
      .map((r) => effective.find((item) => item.id === r.id))
      .filter(
        (r): r is LibraryItem =>
          Boolean(r) &&
          (r
            ? this.analyses.get(r.id)?.eligible !== false && this.analyses.get(r.id)?.category !== '5'
            : false),
      );
    const commonAnchorIds = fixed.slice(0, 2).map((item) => item.id);
    if (commonAnchorIds.length < 2) throw new Error('Two shared original style anchors are required.');
    const materialCandidates = this.retriever.rank(
      JSON.stringify(card.visual ?? { subject: card.subject, description: card.description }),
      card.category,
      effective,
      this.analyses,
      8,
    );
    const candidates = [
      ...new Map(
        [...categoryCandidates, ...fixed, ...materialCandidates, ...ranked].map((r) => [r.id, r]),
      ).values(),
    ];
    const scored = this.retriever.rank(query, card.category, candidates, this.analyses, 24);
    const visualPool = this.retriever.select(
      [...fixed, ...categoryCandidates, ...materialCandidates, ...scored],
      scored.map((r) => r.id),
      Math.min(12, this.policy.referenceLimit + 4),
      card.category,
      commonAnchorIds,
    );
    for (const item of visualPool) {
      const actual = createHash('sha256')
        .update(await fs.readFile(this.filename(item)))
        .digest('hex');
      if (actual !== item.sha256) throw new Error(`Reference integrity mismatch: ${item.id}`);
    }
    const selection = (
      await this.runner.run(
        this.prompts.render('CodexStylePreparation.prepareOnce', {
          producerAnalysis: direction,
          card: JSON.stringify({
            subject: card.subject,
            description: card.description,
            category: card.category,
            role: card.role,
          }),
          setConcept: variant.concept,
          artContract: JSON.stringify(variant.artContract ?? null),
          visualRequirements: JSON.stringify(card.visual ?? null),
          correction: correction,
          rules: JSON.stringify([...profile.rules, ...this.policy.rules]),
          candidateImages: JSON.stringify(
            visualPool.map((r) => ({
              id: r.id,
              title: r.title,
              origin: r.origin,
              analysis: this.analyses.get(r.id),
            })),
          ),
        }),
        StyleContracts.selection,
        visualPool.map((r) => this.filename(r)),
      )
    ).value;
    if (
      selection.selections.length !== visualPool.length ||
      new Set(selection.selections.map((entry) => entry.id)).size !== visualPool.length ||
      selection.selections.some((entry) => !visualPool.some((item) => item.id === entry.id))
    )
      throw new Error('Visual selection must explain every candidate exactly once.');
    const selected = this.retriever.select(
      selection.selections.map((entry) => {
        const item = visualPool.find((candidate) => candidate.id === entry.id);
        if (!item) throw new Error('Unknown reference ID');
        return item;
      }),
      selection.selections.map((s) => s.id),
      this.policy.referenceLimit,
      card.category,
      commonAnchorIds,
    );
    const evidence = StyleContracts.evidence.parse({
      version: 'style-v2',
      query,
      policy: this.policy,
      references: selected.map((r) => ({
        id: r.id,
        category: r.category,
        purposes: [
          commonAnchorIds.includes(r.id) ? 'shared-style' : 'supporting',
          ...(r.category === card.category ? ['category'] : []),
        ],
        sha256: r.sha256,
        source: r.source,
        origin: r.origin,
        reason:
          selection.selections.find((s) => s.id === r.id)?.reason ??
          'Mandatory original style anchor / diversity coverage',
        role: selection.selections.find((s) => s.id === r.id)?.role ?? 'style anchor',
        take:
          selection.selections.find((s) => s.id === r.id)?.take ??
          'Canonical rendering, lighting and simplified material cues',
        ignore:
          selection.selections.find((s) => s.id === r.id)?.ignore ?? 'Original subject and exact composition',
      })),
      analysis: selection,
      createdAt: new Date().toISOString(),
      model: this.model,
    });
    return {
      references: selected.map((r) => this.filename(r)),
      evidence,
      prompt: this.prompts.render('CodexStylePreparation.prepareOnce.2', {
        cardPrompt: PromptBuilder.build(card, variant, profile),
        producerAnalysis: direction,
        rules: this.policy.rules.join('\n'),
        visualDirection: selection.visualDirection,
        materialGuidance: selection.materialGuidance,
        compositionGuidance: selection.compositionGuidance,
        pitfalls: selection.pitfalls.join('; '),
        referenceRoles: JSON.stringify(evidence.references),
      }),
    };
  }
}
