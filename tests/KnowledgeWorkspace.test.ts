import { z } from 'zod';
import { expect, it, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { KnowledgeWorkspace } from '../src/infrastructure/KnowledgeWorkspace';
import { ReferenceLibrary } from '../src/infrastructure/ReferenceLibrary';
import { VisualCatalogStore } from '../src/infrastructure/VisualCatalogStore';
import { CatalogInputLoader } from '../src/infrastructure/CatalogInputLoader';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { VisualPatterns } from '../src/domain/VisualPatterns';
const importIds = z.object({ cards: z.array(z.object({ id: z.string() })) });
const folders: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});
it('persists pattern edits and removals, pins old snapshots, and performs model work only on explicit reanalysis', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-edit-'));
  folders.push(root);
  const catalog = await new VisualCatalogStore('resources/knowledge/visual-catalog.json').read();
  const input = await new CatalogInputLoader('resources').load('fixture', {});
  const library = new ReferenceLibrary(path.resolve('resources/references'), root);
  library.items = input.library;
  const runner = new CodexRunner('/unused', root, 'fixture');
  const calls = vi.spyOn(runner, 'run');
  const create = () =>
    new KnowledgeWorkspace(
      path.join(root, 'edits.json'),
      path.resolve('resources/knowledge'),
      library,
      async () => catalog,
      () => runner,
      () => CatalogInputLoader.rules(),
    );
  const workspace = create();
  await workspace.init();
  const before = await workspace.generation();
  const first = before.catalog.cards[0];
  if (!first) throw new Error('Missing fixture');
  const observation = {
    ...first.observation,
    facets: {
      ...first.observation.facets,
      backdrop: 'pattern' as const,
      pattern: 'waves' as const,
      subjectPosition: 'left' as const,
      backgroundColor: 'blue' as const,
    },
  };
  await workspace.save({ kind: 'card', id: first.id, observation });
  const edited = await workspace.generation();
  expect(
    VisualPatterns.tags(
      edited.library.find((item) => item.id === first.id)?.observation?.facets ?? observation.facets,
    ),
  ).toContain('pattern:waves');
  expect(before.catalog.cards[0]?.observation.facets.pattern).not.toBe('waves');
  expect(calls).not.toHaveBeenCalled();
  const reopened = create();
  await reopened.init();
  expect((await reopened.snapshot()).catalog.cards[0]?.observation.facets.subjectPosition).toBe('left');
  calls.mockImplementation(async (_prompt, schema) => ({
    value: schema.parse({
      entries: [{ id: first.id, observation: { ...observation, subject: 'A reanalyzed source object' } }],
    }),
    folder: root,
    usage: null,
    threadId: null,
  }));
  reopened.analyze('card', first.id);
  await vi.waitFor(async () => expect((await reopened.snapshot()).job.status).toBe('ready'));
  expect(calls).toHaveBeenCalledOnce();
  expect((await reopened.snapshot()).catalog.cards[0]?.observation.subject).toBe(
    'A reanalyzed source object',
  );
  await reopened.remove('card', first.id);
  const removed = await reopened.generation();
  expect(removed.library.some((item) => item.id === first.id)).toBe(false);
  expect(removed.catalog.sets.some((set) => set.cards.some((card) => card.id === first.id))).toBe(false);
  expect(await fs.readFile(path.join(library.root, first.filename))).not.toHaveLength(0);
  expect(catalog.cards[0]?.observation.subject).toBe(first.observation.subject);
  calls.mockImplementation(async (prompt, schema) => {
    const context = JSON.parse(prompt.split('Context: ')[1] ?? '{}');
    const ids = importIds.parse(context);
    const entries = ids.cards.map(({ id }) => {
      const source = catalog.cards.find((card) => card.id === id);
      if (!source) throw new Error('Unknown fixture card');
      const facets = source.observation.facets;
      return {
        id,
        observation: {
          ...source.observation,
          facets: {
            ...facets,
            pattern: facets.backdrop === 'pattern' ? 'geometric' : 'none',
            subjectPosition: 'center',
            backgroundColor: 'blue',
          },
        },
      };
    });
    return { value: schema.parse({ entries }), folder: root, usage: null, threadId: null };
  });
  reopened.analyze('card');
  await vi.waitFor(async () => expect((await reopened.snapshot()).job.status).toBe('ready'), {
    timeout: 5000,
  });
  expect((await reopened.snapshot()).job.done).toBe(159);
  expect(calls).toHaveBeenCalledTimes(21);
});

