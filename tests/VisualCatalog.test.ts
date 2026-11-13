import { expect, it, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PromptCatalog } from '../src/application/prompts/PromptCatalog';
import { CatalogSyncService } from '../src/application/knowledge/CatalogSyncService';
import { CatalogInputLoader } from '../src/infrastructure/CatalogInputLoader';
import { CodexCatalogAnalysis } from '../src/infrastructure/CodexCatalogAnalysis';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { VisualCatalogStore } from '../src/infrastructure/VisualCatalogStore';
import { VisualCatalogRules } from '../src/domain/VisualCatalogRules';
import { z } from 'zod';
import { Contracts } from '../src/shared/Contracts';
import { StyleContracts } from '../src/shared/StyleContracts';
import { CodexSourceContext } from '../src/infrastructure/style/CodexSourceContext';
import { CodexStylePreparation } from '../src/infrastructure/style/CodexStylePreparation';
import sourceProfile from '../resources/style-profile.json';
import defaults from '../resources/prompts/catalog.json';

const folders: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});
it('catalogs all 160 originals and 16 sets, reuses unchanged observations, and preserves publication on cancellation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-catalog-'));
  folders.push(root);
  const prompts = new PromptCatalog(defaults, defaults);
  const input = await new CatalogInputLoader(path.resolve('resources')).load('fixture-model', prompts.values);
  const runner = new CodexRunner('/unused', root, 'fixture-model');
  const calls = vi.spyOn(runner, 'run').mockImplementation(async (prompt, schema) => {
    let result: unknown;
    const examples = input.knowledge.images.filter((image) => image.role === 'category-example');
    if (prompt.startsWith('ROLE: Category exemplar'))
      result = {
        profiles: examples.map((image) => ({
          id: image.id,
          category: image.category,
          permittedVariations: ['Observed backdrop variation'],
          cautions: [],
        })),
      };
    else if (prompt.startsWith('ROLE: Individual visual')) {
      const manifest = z
        .array(z.object({ id: z.string(), role: z.string() }))
        .parse(JSON.parse(prompt.split('Image manifest: ')[1]?.slice(0, -1) ?? 'null'));
      result = {
        entries: manifest
          .filter((item) => item.role === 'individual-card')
          .map((item) => ({
            id: item.id,
            observation: {
              category: '1',
              subject: 'Synthetic fixture object',
              confidence: 0.9,
              categoryRationale: 'Synthetic offline test classification',
              exemplarIds: [examples[0]?.id],
              alternatives: [],
              uncertainties: [],
              facets: {
                support: 'none',
                backdrop: 'pattern',
                pattern: 'stripes',
                depth: 'flat',
                contextDensity: 'none',
                camera: 'three-quarter',
                subjectScale: 'large',
                characterCount: 0,
                palette: ['blue'],
                materials: ['wood'],
                silhouette: 'rounded',
                rendering: 'Broad painted volumes',
                lighting: 'Soft light',
              },
            },
          })),
      };
    } else if (prompt.startsWith('Examine the individual attached')) {
      const manifest = z
        .array(z.object({ id: z.string() }))
        .parse(JSON.parse(prompt.split('Image manifest: ')[1] ?? 'null'));
      result = {
        entries: manifest.map((card) => ({
          id: card.id,
          facets: {
            backdrop: 'pattern',
            pattern: 'stripes',
            subjectPosition: 'center',
            backgroundColor: 'blue',
          },
        })),
      };
    } else if (prompt.startsWith('ROLE: Set reference curator.')) {
      result = {
        selections: input.knowledge.cleanSets
          ?.slice(0, 2)
          .map((set) => ({ id: set.sourceImageId, reason: 'Relevant whole-set rhythm' })),
        guidance: 'Preserve source rendering and visual variety.',
      };
    } else
      result = {
        theme: 'Fixture set',
        story: 'Coherent synthetic fixture story',
        paletteRhythm: 'Varied complementary colors',
        backgroundRhythm: 'Alternating backdrop treatments',
        scaleAndCameraRhythm: 'Varied readable subject scales',
        semanticRoles: Array.from({ length: 10 }, (_, index) => `Role ${index}`),
        cautions: [],
      };
    return { value: schema.parse(result), folder: root, usage: null, threadId: null };
  });
  const adapter = () =>
    new CodexCatalogAnalysis(runner, path.resolve('resources'), root, prompts, CatalogInputLoader.rules());
  const store = new VisualCatalogStore(path.join(root, 'published.json'));
  await new CatalogSyncService(adapter(), store).sync(input);
  const first = await store.read();
  expect(first.cards).toHaveLength(160);
  expect(first.sets).toHaveLength(16);
  expect(first.sets.filter((set) => set.cleanSha256 === null)).toHaveLength(1);
  expect(calls).toHaveBeenCalledTimes(57);
  await new CatalogSyncService(adapter(), store).sync(input);
  expect(calls).toHaveBeenCalledTimes(57);
  const coldAdapter = new CodexCatalogAnalysis(
    runner,
    path.resolve('resources'),
    path.join(root, 'clean-install-cache'),
    prompts,
    CatalogInputLoader.rules(),
    first,
  );
  await new CatalogSyncService(coldAdapter, store).sync(input);
  expect(calls).toHaveBeenCalledTimes(57);
  const changed = structuredClone(input);
  const original = changed.library[0];
  if (!original) throw new Error('Missing original fixture');
  const oldId = original.id;
  original.id += '-updated';
  changed.dependencyHash = 'f'.repeat(64);
  for (const set of changed.memberships)
    for (const card of set.cards) if (card.id === oldId) card.id = original.id;
  for (const set of changed.knowledge.cleanSets ?? [])
    for (const card of set.cards) if (card.id === oldId) card.id = original.id;
  await new CatalogSyncService(coldAdapter, store).sync(changed);
  expect(calls).toHaveBeenCalledTimes(60);
  // Restore the source revision before checking cancellation.
  await new CatalogSyncService(adapter(), store).sync(input);
  const previous = await fs.readFile(path.join(root, 'published.json'), 'utf8');
  await expect(new CatalogSyncService(adapter(), store).sync(input, () => true)).rejects.toThrow('cancelled');
  expect(await fs.readFile(path.join(root, 'published.json'), 'utf8')).toBe(previous);
  const profile = Contracts.profile.parse({
    ...sourceProfile,
    knowledge: input.knowledge,
    visualCatalog: first,
    library: input.library.map((item) => ({
      ...item,
      observation: first.cards.find((card) => card.id === item.id)?.observation,
    })),
  });
  const beforeRuntime = calls.mock.calls.length;
  await new CodexStylePreparation(
    runner,
    profile.library ?? [],
    path.resolve('resources/references'),
    path.join(root, 'empty-runtime-card-cache'),
    'fixture-model',
    StyleContracts.policy.parse({}),
  ).initialize();
  expect(calls.mock.calls.length).toBe(beforeRuntime);
  const brief = Contracts.brief.parse({
    theme: 'Offline cinema',
    wishes: '',
    quality: 'low',
    maxImageCalls: 10,
    autoRepair: true,
  });
  await new CodexSourceContext(
    runner,
    path.resolve('resources/knowledge'),
    path.join(root, 'empty-runtime-source-cache'),
    'fixture-model',
  ).prepare('planning', brief, profile);
  expect(calls.mock.calls.length).toBe(beforeRuntime + 1);
  expect(calls.mock.calls.at(-1)?.[0]).toMatch(/^ROLE: Set reference curator\./);
  const broken = structuredClone(first);
  broken.sets[0]?.cards.splice(0, 1);
  expect(() =>
    VisualCatalogRules.validate(
      broken,
      input.library.map((card) => card.id),
    ),
  ).toThrow();
});
