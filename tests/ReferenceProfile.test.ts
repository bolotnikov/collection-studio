import { expect, it } from 'vitest';
import { ReferenceProfile } from '../src/domain/ReferenceProfile';
import { Contracts } from '../src/shared/Contracts';
import { StyleContracts } from '../src/shared/StyleContracts';
import source from '../resources/style-profile.json';
import { CompositionFixture } from './fixtures/CompositionFixture';

it('freezes effective metadata for all stage manifests without changing originals or earlier snapshots', () => {
  const profile = Contracts.profile.parse(source);
  const catalog = profile.references.map((reference) => StyleContracts.libraryItem.parse(reference));
  const original = structuredClone(profile);
  const first = catalog[0];
  if (!first) throw new Error('Missing reference fixture');
  first.metadata = { category: '3', description: 'Manually verified material-surface composition' };
  const snapshot = ReferenceProfile.resolve(profile, catalog);
  expect(snapshot.references[0]?.category).toBe('3');
  expect(snapshot.references[0]?.title).toBe(first.metadata.description);
  expect(snapshot.library?.[0]?.metadata).toEqual(first.metadata);
  first.metadata.category = '2';
  expect(snapshot.references[0]?.category).toBe('3');
  expect(snapshot.library?.[0]?.metadata?.category).toBe('3');
  expect(profile).toEqual(original);
  first.sha256 = 'changed';
  expect(() => ReferenceProfile.resolve(profile, catalog)).toThrow('identity mismatch');
});

it('applies manual metadata to composition planning as a separately versioned frozen projection', () => {
  const { catalog } = CompositionFixture.create();
  const items = catalog.cards.map((card) =>
    StyleContracts.libraryItem.parse({
      ...card,
      title: card.observation.subject,
      category: card.observation.category,
      source: 'fixture',
    }),
  );
  const profile = Contracts.profile.parse({ ...source, visualCatalog: catalog, references: items });
  const first = items[0];
  if (!first) throw new Error('Missing fixture');
  first.metadata = { category: '3', description: 'Manually corrected reference identity' };
  expect(() => ReferenceProfile.resolve(profile, items)).toThrow('own catalog revision');
  const snapshot = ReferenceProfile.resolve(profile, items, 'd'.repeat(64));
  expect(snapshot.visualCatalog?.cards[0]?.observation.category).toBe('3');
  expect(snapshot.visualCatalog?.cards[0]?.observation.subject).toBe(first.metadata.description);
  expect(snapshot.visualCatalog?.dependencyHash).toBe('d'.repeat(64));
  expect(snapshot.visualCatalog?.baseDependencyHash).toBe(catalog.dependencyHash);
  expect(profile.visualCatalog?.cards[0]?.observation.category).toBe('1');
});
