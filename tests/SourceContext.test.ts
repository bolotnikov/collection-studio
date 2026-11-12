import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { Contracts } from '../src/shared/Contracts';
import { KnowledgeContracts, type SourceKnowledge } from '../src/shared/KnowledgeContracts';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { CodexSourceContext } from '../src/infrastructure/style/CodexSourceContext';
import { SourceKnowledgeStore } from '../src/infrastructure/SourceKnowledgeStore';
import { PromptBuilder } from '../src/application/PromptBuilder';

const folders: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'source-context-'));
  folders.push(root);
  await fs.mkdir(path.join(root, 'images'));
  const corpus: SourceKnowledge = {
    version: 1,
    documents: [
      {
        id: 'assignment',
        title: 'Task',
        source: 'fixture',
        filename: 'task.txt',
        sha256: hash('No gold cards; three genres.'),
        text: 'No gold cards; three genres.',
        role: 'assignment',
      },
      {
        id: 'rules',
        title: 'Rules',
        source: 'fixture',
        filename: 'rules.txt',
        sha256: hash('All four categories regardless of rarity.'),
        text: 'All four categories regardless of rarity.',
        role: 'composition-rules',
      },
      {
        id: 'structure',
        title: 'Collection',
        source: 'fixture',
        filename: 'collection.txt',
        sha256: hash('16 sets of ten; rarity does not change objects.'),
        text: '16 sets of ten; rarity does not change objects.',
        role: 'collection-structure',
      },
      {
        id: 'delivery',
        title: 'Delivery',
        source: 'fixture',
        filename: 'delivery.txt',
        sha256: hash('Place results here.'),
        text: 'Place results here.',
        role: 'delivery',
      },
    ],
    images: [],
  };
  for (const [id, role, category] of [
    ['set-a', 'collection-example', null],
    ['set-b', 'collection-example', null],
    ['gold-set', 'collection-example', null],
    ...['1', '2', '3', '4', '5'].map((category) => [`rule-${category}`, 'category-example', category]),
    ['template', 'delivery-template', null],
  ]) {
    if (!id) throw new Error('Fixture ID missing');
    const filename = `images/${id}.png`;
    await fs.writeFile(path.join(root, filename), id);
    corpus.images.push(
      KnowledgeContracts.image.parse({
        id,
        title: id,
        source: 'fixture',
        filename,
        sha256: hash(id),
        role,
        category,
      }),
    );
  }
  const profile = Contracts.profile.parse({
    ...JSON.parse(await fs.readFile('resources/style-profile.json', 'utf8')),
    knowledge: corpus,
  });
  const runner = new CodexRunner('/unused', root, 'fixture-model');
  const calls = vi.spyOn(runner, 'run').mockImplementation(async (prompt, schema) => {
    let output: unknown;
    if (prompt.startsWith('ROLE: Source collection')) {
      const images = KnowledgeContracts.image
        .array()
        .parse(JSON.parse(prompt.split('Image order: ')[1] ?? 'null'));
      output = {
        entries: images.map((image) => ({
          id: image.id,
          analysis: {
            summary: `Observed ${image.id}`,
            theme: 'Summer',
            semanticPrinciples: ['Objects tell a story'],
            visualPrinciples: ['Vary silhouettes'],
            objectRoles: ['Hero', 'support'],
            avoidTransferring: ['Character scenes', 'UI'],
            ordinarySetExample: image.id !== 'gold-set',
          },
        })),
      };
    } else
      output = {
        selections: [
          { id: 'set-a', reason: 'Material variety' },
          { id: 'set-b', reason: 'Coherent object roles' },
        ],
        guidance: 'Match original rendering and vary subject roles.',
      };
    return { value: schema.parse(output), folder: root, usage: null, threadId: null };
  });
  const create = () => new CodexSourceContext(runner, root, path.join(root, 'cache'), 'fixture-model');
  const brief = Contracts.brief.parse({
    theme: 'Detective',
    wishes: 'Soft light',
    variants: 3,
    quality: 'low',
    maxImageCalls: 90,
    autoRepair: true,
  });
  const card = Contracts.card.parse({
    id: 'card',
    subject: 'Fedora',
    description: 'A simple rounded hat',
    role: 'Hero object',
    category: '1',
    status: 'pending',
    attempts: [],
    selectedAttemptId: null,
    locked: false,
    error: null,
  });
  return { root, profile, corpus, calls, create, brief, card };
}
it('uses every source set/category for analysis, retrieves complete sets and excludes delivery/character images from positive attachments', async () => {
  const f = await fixture(),
    context = f.create();
  const planning = await context.prepare('planning', f.brief, f.profile);
  expect(f.calls).toHaveBeenCalledTimes(3);
  expect(planning.evidence.documents.map((d) => d.id)).toEqual(['assignment', 'rules', 'structure']);
  expect(planning.referencePaths).toHaveLength(6);
  expect(planning.evidence.images.find((i) => i.category === '5')?.attached).toBe(false);
  expect(planning.evidence.images.some((i) => i.id === 'gold-set' || i.id === 'template')).toBe(false);
  expect(
    f.calls.mock.calls
      .filter(([prompt]) => prompt.startsWith('ROLE: Source collection'))
      .map(([prompt]) => prompt)
      .join(' '),
  ).toContain('gold-set');
  const cardContext = await context.prepare('card', f.brief, f.profile, undefined, f.card);
  expect(cardContext.referencePaths).toEqual([path.join(f.root, 'images/rule-1.png')]);
  expect(f.calls).toHaveBeenCalledTimes(3);
  const text = PromptBuilder.sourceContext(cardContext.profile);
  expect(text).toContain('All four categories regardless of rarity.');
  expect(text).toContain('16 sets of ten');
  expect(text).toContain('not a request to generate sixteen');
  expect(text).not.toContain('Place results here.');
});
it('reuses visual source analysis across instances while rerunning query-specific selection', async () => {
  const f = await fixture();
  await f.create().prepare('planning', f.brief, f.profile);
  await f.create().prepare('planning', f.brief, f.profile);
  expect(f.calls).toHaveBeenCalledTimes(4);
});
it('rejects changed source images before sending them to a model', async () => {
  const f = await fixture();
  await fs.writeFile(path.join(f.root, 'images/set-a.png'), 'modified');
  await expect(f.create().prepare('planning', f.brief, f.profile)).rejects.toThrow('hash mismatch');
  expect(f.calls).not.toHaveBeenCalled();
});
it('validates imported document and image hashes and retains historical content-addressed assets', async () => {
  const f = await fixture();
  const resources = path.join(f.root, 'resources');
  await fs.mkdir(path.join(resources, 'knowledge'), { recursive: true });
  await fs.cp(path.join(f.root, 'images'), path.join(resources, 'knowledge/images'), { recursive: true });
  const catalog = path.join(resources, 'knowledge/catalog.json');
  await fs.writeFile(catalog, JSON.stringify(f.corpus));
  const store = new SourceKnowledgeStore(path.join(f.root, 'stored'));
  expect((await store.import(resources)).images).toHaveLength(9);
  const original = f.corpus.documents[0];
  if (!original) throw new Error('Fixture missing');
  original.text = 'tampered';
  await fs.writeFile(catalog, JSON.stringify(f.corpus));
  await expect(store.import(resources)).rejects.toThrow('document integrity');
  expect(await fs.readFile(path.join(store.root, 'images/set-a.png'), 'utf8')).toBe('set-a');
});
