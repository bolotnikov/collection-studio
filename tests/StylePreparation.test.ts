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
  return { preparation, brief, card, variant, profile, library };
}

describe('Reference selection provenance contract', () => {
  it('produces eight explained attachments after all twelve candidates receive director explanations', async () => {
    const f = await prepareFixture('complete');
    const prepared = await f.preparation.prepare(f.brief, f.card, f.variant, f.profile);
    expect(prepared.evidence.analysis.selections).toHaveLength(12);
    expect(prepared.evidence.references).toHaveLength(8);
    expect(prepared.references).toHaveLength(8);
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
  ).toHaveLength(2);
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