it('imports analyzed category and set entities with explicit membership and preserves source pixels on removal', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-import-'));
  folders.push(root);
  const catalog = await new VisualCatalogStore('resources/knowledge/visual-catalog.json').read();
  const input = await new CatalogInputLoader('resources').load('fixture', {});
  const library = new ReferenceLibrary(path.resolve('resources/references'), root);
  library.items = input.library;
  const runner = new CodexRunner('/unused', root, 'fixture');
  const first = catalog.cards[0],
    profile = catalog.categoryProfiles[0],
    sourceSet = catalog.sets[0];
  if (!first || !profile || !sourceSet) throw new Error('Missing fixture');
  vi.spyOn(runner, 'run').mockImplementation(async (prompt, schema) => {
    const match = prompt.match(/user-knowledge-[a-f0-9-]+/);
    return {
      value: schema.parse(
        prompt.includes('verifyMembership')
          ? { ...sourceSet.analysis, membershipMatches: true }
          : { ...profile, id: match?.[0], category: '1' },
      ),
      folder: root,
      usage: null,
      threadId: null,
    };
  });
  const workspace = new KnowledgeWorkspace(
    path.join(root, 'edits.json'),
    root,
    library,
    async () => catalog,
    () => runner,
    () => CatalogInputLoader.rules(),
  );
  await workspace.init();
  const categoryId = await workspace.import(path.join(library.root, first.filename), {
    kind: 'category',
    category: '1',
    title: 'New category sheet',
  });
  expect((await workspace.snapshot()).catalog.categoryProfiles.some((item) => item.id === categoryId)).toBe(
    true,
  );
  const another = catalog.cards[1];
  if (!another) throw new Error('Missing fixture');
  const setId = await workspace.import(path.join(library.root, another.filename), {
    kind: 'set',
    title: 'New ordered set',
    cardIds: sourceSet.cards.map((card) => card.id),
  });
  const imported = await workspace.generation();
  expect(imported.catalog.sets.find((set) => set.id === setId)?.cards).toHaveLength(10);
  expect(imported.cleanSets.find((set) => set.sourceImageId === setId)?.method).toBe(
    'user-declared-card-assembly-v1',
  );
  await workspace.remove('set', setId);
  await workspace.remove('category', categoryId);
  const removed = await workspace.snapshot();
  expect(removed.catalog.sets.some((set) => set.id === setId)).toBe(false);
  expect(removed.catalog.categoryProfiles.some((item) => item.id === categoryId)).toBe(false);
  const originalImage = imported.catalog.images.find((item) => item.id === setId);
  if (!originalImage) throw new Error('Missing imported source');
  expect((await fs.stat(path.join(root, originalImage.filename))).size).toBeGreaterThan(0);
});

it('automatically analyzes only newly added cards, coalesces concurrent updates and preserves manual edits', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-auto-'));
  folders.push(root);
  const catalog = await new VisualCatalogStore('resources/knowledge/visual-catalog.json').read();
  const input = await new CatalogInputLoader('resources').load('fixture', {});
  const library = new ReferenceLibrary(path.resolve('resources/references'), root);
  library.items = input.library;
  const runner = new CodexRunner('/unused', root, 'fixture');
  const first = catalog.cards[0],
    item = library.items[0];
  if (!first || !item) throw new Error('Fixture');
  const calls = vi.spyOn(runner, 'run').mockImplementation(async (prompt, schema) => {
    const ids = importIds.parse(JSON.parse(prompt.split('Context: ')[1] ?? '{}')).cards;
    return {
      value: schema.parse({ entries: ids.map(({ id }) => ({ id, observation: first.observation })) }),
      folder: root,
      usage: null,
      threadId: null,
    };
  });
  const workspace = new KnowledgeWorkspace(
    path.join(root, 'overlay.json'),
    path.resolve('resources/knowledge'),
    library,
    async () => catalog,
    () => runner,
    () => CatalogInputLoader.rules(),
  );
  await workspace.init();
  await workspace.ensureCards();
  expect(calls).not.toHaveBeenCalled();
  library.items.push({ ...item, id: 'new-card', origin: 'user' });
  await Promise.all([workspace.ensureCards(), workspace.ensureCards()]);
  expect(calls).toHaveBeenCalledOnce();
  const snapshot = await workspace.generation();
  expect(snapshot.library.find((card) => card.id === 'new-card')?.observation).toBeDefined();
  await workspace.save({
    kind: 'card',
    id: 'new-card',
    observation: { ...first.observation, subject: 'User corrected subject' },
  });
  await workspace.ensureCards();
  expect(calls).toHaveBeenCalledOnce();
  expect((await workspace.generation()).library.find((card) => card.id === 'new-card')?.title).toBe(
    'User corrected subject',
  );
  const set = catalog.sets[0],
    category = catalog.categoryProfiles[0];
  if (!set || !category) throw new Error('Fixture');
  await workspace.save({
    kind: 'set',
    id: set.id,
    analysis: { ...set.analysis, story: 'User authored set story' },
  });
  await workspace.save({
    kind: 'category',
    id: category.id,
    profile: { ...category, cautions: ['User authored guidance'] },
  });
  await workspace.ensureCards();
  expect(calls).toHaveBeenCalledOnce();
  await workspace.remove('card', 'new-card');
  expect((await workspace.generation()).library.some((card) => card.id === 'new-card')).toBe(false);
  expect(snapshot.library.some((card) => card.id === 'new-card')).toBe(true);
});

it('blocks an unclassified addition after analysis failure and retries only missing observations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-auto-failure-'));
  folders.push(root);
  const catalog = await new VisualCatalogStore('resources/knowledge/visual-catalog.json').read();
  const input = await new CatalogInputLoader('resources').load('fixture', {});
  const library = new ReferenceLibrary(path.resolve('resources/references'), root);
  library.items = input.library;
  const first = catalog.cards[0],
    item = library.items[0];
  if (!first || !item) throw new Error('Fixture');
  library.items.push({ ...item, id: 'pending-card', origin: 'user' });
  const runner = new CodexRunner('/unused', root, 'fixture');
  const calls = vi.spyOn(runner, 'run').mockRejectedValue(new Error('Offline fixture outage'));
  const workspace = new KnowledgeWorkspace(
    path.join(root, 'overlay.json'),
    path.resolve('resources/knowledge'),
    library,
    async () => catalog,
    () => runner,
    () => CatalogInputLoader.rules(),
  );
  await workspace.init();
  await expect(workspace.ensureCards()).rejects.toThrow('outage');
  await expect(workspace.generation()).rejects.toThrow('outage');
  calls.mockImplementation(async (_prompt, schema) => ({
    value: schema.parse({ entries: [{ id: 'pending-card', observation: first.observation }] }),
    folder: root,
    usage: null,
    threadId: null,
  }));
  await workspace.ensureCards();
  expect(calls).toHaveBeenCalledTimes(2);
  expect((await workspace.generation()).job.status).toBe('ready');
});
