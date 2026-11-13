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
  expect(f.selector.select(f.items, f.assessments, 8, '3', f.matching, []).map((i) => i.id)).toEqual([
    'ref-2',
    'ref-3',
  ]);
});
it('uses matching composition evidence without requiring unrelated fixed rendering examples', () => {
  const f = CoverageFixture.create();
  expect(f.selector.select(f.items, f.assessments, 8, '3', f.matching, []).map((item) => item.id)).toEqual([
    'ref-2',
    'ref-3',
  ]);
});
it.each([3, 8])(
  'retains all %i exact pattern matches under the eight-image cap without unrelated padding',
  (count) => {
    const f = CoverageFixture.create();
    const matching = f.items.slice(2, 2 + count).map((item) => item.id);
    const chosen = f.selector.select(f.items, f.assessments, 8, '3', matching, [], undefined, true);
    expect(chosen.map((item) => item.id)).toEqual(matching);
  },
);
it('allows shared anchors to also cover exact composition without requiring four distinct images', () => {
  const f = CoverageFixture.create();
  f.assessments.slice(0, 2).forEach((a) => {
    a.compositionMatches = true;
  });
  expect(f.selector.select(f.items, f.assessments, 8, '1', f.shared, [])).toHaveLength(2);
});
it('adds only useful nonconflicting evidence that covers a missing material', () => {
  const f = CoverageFixture.create();
  const bad = f.assessments[4],
    good = f.assessments[5];
  if (!bad?.coverage || !good?.coverage) throw new Error('Fixture');
  bad.coverage = { ...bad.coverage, conflict: true, materials: ['glass'] };
  good.coverage.materials = ['glass'];
  const result = f.selector.select(f.items, f.assessments, 8, '3', f.matching, ['Glass']);
  expect(result.map((i) => i.id)).toEqual(['ref-2', 'ref-3', 'ref-5']);
  expect(() => f.selector.select(f.items, f.assessments, 2, '3', f.matching, ['glass'])).toThrow('budget');
});
it('never substitutes unrelated candidates for missing composition or material evidence', () => {
  const f = CoverageFixture.create();
  expect(() => f.selector.select(f.items, f.assessments, 8, '3', [], [])).toThrow('composition');
  expect(() => f.selector.select(f.items, f.assessments, 8, '3', f.matching, ['velvet'])).toThrow('velvet');
  const entry = f.assessments[2];
  if (!entry?.coverage) throw new Error('Fixture');
  entry.coverage.conflict = true;
  expect(() => f.selector.select(f.items, f.assessments, 8, '3', f.matching, [])).toThrow('composition');
});

it('continues with explicit warnings for unconfirmed composition and missing materials without fabricating matches', () => {
  const f = CoverageFixture.create();
  f.assessments.forEach((assessment) => {
    assessment.compositionMatches = false;
  });
  const warnings: string[] = [];
  const chosen = f.selector.select(
    f.items,
    f.assessments,
    8,
    '3',
    f.matching,
    ['emerald', 'velvet'],
    (message) => warnings.push(message),
  );
  expect(chosen.map((item) => item.id)).toEqual(['ref-2', 'ref-3']);
  expect(warnings.join(' ')).toContain('unconfirmed');
  expect(warnings.join(' ')).toContain('emerald');
  expect(f.assessments.every((assessment) => assessment.compositionMatches === false)).toBe(true);
});
