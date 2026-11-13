import { z } from 'zod';
import defaults from '../../resources/set-rhythm.json';
import type { SlotPlan } from '../shared/CompositionPlanningContracts';
import type { VisualCatalog, VisualFacets } from '../shared/VisualCatalogContracts';
import type { CompositionTarget } from '../shared/CompositionContract';
import { CollectionCorpusStatistics } from './CollectionCorpusStatistics';
import { SourcePositionPlanner } from './SourcePositionPlanner';

type Color = NonNullable<VisualFacets['backgroundColor']>;
type Choice = { slot: SlotPlan['slots'][number]; color: Color };
type State = { choices: Choice[]; remaining: SlotPlan['slots']; score: number };

/** Assigns source-supported output colors and real grid neighbors before model design. */
export class SetRhythmPlanner {
  private readonly config = z
    .object({
      version: z.literal('set-rhythm-v1'),
      columns: z.literal(5),
      beamWidth: z.number().int().positive().max(1024),
      colorFamilies: z.record(z.string(), z.string()),
      forbidRepeatedColorPattern: z.literal(true),
      forbidAdjacentColorFamily: z.literal(true),
      prompt: z.string(),
    })
    .parse(defaults);
  apply(plan: SlotPlan, catalog: VisualCatalog): SlotPlan {
    const analysis = new CollectionCorpusStatistics(catalog).analyze();
    const ordinary = analysis.cohorts.find((cohort) => cohort.cohort === 'ordinary-only');
    const evidence = ordinary?.setCount ? ordinary : analysis.cohorts[0];
    if (!evidence) throw new Error('Set rhythm needs source evidence.');
    const minimumDistinctColors = Math.max(1, Math.floor(evidence.distinctColors.minimum));
    const maximumColorFrequency = Math.max(1, evidence.maximumColorFrequency.maximum);
    const options = new Map(plan.slots.map((slot) => [slot.index, this.colors(slot.target, catalog)]));
    const goldStart = 10 - plan.slots.filter((slot) => slot.target.category === '5').length;
    let states: State[] = [{ choices: [], remaining: plan.slots, score: 0 }];
    for (let index = 0; index < 10; index++) {
      const next: State[] = [];
      for (const state of states)
        for (const slot of state.remaining)
          for (const { color, frequency } of options.get(slot.index) ?? []) {
            if (
              plan.composition.positionPolicy?.goldSuffix &&
              (slot.target.category === '5') !== index >= goldStart
            )
              continue;
            const family = this.family(color);
            const prior = state.choices;
            const left = index % 5 ? prior[index - 1] : undefined;
            const above = prior[index - 5];
            if ([left, above].some((neighbor) => neighbor && this.family(neighbor.color) === family))
              continue;
            if (
              prior.some(
                (choice) =>
                  this.family(choice.color) === family &&
                  choice.slot.target.required.pattern === slot.target.required.pattern,
              )
            )
              continue;
            const count = prior.filter((choice) => choice.color === color).length;
            if (count >= maximumColorFrequency) continue;
            const distinct = new Set([...prior.map((choice) => choice.color), color]).size;
            if (distinct + 9 - index < minimumDistinctColors) continue;
            const adjacentCategory = [left, above].filter(
              (neighbor) => neighbor?.slot.target.category === slot.target.category,
            ).length;
            const adjacentBackdrop = [left, above].filter(
              (neighbor) => neighbor?.slot.target.required.backdrop === slot.target.required.backdrop,
            ).length;
            next.push({
              choices: [...prior, { slot, color }],
              remaining: state.remaining.filter((item) => item.index !== slot.index),
              score:
                state.score +
                adjacentCategory * 3 +
                adjacentBackdrop +
                count * 2 +
                1 / frequency -
                (distinct > new Set(prior.map((choice) => choice.color)).size ? 2 : 0),
            });
          }
      next.sort((a, b) => a.score - b.score || this.key(a).localeCompare(this.key(b)));
      states = next.slice(0, this.config.beamWidth);
      if (!states.length)
        throw new Error(
          'No source-supported color/pattern layout satisfies the grid rules. No images requested.',
        );
    }
    const selected = states[0];
    if (!selected) throw new Error('Missing set rhythm assignment.');
    const slots = selected.choices.map(({ slot, color }, index) => ({
      ...slot,
      index,
      target: {
        ...slot.target,
        index,
        appearance: { backgroundColor: color, subjectScale: 'large' as const },
        preferred: { ...slot.target.preferred, backgroundColor: color, subjectScale: 'large' as const },
      },
    }));
    const composition = {
      ...plan.composition,
      targets: slots.map((slot) => slot.target),
      rhythm: {
        version: this.config.version,
        columns: this.config.columns,
        colorFamilies: Object.entries(this.config.colorFamilies).map(([color, family]) => ({
          color,
          family,
        })),
        minimumDistinctColors,
        maximumColorFrequency,
        sourceSetCount: analysis.sourceSetCount,
        sourceDecorativeDuplicateSets: analysis.sets.filter((set) => set.decorativeDuplicatePairs.length)
          .length,
      },
    };
    SetRhythmPlanner.validate(composition);
    return { slots, composition };
  }
  private family(color: string): string {
    return this.config.colorFamilies[color] ?? color;
  }
  private colors(target: CompositionTarget, catalog: VisualCatalog) {
    const counts = new Map<Color, number>();
    for (const card of catalog.cards) {
      const f = card.observation.facets;
      if (
        card.observation.category !== target.category ||
        f.backdrop !== target.required.backdrop ||
        f.pattern !== target.required.pattern ||
        !f.backgroundColor ||
        f.backgroundColor === 'multicolor'
      )
        continue;
      counts.set(f.backgroundColor, (counts.get(f.backgroundColor) ?? 0) + 1);
    }
    const result = [...counts]
      .map(([color, frequency]) => ({ color, frequency }))
      .sort((a, b) => b.frequency - a.frequency || a.color.localeCompare(b.color));
    if (!result.length) throw new Error('Slot lacks classified color evidence.');
    return result;
  }
  private key(state: State): string {
    return state.choices.map((choice) => `${choice.slot.index}/${choice.color}`).join(',');
  }
  static validate(composition: SlotPlan['composition']): void {
    SourcePositionPlanner.validate(composition);
    const policy = composition.rhythm;
    if (!policy) return;
    const targets = [...composition.targets].sort((a, b) => a.index - b.index);
    const pairs = new Set<string>();
    const counts = new Map<string, number>();
    const family = (color: string) =>
      policy.colorFamilies.find((entry) => entry.color === color)?.family ?? color;
    for (const [index, target] of targets.entries()) {
      const color = target.appearance?.backgroundColor;
      if (!color || target.index !== index || target.appearance?.subjectScale !== 'large')
        throw new Error('Every rhythm slot needs a locked color and large subject.');
      const pair = `${family(color)}/${target.required.pattern ?? 'none'}`;
      if (pairs.has(pair)) throw new Error('Repeated color-family/pattern pair in set.');
      pairs.add(pair);
      counts.set(color, (counts.get(color) ?? 0) + 1);
      const left = index % policy.columns ? targets[index - 1] : undefined;
      const above = targets[index - policy.columns];
      if (
        [left, above].some(
          (neighbor) => neighbor?.appearance && family(neighbor.appearance.backgroundColor) === family(color),
        )
      )
        throw new Error('Adjacent cards share a background color family.');
    }
    if (
      counts.size < policy.minimumDistinctColors ||
      Math.max(...counts.values()) > policy.maximumColorFrequency
    )
      throw new Error('Set color diversity is outside the locked source limits.');
  }
}
