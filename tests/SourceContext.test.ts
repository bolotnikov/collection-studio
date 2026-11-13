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
import { PromptCatalog } from '../src/application/prompts/PromptCatalog';

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
  expect(PromptBuilder.planning(f.brief, f.profile)).toContain(JSON.stringify(f.brief));
  expect(text).not.toContain('Place results here.');
});
it('reuses completed source analysis and selection across instances; a changed brief reruns selection', async () => {
  const f = await fixture();
  await f.create().prepare('planning', f.brief, f.profile);
  await f.create().prepare('planning', f.brief, f.profile);
  expect(f.calls).toHaveBeenCalledTimes(3);
  await f.create().prepare('planning', { ...f.brief, theme: 'Gardening' }, f.profile);
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

it('imports organized paths while retaining the historical flat image address', async () => {
  const f = await fixture();
  const resources = path.join(f.root, 'organized-resources');
  for (const image of f.corpus.images) {
    const group =
      image.role === 'collection-example'
        ? 'sets'
        : image.role === 'category-example'
          ? `categories/${image.category}`
          : 'delivery';
    const organized = `images/${group}/${image.sha256}.png`;
    const target = path.join(resources, 'knowledge', organized);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(f.root, image.filename), target);
    image.filename = organized;
  }
  await fs.writeFile(path.join(resources, 'knowledge/catalog.json'), JSON.stringify(f.corpus));
  const store = new SourceKnowledgeStore(path.join(f.root, 'organized-store'));
  const imported = await store.import(resources);
  for (const image of imported.images) {
    expect(await fs.readFile(path.join(store.root, image.filename), 'utf8')).toBe(image.id);
    expect(await fs.readFile(path.join(store.root, 'images', `${image.sha256}.png`), 'utf8')).toBe(image.id);
  }
});

it('rejects contradictory roles/categories and duplicate image identities', async () => {
  const f = await fixture();
  const first = f.corpus.images[0];
  if (!first) throw new Error('Fixture missing');
  expect(
    KnowledgeContracts.corpus.safeParse({ ...f.corpus, images: [{ ...first, category: '1' }] }).success,
  ).toBe(false);
  expect(
    KnowledgeContracts.corpus.safeParse({
      ...f.corpus,
      images: [{ ...first, role: 'category-example', category: null }],
    }).success,
  ).toBe(false);
  expect(KnowledgeContracts.corpus.safeParse({ ...f.corpus, images: [first, first] }).success).toBe(false);
});

async function cleanFixture() {
  const f = await fixture();
  const layout = {
    columns: 5 as const,
    rows: 2 as const,
    cardWidth: 430,
    cardHeight: 480,
    gap: 16,
    margin: 16,
    background: '#eceae5',
  };
  f.corpus.cleanSets = [];
  for (const image of f.corpus.images.filter((image) => image.role === 'collection-example')) {
    const bytes = `clean-${image.id}`,
      filename = `images/clean-sets/${image.id}.png`;
    await fs.mkdir(path.join(f.root, 'images/clean-sets'), { recursive: true });
    await fs.writeFile(path.join(f.root, filename), bytes);
    f.corpus.cleanSets.push({
      sourceImageId: image.id,
      sourceSha256: image.sha256,
      filename,
      sha256: hash(bytes),
      layout,
      method: 'original-card-assembly-v1',
      primaryEligible: image.id !== 'gold-set',
      cards: Array.from({ length: 10 }, (_, i) => ({
        slot: i + 1,
        id: `${image.id}-card-${i}`,
        filename: `${image.id}-${i}.png`,
        source: 'fixture',
        sha256: hash(`${image.id}-${i}`),
        use: image.id === 'gold-set' ? ('excluded-gold-character' as const) : ('ordinary' as const),
        match: { error: 0, runnerUpError: 100 },
      })),
    });
  }
  f.profile.knowledge = KnowledgeContracts.corpus.parse(f.corpus);
  return f;
}
it('uses original clean sheets first at final review and retains only one UI screenshot as secondary context', async () => {
  const f = await cleanFixture();
  const context = await f.create().prepare('set-review', f.brief, f.profile);
  expect(context.referencePaths.slice(0, 2)).toEqual(
    ['set-a', 'set-b'].map((id) => path.join(f.root, `images/clean-sets/${id}.png`)),
  );
  expect(context.evidence.cleanSets).toHaveLength(2);
  expect(context.evidence.cleanSets?.every((sheet) => sheet.primaryEligible)).toBe(true);
  expect(
    context.evidence.images.filter((image) => image.role === 'collection-example' && image.attached),
  ).toHaveLength(1);
  expect(
    context.evidence.images.filter((image) => image.role === 'category-example' && image.attached),
  ).toHaveLength(4);
  const finalPrompt = PromptBuilder.sourceContext(
    { ...context.profile, promptCatalog: new PromptCatalog().values },
    undefined,
    'set-review',
  );
  expect(finalPrompt).toContain('"image":1,"role":"candidate-set"');
  expect(finalPrompt).toContain('"image":2,"id":"set-a","role":"primary-clean-set"');
  expect(finalPrompt).toContain('"image":3,"id":"set-b","role":"primary-clean-set"');
});
it('rejects changed clean-sheet bytes before returning final review attachments', async () => {
  const f = await cleanFixture();
  await fs.writeFile(path.join(f.root, 'images/clean-sets/set-a.png'), 'changed');
  await expect(f.create().prepare('set-review', f.brief, f.profile)).rejects.toThrow(
    'Clean-set reference integrity',
  );
});
it('validates clean-sheet lineage, order and no-gold primary eligibility', async () => {
  const f = await cleanFixture();
  const first = f.corpus.cleanSets?.[0];
  if (!first) throw new Error('Fixture missing');
  expect(
    KnowledgeContracts.corpus.safeParse({
      ...f.corpus,
      cleanSets: [{ ...first, sourceSha256: hash('wrong') }],
    }).success,
  ).toBe(false);
  expect(
    KnowledgeContracts.corpus.safeParse({ ...f.corpus, cleanSets: [{ ...first, primaryEligible: false }] })
      .success,
  ).toBe(false);
  expect(
    KnowledgeContracts.corpus.safeParse({
      ...f.corpus,
      cleanSets: [{ ...first, cards: [...first.cards].reverse() }],
    }).success,
  ).toBe(false);
});

it('imports verified clean sheets and rejects a layout declaration that differs from actual pixels', async () => {
  const f = await cleanFixture();
  const sharp = (await import('sharp')).default;
  const resources = path.join(f.root, 'clean-import');
  await fs.mkdir(path.join(resources, 'knowledge'), { recursive: true });
  await fs.cp(path.join(f.root, 'images'), path.join(resources, 'knowledge/images'), { recursive: true });
  await fs.mkdir(path.join(resources, 'references'), { recursive: true });
  for (const sheet of f.corpus.cleanSets ?? []) {
    const bytes = await sharp({ create: { width: 2246, height: 1008, channels: 3, background: '#eceae5' } })
      .png()
      .toBuffer();
    sheet.sha256 = createHash('sha256').update(bytes).digest('hex');
    await fs.writeFile(path.join(resources, 'knowledge', sheet.filename), bytes);
    for (const card of sheet.cards)
      await fs.writeFile(
        path.join(resources, 'references', card.filename),
        `${sheet.sourceImageId}-${card.slot - 1}`,
      );
  }
  const catalog = path.join(resources, 'knowledge/catalog.json');
  await fs.writeFile(catalog, JSON.stringify(f.corpus));
  const store = new SourceKnowledgeStore(path.join(f.root, 'clean-imported'));
  expect((await store.import(resources)).cleanSets).toHaveLength(3);
  const first = f.corpus.cleanSets?.[0];
  if (!first) throw new Error('Fixture missing');
  first.layout.cardWidth = 215;
  await fs.writeFile(catalog, JSON.stringify(f.corpus));
  await expect(store.import(resources)).rejects.toThrow('dimensions');
});

it('keeps all categories for planning but only the current category analysis in card generation and review', async () => {
  const f = await fixture();
  f.profile.requirements = [
    { id: 'set', title: 'Set structure', rules: ['Each set has ten cards and all four categories.'] },
  ];
  const context = f.create();
  const prepared = await context.prepare('card', f.brief, f.profile, undefined, f.card);
  const siblings = (['2', '3', '4'] as const).map((category) => ({
    ...f.card,
    id: `peer-${category}`,
    subject: `Peer ${category}`,
    category,
    visual: {
      materials: ['wood'],
      silhouette: 'A clear peer silhouette.',
      paletteRole: 'A blue peer accent.',
      composition: f.profile.categories[category],
    },
  }));
  const variant = Contracts.variant.parse({
    id: 'set',
    title: 'Detective tools',
    concept: 'Connected clues',
    cards: [f.card, ...siblings],
    review: null,
    reviewError: null,
  });
  for (const prompt of [
    PromptBuilder.build(f.card, variant, prepared.profile),
    PromptBuilder.cardReview(f.card, prepared.profile, f.brief),
  ]) {
    expect(prompt).toContain(f.profile.categories['1']);
    expect(prompt).toContain('Observed rule-1');
    for (const category of ['2', '3', '4'] as const) {
      expect(prompt).not.toContain(f.profile.categories[category]);
      expect(prompt).not.toContain(`Observed rule-${category}`);
    }
    expect(prompt).toContain('all four categories');
  }
  const planning = PromptBuilder.planning(f.brief, f.profile);
  const planReview = PromptBuilder.planReview(f.brief, variant, f.profile);
  const setReview = PromptBuilder.setReview(variant, prepared.profile, f.brief);
  for (const rule of Object.values(f.profile.categories)) {
    expect(planning).toContain(rule);
    expect(planReview).toContain(rule);
    expect(setReview).toContain(rule);
  }
});

it('invalidates source-set analysis when active category definitions or rendering rules change', async () => {
  const f = await fixture();
  f.profile.requirements = [{ id: 'content', title: 'Content', rules: ['Ordinary object art only.'] }];
  await f.create().prepare('planning', f.brief, f.profile);
  const first = f.calls.mock.calls.length;
  await f.create().prepare('planning', f.brief, f.profile);
  expect(f.calls.mock.calls.length).toBe(first);
  f.profile.categories['1'] = 'A floating subject on a plain white background.';
  await f.create().prepare('planning', f.brief, f.profile);
  expect(f.calls.mock.calls.length).toBe(first + 3);
  f.profile.rules = ['Use broad painted highlights and matte surfaces.'];
  await f.create().prepare('planning', f.brief, f.profile);
  expect(f.calls.mock.calls.length).toBe(first + 6);
});

it('pins the accepted prototype first in final clean-sheet comparison even if retrieval prefers another set', async () => {
  const f = await cleanFixture();
  const { CompositionFixture } = await import('./fixtures/CompositionFixture');
  const { variant } = CompositionFixture.create();
  const composition = variant.artContract?.composition;
  if (!composition) throw new Error('Fixture');
  composition.selection = {
    version: 'source-prototype-v1',
    sourceSetId: 'set-b',
    slots: composition.targets.map((target) => ({
      index: target.index,
      sourceCardId: `member-${target.index}`,
      sourceRequired: target.required,
      adaptedFacets: [],
    })),
  };
  const context = await f.create().prepare('set-review', f.brief, f.profile, variant);
  expect(context.evidence.cleanSets?.map((sheet) => sheet.sourceImageId)).toEqual(['set-b', 'set-a']);
  expect(context.referencePaths[0]).toBe(path.join(f.root, 'images/clean-sets/set-b.png'));
  composition.selection.sourceSetId = 'missing-source';
  await expect(f.create().prepare('set-review', f.brief, f.profile, variant)).rejects.toThrow(
    'prototype is unavailable',
  );
});

it('builds card and final comparison context from the shipped catalog with zero model calls', async () => {
  const { ContextOptimization } = await import('../src/shared/ContextOptimization');
  const { VisualCatalogStore } = await import('../src/infrastructure/VisualCatalogStore');
  const { CompositionFixture } = await import('./fixtures/CompositionFixture');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prepared-comparison-'));
  folders.push(root);
  const catalog = await new VisualCatalogStore('resources/knowledge/visual-catalog.json').read();
  const corpus = KnowledgeContracts.corpus.parse(
    JSON.parse(await fs.readFile('resources/knowledge/catalog.json', 'utf8')),
  );
  const profile = Contracts.profile.parse({
    ...JSON.parse(await fs.readFile('resources/style-profile.json', 'utf8')),
    knowledge: corpus,
    visualCatalog: catalog,
    contextOptimization: ContextOptimization.defaults,
  });
  const runner = new CodexRunner('/unused', root, 'fixture');
  const calls = vi.spyOn(runner, 'run').mockRejectedValue(new Error('No model calls allowed'));
  const { variant } = CompositionFixture.create();
  const brief = Contracts.brief.parse({
    theme: 'Prepared comparisons',
    wishes: '',
    variants: 1,
    quality: 'low',
    maxImageCalls: 30,
    autoRepair: true,
  });
  for (const includeGold of [false, true]) {
    const context = new CodexSourceContext(runner, path.resolve('resources/knowledge'), root, 'fixture');
    const input = { ...brief, includeGold };
    const card = variant.cards[0];
    if (!card) throw new Error('Fixture');
    const prepared = await context.prepare('card', input, profile, variant, card);
    expect(
      prepared.evidence.images
        .filter((image) => image.role === 'category-example' && image.attached)
        .map((image) => image.category),
    ).toEqual([card.category]);
    const result = await context.prepare('set-review', input, profile, variant);
    expect(result.evidence.cleanSets?.length).toBeGreaterThanOrEqual(2);
    expect(result.evidence.cleanSets?.length).toBeLessThanOrEqual(4);
    expect(result.evidence.cleanSets?.some((sheet) => !sheet.primaryEligible)).toBe(includeGold);
    const repeat = await context.prepare('set-review', input, profile, variant);
    expect(repeat.referencePaths).toEqual(result.referencePaths);
  }
  expect(calls).not.toHaveBeenCalled();
});
