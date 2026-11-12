import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Contracts, type Card, type Review } from '../src/shared/Contracts';
import { ReferenceLibrary } from '../src/infrastructure/ReferenceLibrary';
import { StyleContracts } from '../src/shared/StyleContracts';

const directories: string[] = [];
const accepted: Review = {
  passed: true,
  style: 5,
  readability: 5,
  subjectMatch: 5,
  categoryMatch: true,
  findings: [],
  correction: '',
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-library-test-'));
  directories.push(directory);
  const resources = path.join(directory, 'resources');
  const root = path.join(directory, 'library');
  const storage = path.join(directory, 'settings');
  const runFolder = path.join(directory, 'run');
  await Promise.all([
    fs.mkdir(path.join(resources, 'references'), { recursive: true }),
    fs.mkdir(storage),
    fs.mkdir(runFolder),
  ]);
  const anchorBytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#2277aa' } })
    .png()
    .toBuffer();
  const generatedBytes = await sharp({
    create: { width: 32, height: 32, channels: 3, background: '#aa7722' },
  })
    .png()
    .toBuffer();
  const anchor = StyleContracts.libraryItem.parse({
    id: 'employer-anchor',
    filename: 'anchor.png',
    title: 'Original source',
    category: '1',
    sha256: createHash('sha256').update(anchorBytes).digest('hex'),
    source: 'https://example.com/source',
    origin: 'anchor',
    approved: true,
    tags: ['source'],
  });
  await fs.writeFile(path.join(resources, 'references', anchor.filename), anchorBytes);
  await fs.writeFile(path.join(resources, 'library.json'), JSON.stringify([anchor]));
  await fs.writeFile(path.join(runFolder, 'preview.png'), generatedBytes);
  const card = Contracts.card.parse({
    id: randomUUID(),
    subject: 'Fixture object',
    description: 'Synthetic fixture for library approval',
    category: '1',
    role: 'Test subject',
    status: 'done',
    locked: false,
    error: null,
    selectedAttemptId: 'accepted-attempt',
    attempts: [
      {
        id: 'accepted-attempt',
        master: 'master.png',
        preview: 'preview.png',
        prompt: 'Fixture',
        model: 'offline',
        createdAt: '2026-11-12T10:00:00Z',
        elapsedMs: 1,
        requestId: null,
        usage: null,
        review: { ...accepted },
        reviewError: null,
      },
    ],
  });
  const run = Contracts.run.parse({
    id: randomUUID(),
    createdAt: '2026-11-12T10:00:00Z',
    updatedAt: '2026-11-12T10:00:00Z',
    brief: {
      theme: 'Fixture set',
      wishes: '',
      variants: 3,
      quality: 'low',
      maxImageCalls: 36,
      autoRepair: true,
    },
    status: 'completed',
    stage: 'Fixture ready',
    imageCalls: 1,
    variants: [],
    imageModel: 'offline',
    textModel: 'offline',
    events: [],
    selectedVariantId: null,
  });
  const library = new ReferenceLibrary(root, storage);
  await library.init(resources);
  return { library, resources, root, storage, runFolder, anchor, anchorBytes, generatedBytes, card, run };
}

describe('Reference library approval boundary', () => {
  it('preserves immutable employer anchors and refuses their removal', async () => {
    const f = await fixture();
    await expect(f.library.remove(f.anchor.id)).rejects.toThrow('Original style anchors cannot be removed.');
    expect(f.library.items).toEqual([f.anchor]);
    expect(await fs.readFile(path.join(f.root, f.anchor.filename))).toEqual(f.anchorBytes);
    expect(await fs.readFile(path.join(f.resources, 'references', f.anchor.filename))).toEqual(f.anchorBytes);
  });

  it.each([
    { name: 'failed review', review: { ...accepted, passed: false }, reviewError: null },
    { name: 'missing review', review: null, reviewError: null },
    { name: 'review error', review: { ...accepted }, reviewError: 'Verifier unavailable' },
    { name: 'style below policy threshold', review: { ...accepted, style: 3 }, reviewError: null },
  ])('rejects promotion for $name before adding image bytes', async ({ review, reviewError }) => {
    const f = await fixture();
    const card: Card = {
      ...f.card,
      attempts: f.card.attempts.map((attempt) => ({ ...attempt, review, reviewError })),
    };
    await expect(f.library.approve(f.run, card, f.runFolder)).rejects.toThrow(
      'Only reviewed and accepted images',
    );
    expect(f.library.items).toEqual([f.anchor]);
    expect(await fs.readdir(f.root)).toEqual([f.anchor.filename]);
  });

  it('persists provenance, deduplicates identical content and removes eligibility without deleting historical pixels', async () => {
    const f = await fixture();
    await f.library.approve(f.run, f.card, f.runFolder);
    const promoted = f.library.items.find((item) => item.origin === 'user');
    expect(promoted).toBeDefined();
    if (!promoted) throw new Error('Promotion missing.');
    expect(promoted.sha256).toBe(createHash('sha256').update(f.generatedBytes).digest('hex'));
    expect(promoted.source).toBe(`run:${f.run.id}/card:${f.card.id}/attempt:accepted-attempt`);
    expect(await fs.readFile(path.join(f.root, promoted.filename))).toEqual(f.generatedBytes);
    const duplicate: Card = {
      ...f.card,
      id: randomUUID(),
      selectedAttemptId: 'duplicate-attempt',
      attempts: f.card.attempts.map((attempt) => ({ ...attempt, id: 'duplicate-attempt' })),
    };
    await f.library.approve(f.run, duplicate, f.runFolder);
    expect(f.library.items.filter((item) => item.origin === 'user')).toHaveLength(1);

    const reopened = new ReferenceLibrary(f.root, f.storage);
    await reopened.init(f.resources);
    expect(reopened.items).toEqual(f.library.items);
    await reopened.remove(promoted.id);
    expect(reopened.items).toEqual([f.anchor]);
    expect(await fs.readFile(path.join(f.root, promoted.filename))).toEqual(f.generatedBytes);
    expect(await fs.readFile(path.join(f.runFolder, 'preview.png'))).toEqual(f.generatedBytes);
    const restarted = new ReferenceLibrary(f.root, f.storage);
    await restarted.init(f.resources);
    expect(restarted.items).toEqual([f.anchor]);
  });

  it('rejects tampered bundled anchor bytes before accepting the catalog', async () => {
    const f = await fixture();
    await fs.writeFile(path.join(f.resources, 'references', f.anchor.filename), f.generatedBytes);
    const library = new ReferenceLibrary(path.join(f.root, 'fresh'), f.storage);
    await expect(library.init(f.resources)).rejects.toThrow('Reference source hash mismatch.');
    expect(library.items).toEqual([]);
  });
});
