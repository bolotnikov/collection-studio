import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import {
  KnowledgeEditorContracts,
  type KnowledgeEdit,
  type KnowledgeKind,
  type KnowledgeOverlay,
  type KnowledgeSnapshot,
} from '../shared/KnowledgeEditorContracts';
import { VisualCatalogContracts, type VisualCatalog } from '../shared/VisualCatalogContracts';
import type { CatalogState } from '../shared/CatalogState';
import type { ReferenceLibrary } from './ReferenceLibrary';
import { CodexRunner } from './CodexRunner';
import { PromptCatalog } from '../application/prompts/PromptCatalog';
import prompts from '../../resources/prompts/knowledge-editor.json';
import { CatalogPolicy } from '../shared/CatalogPolicy';
import { VisualPatterns } from '../domain/VisualPatterns';
import { EnvironmentBackdrops } from '../domain/EnvironmentBackdrops';
import { SetSheetComposer } from './SetSheetComposer';
import { SetSheetLayout } from '../shared/SetSheetLayout';

/** Editable working knowledge overlays immutable source assets and frozen production snapshots. */
export class KnowledgeWorkspace {
  private state: KnowledgeOverlay = KnowledgeEditorContracts.overlay.parse({ version: 1 });
  private job: CatalogState = { status: 'ready', stage: '', done: 0, total: 0, message: '' };
  private cancelled = false;
  private importing = false;
  private automatic: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private readonly prompts = new PromptCatalog(prompts, prompts);
  constructor(
    private readonly file: string,
    private readonly imageRoot: string,
    private readonly library: ReferenceLibrary,
    private readonly base: () => Promise<VisualCatalog>,
    private readonly runner: () => CodexRunner,
    private readonly rules: () => unknown,
  ) {}
  async init() {
    try {
      this.state = KnowledgeEditorContracts.overlay.parse(JSON.parse(await fs.readFile(this.file, 'utf8')));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  async snapshot(): Promise<KnowledgeSnapshot> {
    const base = await this.base();
    const catalog = structuredClone(base);
    EnvironmentBackdrops.apply(catalog);
    catalog.baseDependencyHash = base.dependencyHash;
    catalog.dependencyHash = createHash('sha256')
      .update(JSON.stringify([base.dependencyHash, EnvironmentBackdrops.review, this.state]))
      .digest('hex');
    catalog.images.push(...this.state.images);
    catalog.categoryExamples.push(...this.state.images.filter((image) => image.role === 'category-example'));
    catalog.sets.push(...this.state.sets);
    catalog.categoryProfiles.push(...this.state.categories);
    const removed = (kind: KnowledgeKind, id: string) =>
      this.state.removed.some((item) => item.kind === kind && item.id === id);
    const library = this.library.items
      .filter((item) => !removed('card', item.id))
      .map((item) => {
        const edit = this.state.edits.find((edit) => edit.kind === 'card' && edit.id === item.id);
        let observation =
          edit?.kind === 'card'
            ? edit.observation
            : catalog.cards.find((card) => card.id === item.id && card.sha256 === item.sha256)?.observation;
        if (observation && item.metadata && edit?.kind !== 'card')
          observation = {
            ...observation,
            category: item.metadata.category,
            subject: item.metadata.description,
          };
        if (observation) {
          const card = { id: item.id, filename: item.filename, sha256: item.sha256, observation };
          const index = catalog.cards.findIndex((card) => card.id === item.id);
          if (index < 0) catalog.cards.push(card);
          else catalog.cards[index] = { ...catalog.cards[index], ...card };
        }
        return {
          ...item,
          observation,
          category: observation?.category ?? item.metadata?.category ?? item.category,
          title: observation?.subject ?? item.metadata?.description ?? item.title,
          metadata: observation
            ? { category: observation.category, description: observation.subject }
            : item.metadata,
        };
      });
    catalog.sets = catalog.sets
      .filter((set) => !removed('set', set.id))
      .map((set) => {
        const edit = this.state.edits.find((edit) => edit.kind === 'set' && edit.id === set.id);
        return edit?.kind === 'set' ? { ...set, analysis: edit.analysis } : set;
      });
    catalog.images = catalog.images.filter(
      (image) => !removed(image.role === 'category-example' ? 'category' : 'set', image.id),
    );
    catalog.categoryExamples = catalog.images.filter((image) => image.role === 'category-example');
    catalog.categoryProfiles = catalog.categoryProfiles
      .filter((profile) => !removed('category', profile.id))
      .map((profile) => {
        const edit = this.state.edits.find((edit) => edit.kind === 'category' && edit.id === profile.id);
        return edit?.kind === 'category' ? edit.profile : profile;
      });
    catalog.dependencyHash = createHash('sha256')
      .update(
        JSON.stringify([
          catalog.dependencyHash,
          library.map((item) => [item.id, item.sha256, item.observation, item.approved, item.origin]),
        ]),
      )
      .digest('hex');
    return structuredClone({ catalog, library, cleanSets: this.state.cleanSets, job: { ...this.job } });
  }
  async generation() {
    const snapshot = await this.snapshot();
    if (snapshot.library.some((item) => !item.observation))
      throw new Error(this.job.message || 'New reference images are being analyzed automatically.');
    const active = new Set(snapshot.library.map((item) => item.id));
    const catalog = snapshot.catalog;
    catalog.cards = catalog.cards.filter((card) => active.has(card.id));
    catalog.sets = catalog.sets.filter((set) => set.cards.every((card) => active.has(card.id)));
    const sets = new Set(catalog.sets.map((set) => set.id));
    catalog.images = catalog.images.filter(
      (image) => image.role !== 'collection-example' || sets.has(image.id),
    );
    return { ...snapshot, catalog };
  }
  private async write(change: (state: KnowledgeOverlay) => void) {
    const task = this.writes.then(async () => {
      const next = structuredClone(this.state);
      change(next);
      const decoded = KnowledgeEditorContracts.overlay.parse(next);
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(decoded, null, 2));
      await fs.rename(temporary, this.file);
      this.state = decoded;
    });
    this.writes = task.catch(() => {});
    return task;
  }
  async save(input: KnowledgeEdit) {
    if (this.job.status === 'running' || this.importing)
      throw new Error('Wait for knowledge analysis to finish.');
    const edit = KnowledgeEditorContracts.edit.parse(input);
    if (edit.kind === 'card') VisualPatterns.validate(edit.observation.facets);
    const snapshot = await this.snapshot();
    if (
      !(
        edit.kind === 'card'
          ? snapshot.library
          : edit.kind === 'set'
            ? snapshot.catalog.sets
            : snapshot.catalog.categoryProfiles
      ).some((item) => item.id === edit.id)
    )
      throw new Error('Knowledge entity not found.');
    if (
      edit.kind === 'category' &&
      (edit.profile.id !== edit.id ||
        edit.profile.category !==
          snapshot.catalog.categoryProfiles.find((item) => item.id === edit.id)?.category)
    )
      throw new Error('Category profile identity cannot change.');
    await this.storeEdit(edit);
    if ((await this.snapshot()).library.every((item) => item.observation))
      this.job = { status: 'ready', stage: '', done: 0, total: 0, message: '' };
  }
  private storeEdit(edit: KnowledgeEdit) {
    return this.write((state) => {
      state.edits = [...state.edits.filter((item) => item.kind !== edit.kind || item.id !== edit.id), edit];
    });
  }
  async remove(kind: KnowledgeKind, id: string) {
    if (this.job.status === 'running' || this.importing)
      throw new Error('Wait for knowledge analysis to finish.');
    await this.write((state) => {
      if (!state.removed.some((item) => item.kind === kind && item.id === id))
        state.removed.push({ kind, id });
    });
    if ((await this.snapshot()).library.every((item) => item.observation))
      this.job = { status: 'ready', stage: '', done: 0, total: 0, message: '' };
  }
  private async asset(file: string) {
    if ((await fs.stat(file)).size > 50 * 1024 * 1024) throw new Error('Image must be smaller than 50 MB.');
    const data = await sharp(file, { limitInputPixels: 40_000_000 }).rotate().png().toBuffer();
    const sha256 = createHash('sha256').update(data).digest('hex'),
      filename = `images/imported/${sha256}.png`;
    await fs.mkdir(path.join(this.imageRoot, 'images/imported'), { recursive: true });
    await fs.writeFile(path.join(this.imageRoot, filename), data);
    return { sha256, filename };
  }
  async import(file: string, raw: z.infer<typeof KnowledgeEditorContracts.import>) {
    if (this.job.status === 'running' || this.importing)
      throw new Error('Wait for knowledge analysis to finish.');
    this.importing = true;
    try {
      return await this.importAsset(file, raw);
    } finally {
      this.importing = false;
    }
  }
  private async importAsset(file: string, raw: z.infer<typeof KnowledgeEditorContracts.import>) {
    const input = KnowledgeEditorContracts.import.parse(raw),
      snapshot = await this.snapshot();
    const asset = await this.asset(file),
      id = `user-knowledge-${randomUUID()}`;
    if (snapshot.catalog.images.some((image) => image.sha256 === asset.sha256))
      throw new Error('This image is already in the knowledge base.');
    if (input.kind === 'category') {
      if (!input.category) throw new Error('Choose a composition category.');
      const image = {
        id,
        ...asset,
        title: input.title,
        source: 'user-import',
        role: 'category-example' as const,
        category: input.category,
      };
      const schema = VisualCatalogContracts.categoryProfile.extend({
        id: z.literal(id),
        category: z.literal(input.category),
      });
      const profile = (
        await this.runner().run(
          this.prompts.render('category', { context: { image, rules: this.rules() } }),
          schema,
          [path.join(this.imageRoot, asset.filename)],
        )
      ).value;
      await this.write((state) => {
        state.images.push(image);
        state.categories.push(profile);
      });
    } else {
      const ids = input.cardIds ?? [];
      if (ids.length !== 10 || new Set(ids).size !== 10)
        throw new Error('Select ten distinct cards in order.');
      const cards = ids.map((id, index) => {
        const card = snapshot.catalog.cards.find((card) => card.id === id);
        if (!card) throw new Error('Analyze each member card first.');
        return { slot: index + 1, id, sha256: card.sha256 };
      });
      const image = {
        id,
        ...asset,
        title: input.title,
        source: 'user-import',
        role: 'collection-example' as const,
        category: null,
      };
      const members = cards.map((member) => snapshot.catalog.cards.find((card) => card.id === member.id));
      const analysis = (
        await this.runner().run(
          this.prompts.render('set', { context: { image, members, verifyMembership: true } }),
          VisualCatalogContracts.setAnalysis.extend({ membershipMatches: z.boolean() }),
          [
            path.join(this.imageRoot, asset.filename),
            ...ids.map((id) => {
              const item = snapshot.library.find((item) => item.id === id);
              if (!item) throw new Error('Member not found');
              return path.join(this.library.root, item.filename);
            }),
          ],
        )
      ).value;
      if (!analysis.membershipMatches)
        throw new Error('The selected cards do not match the imported set image.');
      const bytes = await new SetSheetComposer().compose(
        await Promise.all(
          ids.map(async (id) => {
            const card = snapshot.library.find((card) => card.id === id);
            if (!card) throw new Error('Member missing');
            return fs.readFile(path.join(this.library.root, card.filename));
          }),
        ),
      );
      const sha256 = createHash('sha256').update(bytes).digest('hex'),
        filename = `images/imported/${sha256}.png`;
      await fs.writeFile(path.join(this.imageRoot, filename), bytes);
      const clean = {
        sourceImageId: id,
        sourceSha256: image.sha256,
        filename,
        sha256,
        layout: SetSheetLayout.defaults(),
        method: 'user-declared-card-assembly-v1' as const,
        primaryEligible: members.every((card) => card?.observation.category !== '5'),
        cards: cards.map((member) => {
          const card = snapshot.catalog.cards.find((card) => card.id === member.id);
          if (!card) throw new Error('Missing member');
          return {
            ...member,
            filename: card.filename,
            source: 'user-declared',
            use:
              card.observation.category === '5'
                ? ('excluded-gold-character' as const)
                : ('ordinary' as const),
          };
        }),
      };
      await this.write((state) => {
        state.images.push(image);
        state.sets.push({ id, sourceSha256: image.sha256, cleanSha256: sha256, cards, analysis });
        state.cleanSets.push(clean);
      });
    }
    return id;
  }
  /** Analyze only missing observations; authored metadata is already the source of truth. */
  ensureCards(): Promise<void> {
    if (this.automatic) return this.automatic;
    this.automatic = (async () => {
      while (true) {
        const snapshot = await this.snapshot();
        const ids = snapshot.library.filter((item) => !item.observation).map((item) => item.id);
        if (!ids.length) {
          this.job = { status: 'ready', stage: '', done: 0, total: 0, message: '' };
          return;
        }
        if (this.job.status === 'running' || this.importing)
          throw new Error('Knowledge update is already running.');
        this.cancelled = false;
        this.job = { status: 'running', stage: 'card', done: 0, total: ids.length, message: '' };
        await this.execute('card', undefined, ids);
        const result = (await this.snapshot()).job;
        if (result.status === 'failed') throw new Error(result.message);
      }
    })().finally(() => {
      this.automatic = null;
    });
    return this.automatic;
  }
  analyze(kind: KnowledgeKind, id?: string) {
    if (this.job.status === 'running' || this.importing)
      throw new Error('Knowledge analysis is already running.');
    this.cancelled = false;
    this.job = { status: 'running', stage: kind, done: 0, total: 0, message: '' };
    void this.execute(kind, id);
    return { ...this.job };
  }
  cancel() {
    this.cancelled = true;
  }
  private async execute(kind: KnowledgeKind, id?: string, onlyIds?: string[]) {
    try {
      const snapshot = await this.snapshot();
      const ids = (
        kind === 'card'
          ? snapshot.library
          : kind === 'set'
            ? snapshot.catalog.sets
            : snapshot.catalog.categoryProfiles
      )
        .filter((item) => (!id || item.id === id) && (!onlyIds || onlyIds.includes(item.id)))
        .map((item) => item.id);
      this.job.total = ids.length;
      const batchSize = kind === 'card' ? CatalogPolicy.values.cardAnalysisBatchSize : 1;
      for (let start = 0; start < ids.length; start += batchSize) {
        const entityId = ids[start];
        if (!entityId) throw new Error('Knowledge entity identity missing.');
        if (this.cancelled) break;
        const context = await this.snapshot();
        let edit: KnowledgeEdit;
        if (kind === 'card') {
          const cardIds = ids.slice(start, start + batchSize);
          const examples = context.catalog.categoryExamples;
          const observations = VisualCatalogContracts.observation.extend({
            facets: VisualCatalogContracts.facets.extend({
              subjectPosition: VisualCatalogContracts.facets.shape.subjectPosition.unwrap(),
              backgroundColor: VisualCatalogContracts.facets.shape.backgroundColor.unwrap(),
            }),
          });
          const schema = z.object({
            entries: z
              .array(z.object({ id: z.enum(cardIds), observation: observations }))
              .length(cardIds.length),
          });
          const entries = (
            await this.runner().run(
              this.prompts.render('card', {
                context: {
                  cards: cardIds.map((id) => ({ id })),
                  rules: this.rules(),
                  categoryImages: examples,
                  categoryProfiles: context.catalog.categoryProfiles,
                },
              }),
              schema,
              [
                ...cardIds.map((id) => {
                  const item = context.library.find((item) => item.id === id);
                  if (!item) throw new Error('Card not found');
                  return path.join(this.library.root, item.filename);
                }),
                ...examples.map((image) => path.join(this.imageRoot, image.filename)),
              ],
            )
          ).value.entries;
          if (new Set(entries.map((entry) => entry.id)).size !== cardIds.length)
            throw new Error('Duplicate card observations.');
          for (const entry of entries) {
            VisualPatterns.validate(entry.observation.facets);
            if (entry.observation.exemplarIds.some((id) => !examples.some((image) => image.id === id)))
              throw new Error('Unknown category evidence ID.');
          }
          if (this.cancelled) break;
          for (const entry of entries) {
            await this.storeEdit({ kind, id: entry.id, observation: entry.observation });
            this.job.done++;
          }
          continue;
        } else if (kind === 'set') {
          const set = context.catalog.sets.find((set) => set.id === entityId),
            image = context.catalog.images.find((image) => image.id === entityId);
          if (!set || !image) throw new Error('Set not found');
          const analysis = (
            await this.runner().run(
              this.prompts.render('set', {
                context: {
                  set,
                  members: set.cards.map((member) =>
                    context.catalog.cards.find((card) => card.id === member.id),
                  ),
                },
              }),
              VisualCatalogContracts.setAnalysis,
              [
                path.join(this.imageRoot, image.filename),
                ...set.cards.map((member) => {
                  const item = context.catalog.cards.find((card) => card.id === member.id);
                  if (!item) throw new Error('Set member source data is missing.');
                  return path.join(this.library.root, item.filename);
                }),
              ],
            )
          ).value;
          edit = { kind, id: entityId, analysis };
        } else {
          const image = context.catalog.categoryExamples.find((image) => image.id === entityId);
          if (!image?.category) throw new Error('Category example not found');
          const profile = (
            await this.runner().run(
              this.prompts.render('category', { context: { image, rules: this.rules() } }),
              VisualCatalogContracts.categoryProfile.extend({
                id: z.literal(entityId),
                category: z.literal(image.category),
              }),
              [path.join(this.imageRoot, image.filename)],
            )
          ).value;
          edit = { kind, id: entityId, profile };
        }
        if (this.cancelled) break;
        await this.storeEdit(edit);
        this.job.done++;
      }
      this.job.status = this.cancelled ? 'cancelled' : 'ready';
    } catch (error) {
      this.job.status = 'failed';
      this.job.message = error instanceof Error ? error.message : 'Knowledge analysis failed.';
    }
  }
}
