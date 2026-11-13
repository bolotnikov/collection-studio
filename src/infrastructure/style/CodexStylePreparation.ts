import { ReferenceCoverageSelector } from '../../domain/ReferenceCoverageSelector';
import { PreparationCache } from '../PreparationCache';
import baseStyle from '../../../resources/style-profile.json';
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
import { SetComposition } from '../../domain/SetComposition';
import fallbackContent from '../../../resources/reference-fallback.json';
import { MaterialVocabulary } from '../../domain/MaterialVocabulary';

/** Bounded specialist tasks: brief analysis, cached library analysis, visual selection and direction. */
export class CodexStylePreparation implements StylePreparationPort {
  private initialization: Promise<void> | null = null;
  private readonly analyses = new Map<string, ReferenceAnalysis>();
  private readonly retriever: ReferenceRetriever;
  private readonly preparedCatalog: boolean;
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
    private readonly categoryDefinitions: Profile['categories'] = baseStyle.categories,
  ) {
    this.retriever = new ReferenceRetriever(retrievalConfig);
    this.preparedCatalog = library.some((item) => item.origin === 'anchor' && Boolean(item.observation));
  }
  private digest(value: string | Buffer): string {
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
        `analysis-v5:${this.model}:${item.sha256}:${JSON.stringify(this.categoryDefinitions)}:${this.prompts.values['CodexStylePreparation.indexLibrary']}`,
      ) + '.json',
    );
  }
  private async readCachedAnalysis(item: LibraryItem): Promise<string> {
    try {
      return await fs.readFile(this.cachePath(item), 'utf8');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      const template = this.prompts.values['CodexStylePreparation.indexLibrary'] ?? '';
      if (
        this.digest(template) !== legacyPrompts['CodexStylePreparation.indexLibrary'] ||
        JSON.stringify(this.categoryDefinitions) !== JSON.stringify(baseStyle.categories)
      )
        throw error;
      const previous = path.join(
        this.cacheRoot,
        this.digest(`analysis-v4:${this.model}:${item.sha256}:${template}`) + '.json',
      );
      try {
        return await fs.readFile(previous, 'utf8');
      } catch (previousError) {
        if (!(previousError instanceof Error && 'code' in previousError && previousError.code === 'ENOENT'))
          throw previousError;
      }
      const legacy = path.join(
        this.cacheRoot,
        this.digest(`analysis-v3:${this.model}:${item.sha256}`) + '.json',
      );
      return fs.readFile(legacy, 'utf8');
    }
  }
  private async cached(item: LibraryItem): Promise<ReferenceAnalysis | null> {
    if (item.observation) {
      const { observation } = item;
      return this.curated(item, {
        eligible: observation.category !== '5',
        exclusionReason:
          observation.category === '5'
            ? 'Narrative character card; ordinary production excludes category 5.'
            : '',
        subject: observation.subject,
        category: observation.category,
        materials: observation.facets.materials,
        silhouette: observation.facets.silhouette,
        rendering: observation.facets.rendering,
        lighting: observation.facets.lighting,
        palette: observation.facets.palette.join(', '),
        background: JSON.stringify({
          support: observation.facets.support,
          backdrop: observation.facets.backdrop,
          pattern: observation.facets.pattern,
          depth: observation.facets.depth,
          environment: observation.environment,
          environmentKind: observation.facets.environmentKind,
          backgroundLayout: observation.facets.backgroundLayout,
          backgroundDetail: observation.facets.backgroundDetail,
          backgroundProps: observation.facets.backgroundProps,
        }),
        usefulPrinciples: [observation.categoryRationale],
        avoidCopying: ['Source subject identity'],
      });
    }
    if (item.origin === 'user' && this.preparedCatalog) {
      const category = item.metadata?.category ?? item.category;
      if (category === 'unknown') return null;
      // Supplemental art is visually screened during selection; metadata is not invented facet evidence.
      return {
        eligible: item.approved,
        exclusionReason: '',
        category,
        subject: item.metadata?.description ?? item.title,
        materials: [],
        silhouette: '',
        rendering: '',
        lighting: '',
        palette: '',
        background: '',
        usefulPrinciples: [],
        avoidCopying: [],
      };
    }
    if (this.analyses.has(item.id)) return this.curated(item, this.analyses.get(item.id) ?? null);
    try {
      const value = StyleContracts.analysis.parse(JSON.parse(await this.readCachedAnalysis(item)));
      this.analyses.set(item.id, value);
      return this.curated(item, value);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }
  private curated(item: LibraryItem, analysis: ReferenceAnalysis | null): ReferenceAnalysis | null {
    if (!analysis || !item.metadata) return analysis;
    return {
      ...analysis,
      subject: item.metadata.description,
      category: this.preparedCatalog
        ? item.metadata.category
        : analysis.category === '5'
          ? '5'
          : item.metadata.category,
      eligible: this.preparedCatalog ? item.metadata.category !== '5' : analysis.eligible,
    };
  }
  /** Read-only display projection; never invokes a model or mutates the source catalog. */
  async catalog(): Promise<LibraryItem[]> {
    return Promise.all(
      this.library.map(async (item) => {
        const analysis = await this.cached(item);
        if (!analysis)
          return {
            ...item,
            category: item.metadata?.category ?? item.category,
            title: item.metadata?.description ?? item.title,
            tags: [...item.tags],
          };
        const category = item.metadata?.category ?? analysis.category;
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
      (r) =>
        (r.origin === 'anchor' ||
          (r.approved && (!this.preparedCatalog || Boolean(r.metadata || r.category !== 'unknown')))) &&
        !r.tags.includes('exclude:ordinary-card-generation'),
    );
    const missing: LibraryItem[] = [];
    for (const item of items) if (!(await this.cached(item))) missing.push(item);
    let indexed = items.length - missing.length;
    await onProgress?.(indexed, items.length);
    for (let start = 0; start < missing.length; start += 16) {
      if (shouldStop()) throw new Error('Reference analysis paused. Cached results retained.');
      const batches = [missing.slice(start, start + 8), missing.slice(start + 8, start + 16)].filter(
        (batch) => batch.length > 0,
      );
      const results = await Promise.allSettled(batches.map((batch) => this.analyzeBatch(batch)));
      indexed = items.filter((item) => this.analyses.has(item.id)).length;
      await onProgress?.(indexed, items.length);
      for (const result of results) if (result.status === 'rejected') throw result.reason;
    }
    return { indexed: items.length, total: items.length };
  }
  private async analyzeBatch(batch: LibraryItem[], persist = true): Promise<ReferenceAnalysis[]> {
    const schema = z.object({
      entries: z.array(z.object({ id: z.string(), analysis: StyleContracts.analysis })),
    });
    for (const item of batch) {
      const hash = createHash('sha256')
        .update(await fs.readFile(this.filename(item)))
        .digest('hex');
      if (hash !== item.sha256) throw new Error(`Reference integrity mismatch: ${item.id}`);
    }
    const result = await this.runner.run(
      this.prompts.render('CodexStylePreparation.indexLibrary', {
        images: JSON.stringify(
          batch.map((r) => ({
            id: r.id,
            title: r.title,
            source: r.source,
            origin: r.origin,
            activeCategoryDefinitions: this.categoryDefinitions,
          })),
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
    if (!persist)
      return batch.map((item) => {
        const entry = result.value.entries.find((entry) => entry.id === item.id);
        if (!entry) throw new Error('Library analysis entry missing.');
        return entry.analysis;
      });
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
    return batch.map((item) => {
      const analysis = this.analyses.get(item.id);
      if (!analysis) throw new Error('Reference analysis missing.');
      return analysis;
    });
  }
  async analyzeReference(item: LibraryItem): Promise<ReferenceAnalysis> {
    const [analysis] = await this.analyzeBatch([item], false);
    if (!analysis) throw new Error('Reference analysis missing.');
    return structuredClone(analysis);
  }
  private brief(brief: Brief): Promise<string> {
    const key = JSON.stringify([
      'brief-v1',
      this.model,
      this.prompts.values['CodexStylePreparation.brief'],
      brief.theme,
      brief.wishes,
      this.policy.rules,
    ]);
    const existing = this.briefs.get(key);
    if (existing) return existing;
    const schema = z.object({
      direction: z.string(),
      retrievalTerms: z.array(z.string()),
      requirements: z.array(z.string()),
    });
    const task = new PreparationCache(path.join(this.cacheRoot, 'briefs'))
      .getOrCreate(key, schema, async () => {
        const { value } = await this.runner.run(
          this.prompts.render('CodexStylePreparation.brief', {
            brief: JSON.stringify({ theme: brief.theme, wishes: brief.wishes }),
            rules: JSON.stringify(this.policy.rules),
          }),
          schema,
        );
        return value;
      })
      .then((value) => JSON.stringify(value));
    this.briefs.set(key, task);
    void task.catch(() => this.briefs.delete(key));
    return task;
  }
  async prepare(
    brief: Brief,
    card: Card,
    variant: Variant,
    profile: Profile,
    correction = '',
  ): Promise<PreparedStyle> {
    const knowledgeContext = profile.knowledgeContext
      ? { ...profile.knowledgeContext, createdAt: undefined }
      : undefined;
    const visualCatalog = profile.visualCatalog
      ? { ...profile.visualCatalog, createdAt: undefined }
      : undefined;
    const key = this.digest(
      JSON.stringify([
        'prepared-style-v2',
        this.model,
        this.prompts.values,
        this.categoryDefinitions,
        brief,
        card.subject,
        card.description,
        card.category,
        card.role,
        card.visual,
        variant.artContract,
        correction,
        { ...profile, knowledgeContext, visualCatalog },
        variant.title,
        variant.concept,
        variant.cards.map(({ subject, category, role, visual }) => ({ subject, category, role, visual })),
        profile.rules,
        this.policy,
        this.library.map((r) => [r.id, r.sha256, r.approved, r.metadata]),
      ]),
    );
    let task = this.preparations.get(key);
    if (!task) {
      task = this.restoreOrPrepare(key, brief, card, variant, profile, correction);
      this.preparations.set(key, task);
      void task.catch(() => this.preparations.delete(key));
    }
    const prepared = await task;
    await this.verifyPrepared(prepared);
    return {
      ...prepared,
      prompt:
        prepared.prompt + (correction ? this.prompts.render('correction.revision', { correction }) : ''),
    };
  }
  private async restoreOrPrepare(
    key: string,
    brief: Brief,
    card: Card,
    variant: Variant,
    profile: Profile,
    correction: string,
  ): Promise<PreparedStyle> {
    const file = path.join(this.cacheRoot, 'preparations', `${key}.json`);
    const schema = z.object({
      prompt: z.string().min(1),
      references: z.array(z.string()),
      evidence: StyleContracts.evidence,
    });
    let prepared: PreparedStyle;
    try {
      prepared = schema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      prepared = await this.prepareOnce(brief, card, variant, profile, correction);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(prepared));
      await fs.rename(temporary, file);
    }
    return prepared;
  }
  private async verifyPrepared(prepared: PreparedStyle): Promise<void> {
    if (prepared.references.length !== prepared.evidence.references.length)
      throw new Error('Prepared reference evidence is incomplete.');
    for (const [index, reference] of prepared.evidence.references.entries()) {
      const item = this.library.find((item) => item.id === reference.id);
      if (
        !item ||
        this.filename(item) !== prepared.references[index] ||
        reference.sha256 !== item.sha256 ||
        this.digest(await fs.readFile(this.filename(item))) !== reference.sha256
      )
        throw new Error('Prepared reference identity mismatch.');
    }
  }
  private async prepareOnce(
    brief: Brief,
    card: Card,
    variant: Variant,
    profile: Profile,
    correction = '',
  ): Promise<PreparedStyle> {
    await this.initialize();
    if (profile.contextOptimization && !variant.artContract)
      throw new Error('Accepted art contract is required to reuse the planned brief.');
    const direction = profile.contextOptimization
      ? JSON.stringify({
          theme: brief.theme,
          wishes: brief.wishes,
          concept: variant.concept,
          story: variant.artContract?.story,
          constraints: variant.artContract?.avoid,
        })
      : await this.brief(brief);
    const query = `${direction} ${variant.concept} ${card.subject} ${card.description} ${card.role} ${JSON.stringify(card.visual ?? {})} ${correction}`;
    const analyses = new Map<string, ReferenceAnalysis>();
    for (const item of this.library) {
      const analysis = await this.cached(item);
      if (analysis) analyses.set(item.id, analysis);
    }
    const effective = (await this.catalog()).filter(
      (item) =>
        (analyses.get(item.id)?.eligible && analyses.get(item.id)?.category !== '5') ||
        (card.category === '5' && analyses.get(item.id)?.category === '5'),
    );
    const ranked = this.retriever.rank(query, card.category, effective, analyses, 24);
    const target = SetComposition.target(variant, card);
    const compositionIds = target
      ? (
          target.selectedReferenceIds ??
          target.referenceIds ??
          effective.filter((item) => SetComposition.reference(item, target)).map((item) => item.id)
        ).filter((id) => effective.some((item) => item.id === id && SetComposition.reference(item, target)))
      : undefined;
    const categoryCandidates = this.retriever.rank(
      query,
      card.category,
      effective.filter(
        (item) => item.category === card.category && (!compositionIds || compositionIds.includes(item.id)),
      ),
      analyses,
      8,
    );
    const catalogueOnly = profile.referenceSelection === 'catalogue-v1';
    const materialCandidates = this.retriever.rank(
      JSON.stringify(card.visual ?? { subject: card.subject, description: card.description }),
      card.category,
      effective,
      analyses,
      8,
    );
    const candidates = [
      ...new Map([...categoryCandidates, ...materialCandidates, ...ranked].map((r) => [r.id, r])).values(),
    ];
    const scored = this.retriever.rank(query, card.category, candidates, analyses, 24);
    const frozen = catalogueOnly ? target?.selectedReferenceIds : undefined;
    const visualPool = frozen
      ? frozen.map((id) => {
          const item = effective.find((item) => item.id === id);
          if (!item || !target || !SetComposition.reference(item, target))
            throw new Error('Frozen slot reference is unavailable or contradicts its assigned pattern.');
          return item;
        })
      : catalogueOnly
        ? this.retriever.rank(
            query,
            card.category,
            effective.filter(
              (item) =>
                item.category === card.category &&
                (!compositionIds || compositionIds.includes(item.id)) &&
                (!target || SetComposition.reference(item, target)),
            ),
            analyses,
            Math.min(12, this.policy.referenceLimit + 4),
          )
        : this.retriever.select(
            [...categoryCandidates, ...materialCandidates, ...scored],
            scored.map((r) => r.id),
            Math.min(12, this.policy.referenceLimit + 4),
            card.category,
            compositionIds,
          );
    for (const item of visualPool) {
      const actual = createHash('sha256')
        .update(await fs.readFile(this.filename(item)))
        .digest('hex');
      if (actual !== item.sha256) throw new Error(`Reference integrity mismatch: ${item.id}`);
    }
    const coverageProtocol = this.prompts.values['reference.coverage.v1'];
    const baseEntry = StyleContracts.selection.shape.selections.element;
    const entrySchema = coverageProtocol
      ? target
        ? baseEntry.extend({ coverage: StyleContracts.referenceCoverage, compositionMatches: z.boolean() })
        : baseEntry.extend({ coverage: StyleContracts.referenceCoverage })
      : target
        ? baseEntry.extend({ compositionMatches: z.boolean() })
        : baseEntry;
    const warnings: string[] = [];
    let selection: ReturnType<typeof StyleContracts.selection.parse>;
    let selectionModel = this.model;
    if (profile.referenceSelection === 'catalogue-v1') {
      selectionModel = 'deterministic:prepared-catalogue-v1';
      selection = StyleContracts.selection.parse({
        selections: visualPool.map((item) => {
          const analysis = analyses.get(item.id);
          return {
            id: item.id,
            reason: 'Selected using the persisted visual classification and current slot requirements.',
            role:
              item.category === card.category
                ? 'catalogue composition reference'
                : 'catalogue rendering reference',
            take: analysis?.usefulPrinciples.join('; ') || fallbackContent.take,
            ignore: analysis?.avoidCopying.join('; ') || fallbackContent.ignore,
            compositionMatches:
              item.category === card.category && (!target || SetComposition.reference(item, target)),
            coverage: {
              useful: Boolean(item.observation) && item.approved,
              conflict: false,
              rendering: item.origin === 'anchor',
              lighting: Boolean(analysis?.lighting),
              materials: (card.visual?.materials ?? []).filter((material) =>
                MaterialVocabulary.matches(material, analysis?.materials ?? []),
              ),
            },
          };
        }),
        visualDirection: variant.artContract?.rendering || profile.rules.join('\n'),
        materialGuidance:
          variant.artContract?.materialTreatment || JSON.stringify(card.visual?.materials ?? []),
        compositionGuidance: card.visual?.composition || profile.categories[card.category],
        pitfalls: [],
      });
    } else
      try {
        selection = (
          await this.runner.run(
            this.prompts.render('CodexStylePreparation.prepareOnce', {
              producerAnalysis: direction,
              card: JSON.stringify({
                subject: card.subject,
                description: card.description,
                category: card.category,
                categoryDefinition: profile.categories[card.category],
                role: card.role,
                compositionTarget: target,
              }),
              setConcept: variant.concept,
              artContract: JSON.stringify(variant.artContract ?? null),
              visualRequirements: JSON.stringify(card.visual ?? null),
              correction: correction,
              rules: JSON.stringify({
                rendering: profile.rules,
                production: this.policy.rules,
                requirements: profile.requirements ?? [],
              }),
              candidateImages: JSON.stringify(
                visualPool.map((r) => ({
                  id: r.id,
                  title: r.title,
                  origin: r.origin,
                  analysis: analyses.get(r.id),
                  observedFacets: r.observation?.facets,
                })),
              ),
            }) + (coverageProtocol ? '\n' + coverageProtocol : ''),
            StyleContracts.selection.extend({ selections: z.array(entrySchema) }),
            visualPool.map((r) => this.filename(r)),
          )
        ).value;
        if (
          selection.selections.length !== visualPool.length ||
          new Set(selection.selections.map((entry) => entry.id)).size !== visualPool.length ||
          selection.selections.some((entry) => !visualPool.some((item) => item.id === entry.id))
        )
          throw new Error('Visual selection must explain every candidate exactly once.');
      } catch (error) {
        if (!profile.allowQualityWarnings) throw error;
        warnings.push(fallbackContent.warning);
        selectionModel = 'deterministic:catalogue-fallback-v1';
        selection = StyleContracts.selection.parse({
          selections: visualPool.map((item) => ({
            id: item.id,
            reason: fallbackContent.reason,
            role: fallbackContent.role,
            take: analyses.get(item.id)?.usefulPrinciples.join('; ') || fallbackContent.take,
            ignore: analyses.get(item.id)?.avoidCopying.join('; ') || fallbackContent.ignore,
            compositionMatches: false,
            coverage: {
              useful: item.approved,
              conflict: false,
              rendering: item.origin === 'anchor',
              lighting: item.origin === 'anchor',
              materials: [],
            },
          })),
          visualDirection: variant.artContract?.rendering || profile.rules.join('\n'),
          materialGuidance:
            variant.artContract?.materialTreatment || JSON.stringify(card.visual?.materials ?? []),
          compositionGuidance:
            card.visual?.composition || (target ? JSON.stringify(target) : profile.categories[card.category]),
          pitfalls: [],
        });
      }
    const selected =
      coverageProtocol || catalogueOnly
        ? new ReferenceCoverageSelector().select(
            visualPool,
            selection.selections,
            this.policy.referenceLimit,
            card.category,
            compositionIds,
            card.visual?.materials ?? [],
            profile.allowQualityWarnings ? (message) => warnings.push(message) : undefined,
            Boolean(frozen),
          )
        : this.retriever.select(
            selection.selections.map((entry) => {
              const item = visualPool.find((candidate) => candidate.id === entry.id);
              if (!item) throw new Error('Unknown reference ID');
              return item;
            }),
            selection.selections.map((s) => s.id),
            this.policy.referenceLimit,
            card.category,
            compositionIds?.filter(
              (id) => selection.selections.find((entry) => entry.id === id)?.compositionMatches === true,
            ),
          );
    if (
      catalogueOnly &&
      selected.some(
        (item) => item.category !== card.category || (target && !SetComposition.reference(item, target)),
      )
    )
      throw new Error('A generation reference contradicts the assigned slot composition.');
    if (frozen && JSON.stringify(selected.map((item) => item.id)) !== JSON.stringify(frozen))
      throw new Error('Generation references must preserve the frozen slot selection.');
    const evidence = StyleContracts.evidence.parse({
      version: 'style-v2',
      warnings: warnings.length ? warnings : undefined,
      query,
      policy: this.policy,
      references: selected.map((r) => ({
        id: r.id,
        category: r.category,
        purposes: [
          'supporting',
          ...(r.category === card.category &&
          (!compositionIds || compositionIds.includes(r.id)) &&
          (!target || selection.selections.find((entry) => entry.id === r.id)?.compositionMatches === true)
            ? ['category']
            : []),
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
      model: selectionModel,
    });
    return {
      references: selected.map((r) => this.filename(r)),
      evidence,
      prompt: this.prompts.render('CodexStylePreparation.prepareOnce.2', {
        cardPrompt: PromptBuilder.build(card, variant, {
          ...profile,
          rules: [...new Set([...profile.rules, ...this.policy.rules])],
        }),
        producerAnalysis: direction,
        rules: '',
        visualDirection: selection.visualDirection,
        materialGuidance: selection.materialGuidance,
        compositionGuidance: selection.compositionGuidance,
        pitfalls: selection.pitfalls.join('; '),
        referenceRoles: this.prompts.values['generation.context.v1']
          ? ''
          : JSON.stringify(evidence.references),
      }),
    };
  }
}
