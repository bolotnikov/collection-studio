import { expect, it } from 'vitest';
import source from '../resources/knowledge/visual-catalog.json';
import { VisualCatalogContracts } from '../src/shared/VisualCatalogContracts';
import { CompositionPlanningContracts } from '../src/shared/CompositionPlanningContracts';
import { AggregateCompositionPlanner } from '../src/domain/AggregateCompositionPlanner';
import { CollectionCorpusStatistics } from '../src/domain/CollectionCorpusStatistics';
import { SetRhythmPlanner } from '../src/domain/SetRhythmPlanner';

it.each([false, true])(
  'varies valid layouts across seeds and excludes previously used color positions (gold=%s)',
  (gold) => {
    const catalog = VisualCatalogContracts.catalog.parse(source);
    const weights = CompositionPlanningContracts.defaults.aggregation;
    if (!weights) throw new Error('Missing weights');
    const planner = new AggregateCompositionPlanner(weights);
    const used: string[] = [];
    for (let index = 0; index < 8; index++) {
      const plan = planner.planSlots(catalog, gold, `variety/${index}`, used);
      expect(() => SetRhythmPlanner.validate(plan.composition)).not.toThrow();
      const key = SetRhythmPlanner.layoutKey(plan.composition);
      expect(used).not.toContain(key);
      used.push(key);
    }
    const first = planner.planSlots(catalog, gold, 'same-seed');
    const second = planner.planSlots(catalog, gold, 'same-seed', [
      SetRhythmPlanner.layoutKey(first.composition),
    ]);
    expect(SetRhythmPlanner.layoutKey(second.composition)).not.toBe(
      SetRhythmPlanner.layoutKey(first.composition),
    );
    expect(second.composition.aggregate?.patterns).toEqual(first.composition.aggregate?.patterns);
  },
);

it('counts each real source window and separates ordinary, mixed and gold-only populations', () => {
  const stats = new CollectionCorpusStatistics(VisualCatalogContracts.catalog.parse(source)).analyze();
  expect(stats.sourceSetCount).toBe(16);
  expect(stats.cardMembershipCount).toBe(160);
  expect(stats.cohorts.map((cohort) => [cohort.cohort, cohort.setCount])).toEqual([
    ['all', 16],
    ['ordinary-only', 6],
    ['mixed', 9],
    ['gold-only', 1],
  ]);
  const all = stats.cohorts[0];
  expect(all?.categories.map((category) => category.mean)).toEqual([2.0625, 1.125, 1.6875, 3.25, 1.875]);
  expect(all?.decorativeDuplicateSets).toBe(1);
  expect(all?.adjacentSameColor.horizontal).toBeGreaterThan(0);
  expect(
    stats.distributions.find((distribution) => distribution.axis === 'subjectScale')?.values,
  ).toMatchObject([{ value: 'large', count: 160 }]);
});

it.each([false, true])(
  'locks source-supported color and scale with unique color/pattern pairs and no horizontal or vertical color neighbors (gold=%s)',
  (includeGold) => {
    const catalog = VisualCatalogContracts.catalog.parse(source);
    const weights = CompositionPlanningContracts.defaults.aggregation;
    if (!weights) throw new Error('Missing weights');
    const planner = new AggregateCompositionPlanner(weights);
    const baseline = planner.planSlots(catalog, includeGold);
    const plan = planner.planSlots(catalog, includeGold, 'rhythm-reference-shuffle');
    const constraints = (targets: typeof plan.composition.targets) =>
      targets.map((target) => ({ ...target, selectedReferenceIds: undefined }));
    expect(constraints(plan.composition.targets)).not.toEqual(constraints(baseline.composition.targets));
    expect(planner.planSlots(catalog, includeGold, 'rhythm-reference-shuffle')).toEqual(plan);
    expect(plan.composition.rhythm).toBeDefined();
    expect(() => SetRhythmPlanner.validate(plan.composition)).not.toThrow();
    expect(plan.slots.map((slot) => slot.index)).toEqual(Array.from({ length: 10 }, (_, i) => i));
    expect(plan.slots.every((slot) => slot.target.appearance?.subjectScale === 'large')).toBe(true);
    const family = (color: string | undefined) => (color === 'cyan' ? 'blue' : color);
    const pairs = plan.slots.map(
      (slot) => `${family(slot.target.appearance?.backgroundColor)}/${slot.target.required.pattern}`,
    );
    expect(new Set(pairs).size).toBe(10);
    for (const [index, slot] of plan.slots.entries()) {
      const color = family(slot.target.appearance?.backgroundColor);
      if (index % 5)
        expect(color).not.toBe(family(plan.slots[index - 1]?.target.appearance?.backgroundColor));
      if (index >= 5)
        expect(color).not.toBe(family(plan.slots[index - 5]?.target.appearance?.backgroundColor));
      expect(
        catalog.cards.some(
          (card) =>
            card.observation.category === slot.target.category &&
            card.observation.facets.pattern === slot.target.required.pattern &&
            card.observation.facets.backgroundColor === slot.target.appearance?.backgroundColor,
        ),
      ).toBe(true);
    }
    expect(
      planner.planSlots(
        { ...catalog, cards: [...catalog.cards].reverse(), sets: [...catalog.sets].reverse() },
        includeGold,
        'rhythm-reference-shuffle',
      ),
    ).toEqual(plan);
    const changed = structuredClone(plan.composition);
    const first = changed.targets[0],
      below = changed.targets[5];
    if (!first?.appearance || !below?.appearance) throw new Error('Missing appearance');
    below.appearance.backgroundColor = first.appearance.backgroundColor;
    expect(() => SetRhythmPlanner.validate(changed)).toThrow(/Adjacent|Repeated/);
  },
);
