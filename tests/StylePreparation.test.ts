import { PromptCatalog } from '../src/application/prompts/PromptCatalog';
import productionPrompts from '../resources/prompts/production.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { CodexStylePreparation } from '../src/infrastructure/style/CodexStylePreparation';
import { Contracts } from '../src/shared/Contracts';
import { StyleContracts, type LibraryItem } from '../src/shared/StyleContracts';

const folders: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});

async function prepareFixture(mode: 'complete' | 'missing' | 'duplicate') {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-prepare-'));
  folders.push(folder);
  const library: LibraryItem[] = [];
  for (let index = 0; index < 12; index++) {
    const bytes = Buffer.from(`Reference fixture ${index}`);
    const item = StyleContracts.libraryItem.parse({
      id: String(index),
      filename: `${index}.png`,
      title: `Wooden object ${index}`,
      category: String((index % 4) + 1),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      source: 'fixture',
    });
    library.push(item);
    await fs.writeFile(path.join(folder, item.filename), bytes);
  }
  const runner = new CodexRunner('/unused', folder, 'fixture-model');
  vi.spyOn(runner, 'run').mockImplementation(async (prompt, schema, images = []) => {
    let response: unknown;
    if (prompt.includes('ROLE: Reference librarian.')) {
      response = {
        entries: images.map((image) => ({
          id: path.basename(image, '.png'),
          analysis: {
            eligible: true,
            exclusionReason: '',
            subject: 'Wooden object',
            materials: ['wood'],
            silhouette: 'rounded',
            rendering: 'painted volume',
            lighting: 'soft',
            palette: 'saturated',
            background: 'simple',
            category: '1',
            usefulPrinciples: ['broad highlights'],
            avoidCopying: ['reference subject'],
          },
        })),
      };
    } else if (prompt.includes('ROLE: Producer brief analyst.')) {
      response = {
        direction: 'Coherent detective props',
        retrievalTerms: ['wood', 'rounded'],
        requirements: ['No text'],
      };
    } else if (prompt.includes('ROLE: Reference selector and art director.')) {
      const entries = images.map((image) => ({
        id: path.basename(image, '.png'),
        reason: 'Material and rendering evidence',
        role: 'style anchor',
        take: 'Broad soft highlights',
        ignore: 'Reference object identity',
        coverage: { useful: true, conflict: false, rendering: true, lighting: true, materials: ['wood'] },
      }));
      const first = entries[0];
      if (!first) throw new Error('No candidate images supplied to visual director');
      const selections =
        mode === 'missing'
          ? entries.slice(1)
          : mode === 'duplicate'
            ? [...entries.slice(1), entries[1] ?? first]
            : entries;
      response = {
        selections,
        visualDirection: 'Painted rounded volumes',
        materialGuidance: 'Simplified wood',
        compositionGuidance: 'Complete centered silhouette',
        pitfalls: ['Photographic grain'],
      };
    } else throw new Error('Unexpected specialist task');
    return { value: schema.parse(response), folder, usage: null, threadId: null };
  });
  const preparation = new CodexStylePreparation(
    runner,
    library,
    folder,
    path.join(folder, 'cache'),
    'fixture-model',
    StyleContracts.policy.parse({ referenceLimit: 8 }),
  );
  const brief = Contracts.brief.parse({
    theme: 'Detective objects',
    wishes: 'No text',
    variants: 3,
    quality: 'low',
    maxImageCalls: 90,
    autoRepair: true,
  });
  const card = Contracts.card.parse({
    id: 'card',
    subject: 'Wooden magnifier',
    description: 'A rounded wooden magnifier with readable glass',
    category: '1',
    role: 'Clue examination',
    status: 'pending',
    attempts: [],
    selectedAttemptId: null,
    locked: false,
    error: null,
  });
  const variant = Contracts.variant.parse({
    id: 'variant',
    title: 'Detective desk',
    concept: 'One coherent investigation through tools',
    cards: [card],
    review: null,
    reviewError: null,
  });
  const profile = Contracts.profile.parse({
    id: 'profile',
    name: 'Source game style',
    rules: ['Rounded volumes and soft directional light'],
    categories: {
      '1': 'Floating object',
      '2': 'Simple surface',
      '3': 'Material surface',
      '4': 'Surrounding environment',
    },
    references: library,
  });
  return { preparation, brief, card, variant, profile, library, runner, folder };
}

