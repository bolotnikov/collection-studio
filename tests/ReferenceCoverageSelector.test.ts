import { expect, it } from 'vitest';
import { ReferenceCoverageSelector } from '../src/domain/ReferenceCoverageSelector';
import { StyleContracts, type StyleEvidence } from '../src/shared/StyleContracts';

type Assessment = StyleEvidence['analysis']['selections'][number];
class CoverageFixture {
  static create() {
    const items = Array.from({ length: 10 }, (_, i) =>
      StyleContracts.libraryItem.parse({
        id: `ref-${i}`,
        filename: `${i}.png`,
        sha256: `hash-${i}`,
        source: 'fixture',
        title: 'Source',
        category: i < 2 ? '1' : '3',
      }),
    );
    const assessments: Assessment[] = items.map((item) => ({
      id: item.id,
      reason: 'Useful evidence',
      role: 'original',
      take: 'Declared properties',
      ignore: 'Source subject',
      compositionMatches: item.category === '3',
      coverage: { useful: true, conflict: false, rendering: true, lighting: true, materials: [] },
    }));
    return {
      items,
      assessments,
      selector: new ReferenceCoverageSelector(),
      shared: ['ref-0', 'ref-1'],
      matching: ['ref-2', 'ref-3'],
    };
  }
}
it('stops at sufficient role coverage instead of filling eight slots', () => {
  const f = CoverageFixture.create();
  expect(
    f.selector.select(f.items, f.assessments, 8, '3', f.shared, f.matching, []).map((i) => i.id),
  ).toEqual(['ref-0', 'ref-1', 'ref-2', 'ref-3']);
});
it('allows shared anchors to also cover exact composition without requiring four distinct images', () => {
  const f = CoverageFixture.create();
  f.assessments.slice(0, 2).forEach((a) => {
    a.compositionMatches = true;
  });
  expect(f.selector.select(f.items, f.assessments, 8, '1', f.shared, f.shared, [])).toHaveLength(2);
});
it('adds only useful nonconflicting evidence that covers a missing material', () => {
  const f = CoverageFixture.create();
  const bad = f.assessments[4],
    good = f.assessments[5];
  if (!bad?.coverage || !good?.coverage) throw new Error('Fixture');
  bad.coverage = { ...bad.coverage, conflict: true, materials: ['glass'] };
  good.coverage.materials = ['glass'];
  const result = f.selector.select(f.items, f.assessments, 8, '3', f.shared, f.matching, ['Glass']);
  expect(result.map((i) => i.id)).toEqual(['ref-0', 'ref-1', 'ref-2', 'ref-3', 'ref-5']);
  expect(() => f.selector.select(f.items, f.assessments, 4, '3', f.shared, f.matching, ['glass'])).toThrow(
    'budget',
  );
});
it('never substitutes unrelated candidates for missing composition or material evidence', () => {
  const f = CoverageFixture.create();
  expect(() => f.selector.select(f.items, f.assessments, 8, '3', f.shared, [], [])).toThrow('composition');
  expect(() => f.selector.select(f.items, f.assessments, 8, '3', f.shared, f.matching, ['velvet'])).toThrow(
    'velvet',
  );
  const entry = f.assessments[0];
  if (!entry?.coverage) throw new Error('Fixture');
  entry.coverage.conflict = true;
  expect(() => f.selector.select(f.items, f.assessments, 8, '3', f.shared, f.matching, [])).toThrow(
    'Shared style',
  );
});
