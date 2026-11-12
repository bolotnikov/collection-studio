import { describe, expect, it } from 'vitest';
import { ReferenceRetriever } from '../src/application/style/ReferenceRetriever';
import { StyleContracts, type LibraryItem, type ReferenceAnalysis } from '../src/shared/StyleContracts';

const items: LibraryItem[] = ['1', '2', '3', '4'].flatMap((category, index) => [
  StyleContracts.libraryItem.parse({
    id: `a${index}`,
    filename: `a${index}.png`,
    title: index === 0 ? 'brass magnifier' : 'other',
    category,
    sha256: `sha${index}`,
    source: 'miro',
    origin: 'anchor',
  }),
  StyleContracts.libraryItem.parse({
    id: `u${index}`,
    filename: `u${index}.png`,
    title: 'brass magnifier',
    category,
    sha256: `user${index}`,
    source: 'generated',
    origin: 'user',
    approved: true,
  }),
]);
describe('ReferenceRetriever', () => {
  const analysis = (overrides: Partial<ReferenceAnalysis> = {}): ReferenceAnalysis => ({
    eligible: true,
    exclusionReason: '',
    subject: 'artifact',
    materials: [],
    silhouette: '',
    rendering: '',
    lighting: '',
    palette: '',
    background: '',
    category: '1',
    usefulPrinciples: [],
    avoidCopying: [],
    ...overrides,
  });
  it('ranks relevant category/material evidence while retaining deterministic ordering', () => {
    const ranked = new ReferenceRetriever().rank('brass magnifier', '1', items, new Map(), 8);
    expect(ranked[0]?.id).toBe('a0');
    expect(ranked.map((r) => r.id)).toEqual(
      new ReferenceRetriever().rank('brass magnifier', '1', items, new Map(), 8).map((r) => r.id),
    );
  });
  it('enforces original coverage, excludes unapproved user art and caps supplemental influence', () => {
    const retriever = new ReferenceRetriever();
    const unapproved = {
      ...items[0],
      id: 'bad',
      filename: 'bad.png',
      title: 'brass magnifier',
      category: '1',
      sha256: 'bad',
      source: 'generated',
      origin: 'user',
      approved: false,
      tags: [],
    };
    const ranked = retriever.rank(
      'brass magnifier',
      '1',
      [...items, StyleContracts.libraryItem.parse(unapproved)],
      new Map(),
      20,
    );
    expect(ranked.some((r) => r.id === 'bad')).toBe(false);
    const selected = retriever.select(ranked, ['u0', 'u1', 'u2', 'u3'], 8);
    expect(selected.filter((r) => r.origin === 'user')).toHaveLength(2);
    expect(new Set(selected.filter((r) => r.origin === 'anchor').map((r) => r.category)).size).toBe(4);
  });
  it('rejects invented reference IDs and deduplicates identical image hashes', () => {
    const retriever = new ReferenceRetriever();
    expect(() => retriever.select(items, ['invented'], 8)).toThrow('unknown ID');
    const selected = retriever.select(
      [...items, { ...items[0], id: 'copy' }].map((r) => StyleContracts.libraryItem.parse(r)),
      [],
      8,
    );
    expect(new Set(selected.map((r) => r.sha256)).size).toBe(selected.length);
  });
  it('prioritizes material evidence over many generic style terms in a production brief', () => {
    const material = StyleContracts.libraryItem.parse({ ...items[0], id: 'material', title: 'artifact' });
    const generic = StyleContracts.libraryItem.parse({ ...items[0], id: 'generic', title: 'artifact' });
    const style =
      'polished colorful playful rounded soft detailed readable clean stylized painterly volumetric smooth';
    const analyses = new Map([
      ['material', analysis({ materials: ['brass'] })],
      ['generic', analysis({ rendering: style })],
    ]);
    const ranked = new ReferenceRetriever().rank(
      `Create a brass magnifier. Keep the same reference style: ${style}.`,
      '1',
      [generic, material],
      analyses,
      2,
    );
    expect(ranked.map((item) => item.id)).toEqual(['material', 'generic']);
  });
  it('excludes forbidden sources and unapproved art even when selection bypasses ranking', () => {
    const forbidden = StyleContracts.libraryItem.parse({
      ...items[0],
      id: 'gold',
      sha256: 'gold',
      tags: ['exclude:ordinary-card-generation'],
    });
    const unapproved = StyleContracts.libraryItem.parse({
      ...items[0],
      id: 'pending',
      sha256: 'pending',
      origin: 'user',
      approved: false,
    });
    const retriever = new ReferenceRetriever();
    const input = [forbidden, unapproved, ...items];
    const ranked = retriever.rank('brass magnifier', '1', input, new Map(), 20);
    expect(ranked.some((item) => item.id === 'gold' || item.id === 'pending')).toBe(false);
    const selected = retriever.select(input, ['gold', 'pending'], 8);
    expect(selected.some((item) => item.id === 'gold' || item.id === 'pending')).toBe(false);
    expect(selected.slice(0, 4).map((item) => item.category)).toEqual(['1', '2', '3', '4']);
  });
  it('excludes analyzed gold cards and rejected source art from ranking', () => {
    const rejected = StyleContracts.libraryItem.parse({ ...items[0], id: 'rejected' });
    const gold = StyleContracts.libraryItem.parse({ ...items[0], id: 'gold' });
    const analyses = new Map([
      ['rejected', analysis({ eligible: false, exclusionReason: 'Contains a person' })],
      ['gold', analysis({ category: '5' })],
    ]);
    const ranked = new ReferenceRetriever().rank(
      'brass magnifier',
      '1',
      [...items, rejected, gold],
      analyses,
      20,
    );
    expect(ranked.some((item) => item.id === 'rejected' || item.id === 'gold')).toBe(false);
  });
  it('deduplicates IDs before ranking and selection, preserving the first canonical record', () => {
    const duplicate = StyleContracts.libraryItem.parse({ ...items[0], sha256: 'different-bytes' });
    const input = [...items, duplicate];
    const retriever = new ReferenceRetriever();
    const ranked = retriever.rank('brass magnifier', '1', input, new Map(), 20);
    const selected = retriever.select(input, ['a0', 'a0'], 12);
    for (const result of [ranked, selected]) {
      expect(result.filter((item) => item.id === 'a0')).toHaveLength(1);
      expect(result.find((item) => item.id === 'a0')?.sha256).toBe('sha0');
    }
  });
});

it('reserves shared originals and matching-category originals even when visual ranking prefers another category', () => {
  const originals = Array.from({ length: 8 }, (_, index) =>
    StyleContracts.libraryItem.parse({
      id: `ref-${index}`,
      filename: `${index}.png`,
      sha256: `sha-${index}`,
      source: 'original',
      title: 'object',
      category: index < 2 ? '1' : '3',
    }),
  );
  const result = new ReferenceRetriever().select(
    originals,
    originals.map((item) => item.id).reverse(),
    4,
    '3',
    ['ref-0', 'ref-1'],
  );
  expect(result.map((item) => item.id)).toEqual(expect.arrayContaining(['ref-0', 'ref-1']));
  expect(result.filter((item) => item.category === '3')).toHaveLength(2);
  expect(() => new ReferenceRetriever().select(originals.slice(0, 3), [], 4, '3')).toThrow(
    'two original category',
  );
});
