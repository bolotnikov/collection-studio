import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { KnowledgeContracts } from '../src/shared/KnowledgeContracts';
import { StyleContracts } from '../src/shared/StyleContracts';
import { SourceKnowledgeStore } from '../src/infrastructure/SourceKnowledgeStore';
import { ReferenceLibrary } from '../src/infrastructure/ReferenceLibrary';

it('ships complete, unique prepared resources that import into empty user data', async () => {
  const resources = path.resolve('resources');
  const corpus = KnowledgeContracts.corpus.parse(
    JSON.parse(await fs.readFile(path.join(resources, 'knowledge/catalog.json'), 'utf8')),
  );
  const library = StyleContracts.libraryItem.array().parse(
    JSON.parse(await fs.readFile(path.join(resources, 'library.json'), 'utf8')),
  );
  const expected = [
    'knowledge/catalog.json',
    'knowledge/visual-catalog.json',
    ...library.map((card) => `references/${card.filename}`),
    ...[...corpus.images, ...(corpus.cleanSets ?? [])].map((image) => `knowledge/${image.filename}`),
  ];
  const actual: string[] = [];
  for (const folder of ['references', 'knowledge']) {
    const entries = await fs.readdir(path.join(resources, folder), {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries)
      if (entry.isFile() && entry.name !== '.DS_Store')
        actual.push(path.relative(resources, path.join(entry.parentPath, entry.name)));
  }
  expect(actual.sort()).toEqual(expected.sort());
  const hashes = new Map<string, string>();
  for (const filename of actual) {
    const bytes = await fs.readFile(path.join(resources, filename));
    const hash = createHash('sha256').update(bytes).digest('hex');
    expect(hashes.get(hash), `Duplicate resource: ${filename}`).toBeUndefined();
    hashes.set(hash, filename);
  }
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'resource-bundle-'));
  try {
    const knowledge = await new SourceKnowledgeStore(path.join(storage, 'knowledge')).import(resources);
    const references = new ReferenceLibrary(path.join(storage, 'references'), storage);
    await references.init(resources);
    expect(knowledge).toEqual(corpus);
    expect(references.items).toHaveLength(library.length);
  } finally {
    await fs.rm(storage, { recursive: true, force: true });
  }
}, 30_000);