describe('Reference selection provenance contract', () => {
  it('keeps only sufficient explained attachments after all twelve candidates receive visual review', async () => {
    const f = await prepareFixture('complete');
    const prepared = await f.preparation.prepare(f.brief, f.card, f.variant, f.profile);
    expect(prepared.evidence.analysis.selections).toHaveLength(12);
    expect(prepared.evidence.references).toHaveLength(2);
    expect(prepared.references).toHaveLength(2);
    for (const reference of prepared.evidence.references) {
      expect(reference.reason).toBe('Material and rendering evidence');
      expect(reference.take).toBe('Broad soft highlights');
      expect(reference.ignore).toBe('Reference object identity');
    }
    expect(prepared.prompt).toContain('SELECTED ART REFERENCE ROLES IN ORDER');
  });
  it.each(['missing', 'duplicate'] as const)(
    'rejects a %s candidate explanation before returning a generation prompt',
    async (mode) => {
      const f = await prepareFixture(mode);
      await expect(f.preparation.prepare(f.brief, f.card, f.variant, f.profile)).rejects.toThrow(
        'explain every candidate exactly once',
      );
    },
  );
});

it('uses analyzed categories and reruns visual retrieval when correction requirements change', async () => {
  const f = await prepareFixture('complete');
  const first = await f.preparation.prepare(f.brief, f.card, f.variant, f.profile);
  expect(
    first.evidence.references.filter((reference) => reference.purposes?.includes('category')).length,
  ).toBeGreaterThanOrEqual(2);
  expect(
    first.evidence.references.filter((reference) => reference.purposes?.includes('shared-style')),
  ).toHaveLength(0);
  // The fixture's catalog spans four categories; the visual analyzer identifies every image as category 1.
  expect(first.evidence.references.every((reference) => reference.category === '1')).toBe(true);
  const revised = await f.preparation.prepare(
    f.brief,
    f.card,
    f.variant,
    f.profile,
    'Use frosted glass instead of shiny wood',
  );
  expect(revised.evidence.query).toContain('frosted glass');
  expect(revised.evidence.query).not.toBe(first.evidence.query);
});

it('uses curated categories in retrieval and passes curated descriptions to the visual selector', async () => {
  const f = await prepareFixture('complete');
  for (const item of f.library.slice(2, 4))
    item.metadata = { category: '3', description: 'Curated marble tabletop reference.' };
  const card = { ...f.card, category: '3' as const };
  const result = await f.preparation.prepare(f.brief, card, f.variant, f.profile);
  expect(
    result.evidence.references.filter((reference) => reference.purposes?.includes('category')).length,
  ).toBeGreaterThanOrEqual(2);
  expect(
    result.evidence.references
      .filter((reference) => reference.purposes?.includes('category'))
      .every((reference) => reference.category === '3'),
  ).toBe(true);
});

it('reuses successful preparation after restart despite evidence timestamps, and verifies reference bytes', async () => {
  const f = await prepareFixture('complete');
  const profile = {
    ...f.profile,
    knowledgeContext: {
      version: 1 as const,
      stage: 'card' as const,
      model: 'fixture',
      documents: [],
      images: [],
      guidance: 'Keep source proportions',
      createdAt: 'first',
    },
  };
  const first = await f.preparation.prepare(f.brief, f.card, f.variant, profile);
  const calls = vi.mocked(f.runner.run).mock.calls.length;
  const restarted = () =>
    new CodexStylePreparation(
      f.runner,
      f.library,
      f.folder,
      path.join(f.folder, 'cache'),
      'fixture-model',
      StyleContracts.policy.parse({ referenceLimit: 8 }),
    );
  const same = await restarted().prepare(f.brief, f.card, f.variant, {
    ...profile,
    knowledgeContext: { ...profile.knowledgeContext, createdAt: 'later' },
  });
  expect(same).toEqual(first);
  expect(vi.mocked(f.runner.run).mock.calls).toHaveLength(calls);
  await restarted().prepare(f.brief, f.card, f.variant, profile, 'Change the material');
  expect(vi.mocked(f.runner.run).mock.calls.length).toBeGreaterThan(calls);
  const reference = first.references[0];
  if (!reference) throw new Error('Missing reference fixture');
  await fs.writeFile(reference, 'tampered bytes');
  await expect(restarted().prepare(f.brief, f.card, f.variant, profile)).rejects.toThrow('identity mismatch');
});

it('retains the old selection protocol for frozen prompt snapshots without coverage metadata', async () => {
  const f = await prepareFixture('complete');
  const historical = Object.fromEntries(
    Object.entries(productionPrompts).filter(([key]) => key !== 'reference.coverage.v1'),
  );
  const preparation = new CodexStylePreparation(
    f.runner,
    f.library,
    f.folder,
    path.join(f.folder, 'historical-cache'),
    'fixture-model',
    StyleContracts.policy.parse({}),
    new PromptCatalog(historical),
  );
  const result = await preparation.prepare(f.brief, f.card, f.variant, f.profile);
  expect(result.references).toHaveLength(8);
});

