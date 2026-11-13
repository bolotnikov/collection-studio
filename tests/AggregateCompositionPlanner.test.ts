import { expect, it } from 'vitest';
import { CompositionFixture } from './fixtures/CompositionFixture';
import { AggregateCompositionPlanner } from '../src/domain/AggregateCompositionPlanner';
import {
  CompositionPlanningContracts,
  type SemanticConcept,
} from '../src/shared/CompositionPlanningContracts';
import { CompositionPlanCompiler } from '../src/domain/CompositionPlanCompiler';
import { Contracts } from '../src/shared/Contracts';
import { SetComposition } from '../src/domain/SetComposition';

class AggregateFixture {
  static create() {
    const { catalog } = CompositionFixture.create();
    const first = catalog.cards[0],
      second = catalog.cards[1],
      originalSet = catalog.sets[0];
    if (!first || !second || !originalSet) throw new Error('Fixture');
    const clones = [first, second].map((card, index) => ({
      ...structuredClone(card),
      id: `extra-${index}`,
      sha256: String(index + 20).padStart(64, '0'),
    }));
    catalog.cards.push(...clones);
    const membership = (ids: string[]) =>
      ids.map((id, index) => {
        const card = catalog.cards.find((card) => card.id === id);
        if (!card) throw new Error('Fixture');
        return { slot: index + 1, id, sha256: card.sha256 };
      });
    catalog.sets = [
      {
        ...originalSet,
        id: 'a',
        cards: membership([
          'reference-0',
          'reference-1',
          'extra-0',
          'extra-1',
          'reference-2',
          'reference-3',
          'reference-4',
          'reference-5',
          'reference-8',
          'reference-9',
        ]),
      },
      { ...originalSet, id: 'b', cards: membership(Array.from({ length: 10 }, (_, i) => `reference-${i}`)) },
    ];
    const concept: SemanticConcept = {
      title: 'Independent collection',
      concept: 'A new collection of complementary objects',
      candidates: Array.from({ length: 14 }, (_, index) => ({
        id: `subject-${index}`,
        subject: `New object ${index}`,
        role: `Independent role ${index}`,
        materials: ['wood'],
        silhouette: 'Rounded form',
        compatibleCategories: ['1', '2', '3', '4'],
        characterCount: 0,
      })),
    };
    const weights = CompositionPlanningContracts.defaults.aggregation;
    if (!weights) throw new Error('Aggregate defaults missing');
    return { catalog, concept, planner: new AggregateCompositionPlanner(weights) };
  }
}
it('creates the aggregate 3/2/3/2 allocation from both sources rather than copying either 4/2/2/2 or 2/2/4/2', () => {
  const { catalog, concept, planner } = AggregateFixture.create();
  const [blueprint] = planner.select([concept], catalog, false);
  if (!blueprint) throw new Error('Fixture');
  const counts = ['1', '2', '3', '4'].map(
    (cat) => blueprint.slots.filter((s) => s.target.category === cat).length,
  );
  expect(counts).toEqual([3, 2, 3, 2]);
  expect(blueprint.composition.sourceSetIds).toEqual(['a', 'b']);
  expect(blueprint.composition.selection).toBeUndefined();
  expect(blueprint.composition.aggregate?.sourceSetCount).toBe(2);
  expect(blueprint.composition.aggregate?.patterns.reduce((sum, p) => sum + p.expected, 0)).toBeCloseTo(10);
  expect(new Set(blueprint.slots.map((s) => s.subject.id)).size).toBe(10);
  expect(
    planner.select(
      [concept],
      { ...catalog, sets: [...catalog.sets].reverse(), cards: [...catalog.cards].reverse() },
      false,
    ),
  ).toEqual([blueprint]);
  const profile = Contracts.profile.parse({
    id: 'fixture',
    name: 'Fixture',
    rules: ['Canonical rendering'],
    categories: { '1': 'Float', '2': 'Simple plane', '3': 'Material', '4': 'Environment' },
    references: [],
    visualCatalog: catalog,
    compositionPlanning: CompositionPlanningContracts.defaults,
  });
  const plan = CompositionPlanCompiler.compile(
    [blueprint],
    {
      variants: [
        {
          variantIndex: 0,
          paletteRhythm: 'Varied complementary colors',
          cards: blueprint.slots.map((slot) => ({
            index: slot.index,
            description: 'A clearly recognizable new object',
            paletteRole: 'Varied contrasting color',
            composition: 'Follow required composition facets',
          })),
        },
      ],
    },
    profile,
  );
  expect(() => SetComposition.validate(plan, catalog)).not.toThrow();
  const composition = plan.variants[0]?.artContract?.composition;
  if (!composition?.aggregate) throw new Error('Fixture');
  const pattern = composition.aggregate.patterns.find((p) => p.count > 0);
  if (!pattern) throw new Error('Fixture');
  pattern.count++;
  expect(() => SetComposition.validate(plan, catalog)).toThrow('aggregate');
});
it('uses all sources even if individual sources omit a mandatory category, and fails before generation when evidence is insufficient', () => {
  const { catalog, concept, planner } = AggregateFixture.create();
  expect(() => planner.select([concept], catalog, true)).toThrow('category 5');
  const first = catalog.cards[0];
  if (!first) throw new Error('Fixture');
  const ids = catalog.cards.filter((c) => c.observation.category !== '2').map((c) => c.id);
  const weights = CompositionPlanningContracts.defaults.aggregation;
  if (!weights) throw new Error('Fixture');
  expect(() => new AggregateCompositionPlanner(weights, ids).select([concept], catalog, false)).toThrow(
    'category 2',
  );
  const bad = structuredClone(concept);
  bad.candidates.forEach((c) => {
    c.compatibleCategories = ['1'];
  });
  expect(() => planner.select([bad], catalog, false)).toThrow('No subject assignment');
});

