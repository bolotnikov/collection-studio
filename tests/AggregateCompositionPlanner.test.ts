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