it('reuses the accepted brief without an analyst call while preserving the visual reference assessment', async () => {
  const f = await prepareFixture('complete');
  const { CompositionFixture } = await import('./fixtures/CompositionFixture');
  f.variant.artContract = CompositionFixture.create().variant.artContract;
  if (!f.variant.artContract) throw new Error('Fixture art contract missing.');
  delete f.variant.artContract.composition;
  const { ContextOptimization } = await import('../src/shared/ContextOptimization');
  const profile = { ...f.profile, contextOptimization: ContextOptimization.defaults };
  const result = await f.preparation.prepare(f.brief, f.card, f.variant, profile);
  const prompts = vi.mocked(f.runner.run).mock.calls.map(([prompt]) => prompt);
  expect(prompts.some((prompt) => prompt.includes('ROLE: Producer brief analyst.'))).toBe(false);
  expect(
    prompts.filter((prompt) => prompt.includes('ROLE: Reference selector and art director.')),
  ).toHaveLength(1);
  expect(result.evidence.references.length).toBeGreaterThanOrEqual(2);
  const before = prompts.length;
  await f.preparation.prepare(f.brief, f.card, f.variant, profile);
  expect(vi.mocked(f.runner.run).mock.calls).toHaveLength(before);
});

it('uses labelled catalogue evidence when visual reference assessment fails in automatic delivery mode', async () => {
  const f = await prepareFixture('missing');
  const result = await f.preparation.prepare(f.brief, f.card, f.variant, {
    ...f.profile,
    allowQualityWarnings: true,
  });
  expect(result.references.length).toBeGreaterThanOrEqual(2);
  expect(result.evidence.model).toBe('deterministic:catalogue-fallback-v1');
  expect(result.evidence.warnings?.join(' ')).toContain('without fresh visual confirmation');
  expect(
    result.evidence.analysis.selections.every((selection) => selection.compositionMatches === false),
  ).toBe(true);
});

it('reuses persisted visual observations with zero model calls in catalogue-only selection', async () => {
  const f = await prepareFixture('complete');
  const { CompositionFixture } = await import('./fixtures/CompositionFixture');
  const { ContextOptimization } = await import('../src/shared/ContextOptimization');
  const fixture = CompositionFixture.create();
  const sample = fixture.catalog.cards[0];
  if (!sample) throw new Error('Missing fixture observation');
  for (const item of f.library) {
    item.observation = structuredClone(sample.observation);
    item.category = '1';
  }
  f.variant.artContract = fixture.variant.artContract;
  if (!f.variant.artContract) throw new Error('Missing fixture contract');
  delete f.variant.artContract.composition;
  const result = await f.preparation.prepare(f.brief, f.card, f.variant, {
    ...f.profile,
    referenceSelection: 'catalogue-v1',
    contextOptimization: ContextOptimization.defaults,
    allowQualityWarnings: true,
  });
  expect(f.runner.run).not.toHaveBeenCalled();
  expect(result.evidence.model).toBe('deterministic:prepared-catalogue-v1');
  expect(result.references.length).toBeGreaterThanOrEqual(2);
  expect(result.references.length).toBeLessThan(8);
});

it('attaches only exact slot matches and never prepends the first two profile references', async () => {
  const f = await prepareFixture('complete');
  const { CompositionFixture } = await import('./fixtures/CompositionFixture');
  const fixture = CompositionFixture.create();
  const matching = fixture.catalog.cards[0]?.observation;
  const unrelated = fixture.catalog.cards[8]?.observation;
  if (!matching || !unrelated) throw new Error('Missing fixture observations');
  f.library.forEach((item, index) => {
    item.observation = structuredClone(index < 2 ? unrelated : matching);
    item.category = item.observation.category;
  });
  f.variant.artContract = fixture.variant.artContract;
  const target = f.variant.artContract?.composition?.targets[0];
  if (!target) throw new Error('Missing slot target');
  target.referenceIds = f.library.slice(2).map((item) => item.id);
  target.selectedReferenceIds = ['2', '3'];
  const profile = {
    ...f.profile,
    referenceSelection: 'catalogue-v1' as const,
    contextOptimization: (await import('../src/shared/ContextOptimization')).ContextOptimization.defaults,
    allowQualityWarnings: true,
  };
  const result = await f.preparation.prepare(f.brief, f.card, f.variant, profile);
  expect(f.runner.run).not.toHaveBeenCalled();
  expect(result.evidence.references.map((item) => item.id)).toEqual(['2', '3']);
  expect(result.references.every((file) => !['0.png', '1.png'].includes(path.basename(file)))).toBe(true);
  expect(result.evidence.references.every((item) => item.purposes?.includes('category'))).toBe(true);
  f.card.visual = {
    materials: ['glass'],
    silhouette: 'Rounded shape',
    paletteRole: 'Bright contrast',
    composition: 'Same assigned composition',
  };
  const revised = await f.preparation.prepare(
    f.brief,
    f.card,
    f.variant,
    profile,
    'Correct the material while preserving the original slot',
  );
  expect(revised.references).toEqual(result.references);
  expect(revised.evidence.warnings?.join(' ')).toContain('glass');
  expect(f.runner.run).not.toHaveBeenCalled();
});
