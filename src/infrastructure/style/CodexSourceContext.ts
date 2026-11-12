import legacyPrompts from '../../../resources/legacy-analysis-prompts.json';
import { PromptCatalog } from '../../application/prompts/PromptCatalog';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Brief, Card, Profile, Variant } from '../../shared/Contracts';
import {
  KnowledgeContracts,
  type KnowledgeAnalysis,
  type KnowledgeEvidence,
  type KnowledgeImage,
} from '../../shared/KnowledgeContracts';
import type { SourceContext, SourceContextPort } from '../../application/style/SourceContextPort';
import { CodexRunner } from '../CodexRunner';

/** Analyzes source sets/rule figures once, then selects set-level context by meaning. */
export class CodexSourceContext implements SourceContextPort {
  private readonly analyses = new Map<string, KnowledgeAnalysis>();
  private initialization: Promise<void> | null = null;
  private readonly selections = new Map<
    string,
    Promise<{ ids: string[]; reasons: string[]; guidance: string }>
  >();
  constructor(
    private readonly runner: CodexRunner,
    private readonly root: string,
    private readonly cache: string,
    private readonly model: string,
    private readonly prompts = new PromptCatalog(),
  ) {}
  private file(image: KnowledgeImage): string {
    const resolved = path.resolve(this.root, image.filename);
    if (!resolved.startsWith(path.resolve(this.root) + path.sep))
      throw new Error('Knowledge path escapes source root.');
    return resolved;
  }
  private async verify(image: KnowledgeImage): Promise<void> {
    if (
      createHash('sha256')
        .update(await fs.readFile(this.file(image)))
        .digest('hex') !== image.sha256
    )
      throw new Error('Knowledge source hash mismatch.');
  }
  private async initialize(profile: Profile): Promise<void> {
    if (!this.initialization)
      this.initialization = this.index(profile).catch((error) => {
        this.initialization = null;
        throw error;
      });
    return this.initialization;
  }
  private async index(profile: Profile): Promise<void> {
    const corpus = profile.knowledge;
    if (!corpus) throw new Error('Source knowledge is required.');
    const ruleHashes = corpus.documents
      .filter((d) => ['composition-rules', 'collection-structure'].includes(d.role))
      .map((d) => d.sha256)
      .join(':');
    const filename = (image: KnowledgeImage) =>
      path.join(
        this.cache,
        createHash('sha256')
          .update(
            `sets-v2:${this.model}:${ruleHashes}:${image.sha256}:${this.prompts.values['CodexSourceContext.index'] ?? this.prompts.values['CodexSourceContext.initializeOnce']}`,
          )
          .digest('hex') + '.json',
      );
    const missing: KnowledgeImage[] = [];
    for (const image of corpus.images.filter((i) => i.role !== 'delivery-template')) {
      await this.verify(image);
      try {
        this.analyses.set(
          image.id,
          KnowledgeContracts.analysis.parse(
            JSON.parse(await this.readAnalysis(filename(image), image, ruleHashes)),
          ),
        );
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') missing.push(image);
        else throw error;
      }
    }
    await fs.mkdir(this.cache, { recursive: true });
    for (let start = 0; start < missing.length; start += 8) {
      const batches = [missing.slice(start, start + 4), missing.slice(start + 4, start + 8)].filter(
        (b) => b.length,
      );
      const results = await Promise.allSettled(
        batches.map(async (batch) => {
          const schema = z.object({
            entries: z
              .array(
                z.object({
                  id: z.enum(batch.map((image) => image.id)),
                  analysis: KnowledgeContracts.analysis,
                }),
              )
              .length(batch.length),
          });
          const result = await this.runner.run(
            this.prompts.render('CodexSourceContext.index', {
              sourceRules: JSON.stringify(
                corpus.documents
                  .filter((d) => ['composition-rules', 'collection-structure'].includes(d.role))
                  .map((d) => ({ title: d.title, text: d.text })),
              ),
              images: JSON.stringify(batch),
            }),
            schema,
            batch.map((i) => this.file(i)),
          );
          if (
            result.value.entries.length !== batch.length ||
            new Set(result.value.entries.map((e) => e.id)).size !== batch.length ||
            result.value.entries.some((e) => !batch.some((i) => i.id === e.id))
          )
            throw new Error('Source analysis returned missing, duplicate or unknown IDs.');
          for (const entry of result.value.entries) {
            const image = batch.find((i) => i.id === entry.id);
            if (!image) throw new Error('Source image missing.');
            const target = filename(image),
              temporary = target + '.' + randomUUID() + '.tmp';
            await fs.writeFile(temporary, JSON.stringify(entry.analysis, null, 2));
            await fs.rename(temporary, target);
            this.analyses.set(entry.id, entry.analysis);
          }
        }),
      );
      for (const result of results) if (result.status === 'rejected') throw result.reason;
    }
  }
  private async readAnalysis(file: string, image: KnowledgeImage, ruleHashes: string): Promise<string> {
    try {
      return await fs.readFile(file, 'utf8');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      const template = this.prompts.values['CodexSourceContext.index'] ?? '';
      if (createHash('sha256').update(template).digest('hex') !== legacyPrompts['CodexSourceContext.index'])
        throw error;
      const legacy = path.join(
        this.cache,
        createHash('sha256').update(`sets-v1:${this.model}:${ruleHashes}:${image.sha256}`).digest('hex') +
          '.json',
      );
      return fs.readFile(legacy, 'utf8');
    }
  }
  async prepare(
    stage: KnowledgeEvidence['stage'],
    brief: Brief,
    profile: Profile,
    variant?: Variant,
    card?: Card,
  ): Promise<SourceContext> {
    await this.initialize(profile);
    const corpus = profile.knowledge;
    if (!corpus) throw new Error('Source knowledge is required.');
    const collections = corpus.images.filter(
      (i) => i.role === 'collection-example' && this.analyses.get(i.id)?.ordinarySetExample,
    );
    if (collections.length < 2) throw new Error('Insufficient ordinary collection examples.');
    const key = JSON.stringify([
      brief.theme,
      brief.wishes,
      variant?.concept,
      collections.map((i) => i.sha256),
    ]);
    let task = this.selections.get(key);
    if (!task) {
      const schema = z.object({
        selections: z
          .array(z.object({ id: z.string(), reason: z.string().min(1) }))
          .min(2)
          .max(4),
        guidance: z.string().min(1),
      });
      task = this.runner
        .run(
          this.prompts.render('CodexSourceContext.prepare', {
            brief: JSON.stringify({ theme: brief.theme, wishes: brief.wishes, concept: variant?.concept }),
            candidateAnalyses: JSON.stringify(
              collections.map((i) => ({ id: i.id, analysis: this.analyses.get(i.id) })),
            ),
          }),
          schema,
        )
        .then(({ value }) => {
          if (
            new Set(value.selections.map((s) => s.id)).size !== value.selections.length ||
            value.selections.some((s) => !collections.some((i) => i.id === s.id))
          )
            throw new Error('Invalid source-set selection.');
          return {
            ids: value.selections.map((s) => s.id),
            reasons: value.selections.map((s) => s.reason),
            guidance: value.guidance,
          };
        });
      this.selections.set(key, task);
    }
    const choice = await task;
    const selected = choice.ids.map((id, index) => {
      const image = collections.find((i) => i.id === id);
      if (!image) throw new Error('Selected source set missing.');
      return {
        image,
        reason: choice.reasons[index] ?? 'Set structure reference',
        attached: stage !== 'card',
      };
    });
    for (const image of corpus.images.filter((i) => i.role === 'category-example'))
      selected.push({
        image,
        reason:
          image.category === '5'
            ? 'Negative example: excluded character narrative category'
            : 'Authoritative composition category example',
        attached: image.category !== '5' && (stage !== 'card' || image.category === card?.category),
      });
    const evidenceImages: KnowledgeEvidence['images'] = [];
    for (const entry of selected) {
      const analysis = this.analyses.get(entry.image.id);
      if (!analysis) throw new Error('Missing source analysis.');
      await this.verify(entry.image);
      evidenceImages.push({ ...entry.image, reason: entry.reason, attached: entry.attached, analysis });
    }
    const evidence = KnowledgeContracts.evidence.parse({
      version: 1,
      stage,
      model: this.model,
      documents: corpus.documents.filter((d) =>
        ['assignment', 'collection-structure', 'composition-rules'].includes(d.role),
      ),
      images: evidenceImages,
      guidance: choice.guidance,
      createdAt: new Date().toISOString(),
    });
    return {
      profile: { ...profile, knowledgeContext: evidence },
      referencePaths: evidenceImages.filter((i) => i.attached).map((i) => this.file(i)),
      evidence,
    };
  }
}
