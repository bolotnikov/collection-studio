import { expect, it } from 'vitest';
import { ComparisonSetSelector } from '../src/domain/ComparisonSetSelector';
import { ContextOptimization } from '../src/shared/ContextOptimization';
import { CompositionFixture } from './fixtures/CompositionFixture';

class ComparisonFixture {
  static create() {
    const f = CompositionFixture.create();
    const first = f.catalog.sets[0],
      composition = f.variant.artContract?.composition;
    if (!first || !composition) throw new Error('Fixture');
    composition.targets.forEach((target) => {
      const card = f.catalog.cards[target.index];
      if (!card) throw new Error('Fixture');
      const { support, backdrop, pattern, depth, contextDensity, characterCount } = card.observation.facets;
      target.required = { support, backdrop, pattern, depth, contextDensity, characterCount };
    });
    f.catalog.sets = [
      { ...first, id: 'a' },
      { ...structuredClone(first), id: 'b' },
    ];
    const extra = f.catalog.cards
      .slice(0, 2)
      .map((card, index) => ({
        ...structuredClone(card),
        id: 'extra-' + index,
        sha256: String(index + 70).padStart(64, '0'),
        observation: {
          ...card.observation,
          category: '4' as const,
          facets: {
            ...card.observation.facets,
            support: 'environment' as const,
            backdrop: 'environment' as const,
            pattern: 'none' as const,
            depth: 'spatial' as const,
            contextDensity: 'contextual' as const,
          },
        },
      }));
    f.catalog.cards.push(...extra);
    f.catalog.sets.push({
      ...structuredClone(first),
      id: 'c',
      analysis: { ...first.analysis, theme: f.variant.concept },
      cards: first.cards.map((member, index) => {
        const card = extra[index];
        return card ? { ...member, id: card.id, sha256: card.sha256 } : member;
      }),
    });
    return { ...f, selector: new ComparisonSetSelector(ContextOptimization.defaults) };
  }
}
it('ranks prepared joint patterns above thematic resemblance without changing the planned slots', () => {
  const f = ComparisonFixture.create(),
    frozen = structuredClone(f.variant);
  const selected = f.selector.select(f.variant, f.catalog, ['c', 'b', 'a'], false);
  expect(selected.ids).toEqual(['a', 'b']);
  expect(
    f.selector.select(
      f.variant,
      { ...f.catalog, sets: [...f.catalog.sets].reverse() },
      ['a', 'c', 'b'],
      false,
    ),
  ).toEqual(selected);
  expect(f.variant).toEqual(frozen);
});
it('requires mixed evidence in gold mode and rejects incomplete or changed sources', () => {
  const f = ComparisonFixture.create();
  expect(() => f.selector.select(f.variant, f.catalog, ['a', 'b'], true)).toThrow('mixed source');
  const mixed = structuredClone(f.catalog.sets[0]),
    card = structuredClone(f.catalog.cards[0]);
  if (!mixed || !card) throw new Error('Fixture');
  card.id = 'gold';
  card.sha256 = '9'.repeat(64);
  card.observation.category = '5';
  card.observation.facets.characterCount = 1;
  f.catalog.cards.push(card);
  mixed.id = 'mixed';
  mixed.cards[0] = { slot: 1, id: card.id, sha256: card.sha256 };
  f.catalog.sets.push(mixed);
  expect(f.selector.select(f.variant, f.catalog, ['a', 'b', 'mixed'], true).ids).toContain('mixed');
  expect(f.selector.select(f.variant, f.catalog, ['a', 'b', 'mixed'], false).ids).not.toContain('mixed');
  card.sha256 = '8'.repeat(64);
  expect(() => f.selector.select(f.variant, f.catalog, ['a', 'mixed'], true)).toThrow('hash mismatch');
});