it('records an approximation instead of stopping best-effort production when semantic compatibility is too narrow', () => {
  const { catalog, concept, planner } = AggregateFixture.create();
  concept.candidates.forEach((candidate) => {
    candidate.compatibleCategories = ['1'];
  });
  expect(() => planner.select([concept], catalog, false)).toThrow('No subject assignment');
  const [fallback] = planner.select([concept], catalog, false, true);
  expect(fallback?.slots).toHaveLength(10);
  expect(new Set(fallback?.slots.map((slot) => slot.target.category)).size).toBe(4);
  expect(fallback?.warnings?.join(' ')).toContain('approximated');
  expect(concept.candidates.every((candidate) => candidate.compatibleCategories.length === 1)).toBe(true);
});

it('varies exact-match reference selection and priority by seed while preserving every composition constraint', () => {
  const { catalog, planner } = AggregateFixture.create();
  const original = catalog.cards[0];
  if (!original) throw new Error('Missing reference fixture');
  catalog.cards.push(
    ...Array.from({ length: 12 }, (_, index) => ({
      ...structuredClone(original),
      id: `additional-${index}`,
      sha256: String(index + 100).padStart(64, '0'),
    })),
    {
      ...structuredClone(original),
      id: 'low-confidence',
      observation: { ...original.observation, confidence: 0.1 },
    },
  );
  const baseline = planner.planSlots(catalog, false);
  const first = planner.planSlots(catalog, false, 'run-a/0');
  const second = planner.planSlots(catalog, false, 'run-b/0');
  const otherVariant = planner.planSlots(catalog, false, 'run-a/1');
  const withoutSelections = (plan: typeof first) => {
    const copy = structuredClone(plan);
    for (const target of [...copy.composition.targets, ...copy.slots.map((slot) => slot.target)])
      delete target.selectedReferenceIds;
    return copy;
  };
  expect(withoutSelections(first)).toEqual(withoutSelections(baseline));
  expect(withoutSelections(second)).toEqual(withoutSelections(baseline));
  expect(first).toEqual(planner.planSlots(catalog, false, 'run-a/0'));
  expect(first).toEqual(
    planner.planSlots(
      { ...catalog, cards: [...catalog.cards].reverse(), sets: [...catalog.sets].reverse() },
      false,
      'run-a/0',
    ),
  );
  expect(first).not.toEqual(second);
  expect(first).not.toEqual(otherVariant);
  for (const slot of first.slots) {
    const selected = slot.target.selectedReferenceIds ?? [];
    const candidates = slot.target.referenceIds ?? [];
    expect(selected).toHaveLength(Math.min(8, candidates.length));
    expect(new Set(selected).size).toBe(selected.length);
    expect(selected.every((id) => candidates.includes(id) && id !== 'low-confidence')).toBe(true);
    if (candidates.length <= 8) expect([...selected].sort()).toEqual([...candidates].sort());
    else expect(selected.some((id) => !candidates.slice(0, 8).includes(id))).toBe(true);
    for (const id of selected) {
      const reference = catalog.cards.find((card) => card.id === id);
      expect(reference?.observation.category).toBe(slot.target.category);
      expect(SetComposition.matches(reference?.observation.facets, slot.target.required)).toBe(true);
    }
  }
  const plan = CompositionFixture.create().plan;
  const variant = plan.variants[0];
  if (!variant?.artContract) throw new Error('Missing validation fixture');
  variant.artContract.composition = first.composition;
  variant.cards.forEach((card, index) => {
    const target = first.composition.targets[index];
    if (!target) throw new Error('Missing slot');
    card.category = target.category;
  });
  expect(() => SetComposition.validate(plan, catalog)).not.toThrow();
});
