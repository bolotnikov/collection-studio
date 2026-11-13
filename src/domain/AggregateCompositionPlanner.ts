import { SetRhythmPlanner } from './SetRhythmPlanner';
import { SourcePositionPlanner } from './SourcePositionPlanner';
import { CatalogPolicy } from '../shared/CatalogPolicy';
import type { CompositionRequirements, CompositionTarget } from '../shared/CompositionContract';
import type {
  CompositionBlueprint,
  CompositionPlanningConfiguration,
  SemanticConcept,
  SlotPlan,
} from '../shared/CompositionPlanningContracts';
import type { CatalogCard, VisualCatalog } from '../shared/VisualCatalogContracts';
import { SubjectAssignment } from './SubjectAssignment';

type Pattern = {
  key: string;
  category: CompositionTarget['category'];
  required: CompositionRequirements;
  expected: number;
  references: CatalogCard[];
};
type Weights = NonNullable<CompositionPlanningConfiguration['aggregation']>;

/** Fit new joint slot patterns to the entire corpus, without selecting a source layout. */
export class AggregateCompositionPlanner {
  constructor(
    private readonly weights: Weights,
    private readonly originalIds?: readonly string[],
  ) {}
  private core(card: CatalogCard): CompositionRequirements {
    const { support, backdrop, pattern, depth, contextDensity, characterCount } = card.observation.facets;
    return { support, backdrop, pattern, depth, contextDensity, characterCount };
  }
  private key(category: string, required: CompositionRequirements) {
    return JSON.stringify([category, required]);
  }
  private valid(card: CatalogCard) {
    const { category, facets: f } = card.observation;
    return (
      (category !== '1' || f.support === 'none') &&
      (category !== '2' || f.support === 'simple-plane') &&
      (category !== '3' || f.support === 'material-surface') &&
      (!['4', '5'].includes(category) || f.backdrop === 'environment') &&
      (category === '5' ? [1, 2].includes(f.characterCount) : f.characterCount === 0) &&
      (f.backdrop === 'pattern' ? f.pattern !== 'none' : f.pattern === 'none')
    );
  }
  profile(catalog: VisualCatalog, includeGold: boolean) {
    const patterns = new Map<string, Pattern>();
    // Every complete source contributes equally; ordinary mode conditions each source on non-gold cards.
    const sets = catalog.sets
      .map((set) => {
        if (
          set.cards.length !== 10 ||
          new Set(set.cards.map((member) => member.slot)).size !== 10 ||
          new Set(set.cards.map((member) => member.id)).size !== 10
        )
          throw new Error('Aggregate statistics require ten unique classified members per source set.');
        return {
          set,
          cards: set.cards
            .map((member) => {
              const card = catalog.cards.find(
                (card) => card.id === member.id && card.sha256 === member.sha256,
              );
              if (!card) throw new Error('Aggregate source member is missing or has changed.');
              return card;
            })
            .filter((card) => includeGold || card.observation.category !== '5'),
        };
      })
      .sort((a, b) => a.set.id.localeCompare(b.set.id));
    const contributing = sets.filter((set) => set.cards.length);
    if (!contributing.length) throw new Error('No classified source sets for the requested gold mode.');
    for (const { cards } of contributing)
      for (const card of cards) {
        const required = this.core(card),
          key = this.key(card.observation.category, required);
        const entry = patterns.get(key) ?? {
          key,
          category: card.observation.category,
          required,
          expected: 0,
          references: [],
        };
        entry.expected += 10 / cards.length / contributing.length;
        patterns.set(key, entry);
      }
    // Keep unsupported observations in the statistics; coverage gates only the patterns we can generate.
    for (const card of [...catalog.cards].sort((a, b) => a.id.localeCompare(b.id))) {
      if (
        (!includeGold && card.observation.category === '5') ||
        !this.valid(card) ||
        card.observation.confidence < CatalogPolicy.values.minimumReferenceConfidence ||
        (this.originalIds && !this.originalIds.includes(card.id))
      )
        continue;
      const key = this.key(card.observation.category, this.core(card));
      const pattern = patterns.get(key);
      if (pattern && !pattern.references.some((ref) => ref.sha256 === card.sha256))
        pattern.references.push(card);
    }
    const result = {
      sourceSetIds: sets.map(({ set }) => set.id),
      contributingSetCount: contributing.length,
      patterns: [...patterns.values()].sort((a, b) => a.key.localeCompare(b.key)),
    };
    for (const category of includeGold ? ['1', '2', '3', '4', '5'] : ['1', '2', '3', '4']) {
      if (
        !result.patterns.some(
          (p) =>
            p.category === category &&
            p.references.length >= CatalogPolicy.values.minimumCompositionReferences,
        )
      )
        throw new Error(`Insufficient original joint-pattern references for category ${category}.`);
    }
    return result;
  }
  summary(catalog: VisualCatalog, includeGold: boolean) {
    const profile = this.profile(catalog, includeGold);
    return {
      sourceSetCount: profile.sourceSetIds.length,
      contributingSetCount: profile.contributingSetCount,
      patterns: profile.patterns.map(({ category, required, expected, references }) => ({
        category,
        required,
        expected,
        referenceCount: references.length,
      })),
    };
  }
  private loss(patterns: Pattern[], counts: number[], expected: number[]): number {
    let loss =
      patterns.reduce((sum, _, index) => sum + ((counts[index] ?? 0) - (expected[index] ?? 0)) ** 2, 0) *
      this.weights.jointPatternWeight;
    for (const axis of [
      'backdrop',
      'support',
      'pattern',
      'depth',
      'contextDensity',
      'characterCount',
    ] as const) {
      for (const value of new Set(patterns.map((p) => p.required[axis]))) {
        const delta = patterns.reduce(
          (sum, p, i) => sum + (p.required[axis] === value ? (counts[i] ?? 0) - (expected[i] ?? 0) : 0),
          0,
        );
        loss += delta ** 2 * this.weights.visualBalanceWeight;
      }
    }
    return loss;
  }
  private distribute(patterns: Pattern[], quota: number, concept?: SemanticConcept): Pattern[] | null {
    if (!quota) return [];
    const total = patterns.reduce((sum, p) => sum + p.expected, 0);
    const expected = patterns.map((p) => (quota * p.expected) / total);
    const counts = patterns.map(() => 0);
    for (let slot = 0; slot < quota; slot++) {
      let best = -1,
        score = Infinity;
      patterns.forEach((pattern, index) => {
        if (
          pattern.references.length < CatalogPolicy.values.minimumCompositionReferences ||
          (concept &&
            !concept.candidates.some((candidate) =>
              SubjectAssignment.compatible(candidate, {
                index: 0,
                category: pattern.category,
                required: pattern.required,
                preferred: {},
              }),
            ))
        )
          return;
        counts[index] = (counts[index] ?? 0) + 1;
        const value = this.loss(patterns, counts, expected);
        counts[index] = (counts[index] ?? 0) - 1;
        if (value < score) {
          score = value;
          best = index;
        }
      });
      if (best < 0) return null;
      counts[best] = (counts[best] ?? 0) + 1;
    }
    return patterns.flatMap((pattern, index) => Array.from({ length: counts[index] ?? 0 }, () => pattern));
  }
  private allocations(
    profile: ReturnType<AggregateCompositionPlanner['profile']>,
    concept: SemanticConcept | undefined,
    includeGold: boolean,
  ) {
    const allocation: { patterns: Pattern[]; score: number; key: string }[] = [];
    const distributions = new Map<string, Pattern[] | null>();
    const distribution = (category: string, actor: number, quota: number) => {
      const key = `${category}/${actor}/${quota}`;
      if (!distributions.has(key))
        distributions.set(
          key,
          this.distribute(
            profile.patterns.filter((p) => p.category === category && p.required.characterCount === actor),
            quota,
            concept,
          ),
        );
      return distributions.get(key);
    };
    for (let a = 1; a <= 7; a++)
      for (let b = 1; b <= 7; b++)
        for (let c = 1; c <= 7; c++)
          for (let d = 1; d <= 7; d++) {
            const gold = 10 - a - b - c - d;
            if (includeGold ? gold < 1 || gold > 6 : gold !== 0) continue;
            for (let one = 0; one <= gold; one++) {
              const groups = [
                distribution('1', 0, a),
                distribution('2', 0, b),
                distribution('3', 0, c),
                distribution('4', 0, d),
                distribution('5', 1, one),
                distribution('5', 2, gold - one),
              ];
              if (groups.some((group) => !group)) continue;
              const patterns = groups.flatMap((group) => group ?? []);
              const quotas = [a, b, c, d, gold];
              const counts = profile.patterns.map(
                (pattern) => patterns.filter((p) => p.key === pattern.key).length,
              );
              let score = this.loss(
                profile.patterns,
                counts,
                profile.patterns.map((p) => p.expected),
              );
              for (let index = 0; index < 5; index++) {
                const mean = profile.patterns
                  .filter((p) => p.category === String(index + 1))
                  .reduce((sum, p) => sum + p.expected, 0);
                score += ((quotas[index] ?? 0) - mean) ** 2 * this.weights.categoryWeight;
              }
              allocation.push({ patterns, score, key: quotas.join(',') + ':' + one });
            }
          }
    allocation.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
    return allocation;
  }
  private referenceIds(pattern: Pattern, occurrence: number, seed?: string): string[] {
    const ids = pattern.references.map((reference) => reference.id);
    if (seed === undefined)
      return Array.from(
        { length: Math.min(8, ids.length) },
        (_, offset) => ids[(occurrence + offset) % ids.length],
      ).filter((id): id is string => id !== undefined);
    let state = 2166136261;
    for (const character of `${seed}/${pattern.key}/${occurrence}`)
      state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
    // Seeded Fisher-Yates changes input priority without changing the slot contract.
    for (let index = ids.length - 1; index > 0; index--) {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      const other = Math.floor((((value ^ (value >>> 14)) >>> 0) / 4294967296) * (index + 1));
      const currentId = ids[index],
        otherId = ids[other];
      if (currentId === undefined || otherId === undefined) throw new Error('Invalid reference permutation.');
      ids[index] = otherId;
      ids[other] = currentId;
    }
    return ids.slice(0, 8);
  }
  planSlots(catalog: VisualCatalog, includeGold: boolean, referenceSeed?: string): SlotPlan {
    const profile = this.profile(catalog, includeGold);
    const choice = this.allocations(profile, undefined, includeGold)[0];
    if (!choice) throw new Error('No source-supported ten-slot allocation is available.');
    const ordered = this.order(choice.patterns);
    const slots = ordered.map((pattern, index) => {
      const occurrence = ordered.slice(0, index).filter((item) => item.key === pattern.key).length;
      const reference = pattern.references[occurrence % pattern.references.length];
      if (!reference) throw new Error('Slot reference evidence is missing.');
      const { camera, subjectScale, subjectPosition, backgroundColor } = reference.observation.facets;
      return {
        index,
        sourceCardId: reference.id,
        sourceRequired: pattern.required,
        adaptedFacets: [],
        target: {
          index,
          referenceIds: pattern.references.map((reference) => reference.id),
          selectedReferenceIds: this.referenceIds(pattern, occurrence, referenceSeed),
          category: pattern.category,
          required: pattern.required,
          preferred: { camera, subjectScale, subjectPosition, backgroundColor },
        },
      };
    });
    const plan = new SourcePositionPlanner().apply(
      {
        slots,
        composition: this.contract(
          catalog.dependencyHash,
          profile,
          choice.patterns,
          slots.map((slot) => slot.target),
        ),
      },
      catalog,
    );
    return catalog.cards.every((card) => card.observation.facets.backgroundColor)
      ? new SetRhythmPlanner().apply(plan, catalog)
      : plan;
  }
  private contract(
    catalogHash: string,
    profile: ReturnType<AggregateCompositionPlanner['profile']>,
    patterns: Pattern[],
    targets: CompositionTarget[],
  ): SlotPlan['composition'] {
    return {
      version: 'set-composition-v1',
      catalogDependencyHash: catalogHash,
      sourceSetIds: profile.sourceSetIds,
      rationale:
        'New ten-slot composition fitted to equally weighted source-set statistics. Each slot preserves an observed joint category/support/background/pattern/depth/context/actor pattern with original-reference coverage. No source layout is selected or copied.',
      aggregate: {
        version: 'aggregate-pattern-v1',
        sourceSetCount: profile.sourceSetIds.length,
        contributingSetCount: profile.contributingSetCount,
        patterns: profile.patterns.map((pattern) => ({
          category: pattern.category,
          required: pattern.required,
          expected: pattern.expected,
          count: patterns.filter((selected) => selected.key === pattern.key).length,
          referenceCount: pattern.references.length,
        })),
      },
      targets,
    };
  }
  select(
    concepts: SemanticConcept[],
    catalog: VisualCatalog,
    includeGold: boolean,
    allowApproximation = false,
  ): CompositionBlueprint[] {
    const profile = this.profile(catalog, includeGold);
    return concepts.map((concept) => {
      SubjectAssignment.validate(concept, includeGold);
      const allocation = this.allocations(profile, concept, includeGold);
      for (const choice of allocation) {
        const ordered = this.order(choice.patterns);
        const targets: CompositionTarget[] = ordered.map((p, index) => ({
          index,
          referenceIds: p.references.map((reference) => reference.id),
          category: p.category,
          required: p.required,
          preferred: {},
        }));
        const match = SubjectAssignment.solve(concept, targets);
        if (!match) continue;
        const slots = ordered.map((p, index) => {
          const occurrence = ordered.slice(0, index).filter((pattern) => pattern.key === p.key).length;
          const subjectIndex = match.indices[index],
            ref = p.references[occurrence % p.references.length];
          const subject = subjectIndex === undefined ? undefined : concept.candidates[subjectIndex];
          const target = targets[index];
          if (!subject || !ref || !target) throw new Error('Incomplete aggregate slot assignment.');
          const { camera, subjectScale, subjectPosition, backgroundColor } = ref.observation.facets;
          target.preferred = { camera, subjectScale, subjectPosition, backgroundColor };
          return {
            index,
            sourceCardId: ref.id,
            sourceRequired: p.required,
            adaptedFacets: [],
            target,
            subject: structuredClone(subject),
          };
        });
        return {
          title: concept.title,
          concept: concept.concept,
          slots,
          composition: this.contract(catalog.dependencyHash, profile, choice.patterns, targets),
        };
      }
      if (allowApproximation) {
        const relaxed: SemanticConcept = {
          ...concept,
          candidates: concept.candidates.map((candidate) => ({
            ...candidate,
            compatibleComposition: undefined,
            compatibleCategories: candidate.characterCount ? ['5'] : ['1', '2', '3', '4'],
          })),
        };
        const fallback = this.select([relaxed], catalog, includeGold)[0];
        if (fallback) {
          fallback.warnings = [
            'Exact subject/composition compatibility was unavailable. Category and visual-pattern allocation were retained; subject compatibility was approximated.',
          ];
          return fallback;
        }
      }
      throw new Error(
        `No subject assignment satisfies the aggregate composition model for "${concept.title}". Revise subject compatibility, not the source statistics.`,
      );
    });
  }
  private order(patterns: Pattern[]): Pattern[] {
    const remaining = [...patterns],
      result: Pattern[] = [];
    while (remaining.length) {
      const previous = result.at(-1);
      const categoryCounts = new Map<string, number>();
      for (const pattern of remaining)
        categoryCounts.set(pattern.category, (categoryCounts.get(pattern.category) ?? 0) + 1);
      remaining.sort(
        (a, b) =>
          Number(a.category === previous?.category) - Number(b.category === previous?.category) ||
          Number(a.required.backdrop === previous?.required.backdrop) -
            Number(b.required.backdrop === previous?.required.backdrop) ||
          (categoryCounts.get(b.category) ?? 0) - (categoryCounts.get(a.category) ?? 0) ||
          a.key.localeCompare(b.key),
      );
      const next = remaining.shift();
      if (!next) throw new Error('Composition ordering lost a slot.');
      result.push(next);
    }
    return result;
  }
}
