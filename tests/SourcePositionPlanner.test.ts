import { expect, it } from 'vitest';
import source from '../resources/knowledge/visual-catalog.json';
import { VisualCatalogContracts } from '../src/shared/VisualCatalogContracts';
import { CompositionPlanningContracts } from '../src/shared/CompositionPlanningContracts';
import { CollectionCorpusStatistics } from '../src/domain/CollectionCorpusStatistics';
import { SourcePositionPlanner } from '../src/domain/SourcePositionPlanner';
import { AggregateCompositionPlanner } from '../src/domain/AggregateCompositionPlanner';
import { SetRhythmPlanner } from '../src/domain/SetRhythmPlanner';
import { CompositionPlanningPrompts } from '../src/application/prompts/CompositionPlanningPrompts';
import { Contracts } from '../src/shared/Contracts';

it('counts source positions without conflating ordinary sets and gold suffixes', () => {
  const catalog = VisualCatalogContracts.catalog.parse(source);
  const result = new CollectionCorpusStatistics(catalog).positionStatistics();
  expect(result.sourceSetCount).toBe(16);
  expect(result.cohorts.map((cohort) => [cohort.cohort, cohort.setCount])).toEqual([
    ['all', 16],
    ['ordinary-only', 6],
    ['mixed', 9],
    ['gold-only', 1],
    ['ordinary-members', 15],
  ]);
  expect(result.goldSuffix.mixedSetCount).toBe(9);
  expect(result.goldSuffix.supportingSetCount).toBe(9);
  expect(result.goldSuffix.countsByPosition).toEqual([0, 0, 0, 0, 0, 0, 1, 3, 7, 9]);
  const ordinary = result.cohorts.find((cohort) => cohort.cohort === 'ordinary-only');
  expect(ordinary?.slots[0]?.distributions.find((entry) => entry.axis === 'category')?.counts).toEqual({
    '1': 3,
    '2': 1,
    '4': 2,
  });
  expect(
    result.cohorts
      .find((cohort) => cohort.cohort === 'ordinary-members')
      ?.slots.map((slot) => slot.observations),
  ).toEqual([15, 15, 15, 15, 15, 15, 14, 12, 8, 6]);
  expect(
    new CollectionCorpusStatistics({
      ...catalog,
      sets: [...catalog.sets].reverse().map((set) => ({ ...set, cards: [...set.cards].reverse() })),
    }).positionStatistics().goldSuffix.countsByPosition,
  ).toEqual(result.goldSuffix.countsByPosition);
});

it('keeps the observed gold suffix through grid planning and binds its evidence to the design request', () => {
  const catalog = VisualCatalogContracts.catalog.parse(source);
  const weights = CompositionPlanningContracts.defaults.aggregation;
  if (!weights) throw new Error('Missing weights');
  const plan = new AggregateCompositionPlanner(weights).planSlots(catalog, true, 'position-fixture');
  expect(plan.composition.positionPolicy).toMatchObject({
    goldSuffix: true,
    mixedSetCount: 9,
    supportingSetCount: 9,
  });
  const gold = plan.slots.filter((slot) => slot.target.category === '5');
  expect(gold.length).toBeGreaterThan(0);
  expect(gold.map((slot) => slot.index)).toEqual(
    Array.from({ length: gold.length }, (_, index) => 10 - gold.length + index),
  );
  expect(() => SetRhythmPlanner.validate(plan.composition)).not.toThrow();
  const prompt = CompositionPlanningPrompts.design(
    Contracts.brief.parse({
      theme: 'Fixture',
      wishes: '',
      variants: 1,
      includeGold: true,
      quality: 'low',
      maxImageCalls: 10,
      autoRepair: false,
    }),
    Contracts.profile.parse({
      id: 'fixture',
      name: 'Fixture',
      rules: ['Canonical rendering'],
      references: [],
      categories: { '1': 'Float', '2': 'Plane', '3': 'Surface', '4': 'Environment', '5': 'Characters' },
    }),
    [plan],
    '',
    [],
  );
  expect(prompt).toContain(JSON.stringify(plan.composition.positionPolicy));
  const changed = structuredClone(plan.composition);
  const first = changed.targets[0],
    last = changed.targets[9];
  if (!first || !last) throw new Error('Missing slots');
  [first.category, last.category] = [last.category, first.category];
  expect(() => SetRhythmPlanner.validate(changed)).toThrow('final consecutive');
  delete changed.positionPolicy;
  expect(() => SourcePositionPlanner.validate(changed)).not.toThrow();
});

it('does not infer a positional rule from too few examples or contradictory source membership', () => {
  const catalog = VisualCatalogContracts.catalog.parse(source);
  const weights = CompositionPlanningContracts.defaults.aggregation;
  if (!weights) throw new Error('Missing weights');
  const base = new AggregateCompositionPlanner(weights).planSlots(catalog, false);
  delete base.composition.positionPolicy;
  const mixedIds = new CollectionCorpusStatistics(catalog).positionStatistics().goldSuffix.sourceSetIds;
  const sparse = { ...catalog, sets: catalog.sets.filter((set) => mixedIds.slice(0, 2).includes(set.id)) };
  expect(new SourcePositionPlanner().apply(base, sparse)).toEqual(base);
  const changed = structuredClone(catalog);
  const mixed = changed.sets.find((set) => mixedIds.includes(set.id));
  const first = mixed?.cards.find((member) => member.slot === 1);
  const last = mixed?.cards.find((member) => member.slot === 10);
  if (!first || !last) throw new Error('Missing mixed source');
  [first.slot, last.slot] = [last.slot, first.slot];
  const statistics = new CollectionCorpusStatistics(changed).positionStatistics();
  expect(statistics.goldSuffix.supportingSetCount).toBe(8);
  expect(new SourcePositionPlanner().apply(base, changed)).toEqual(base);
});
