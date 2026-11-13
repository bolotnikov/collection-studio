import type { Variant } from '../shared/Contracts';
import type { VisualCatalog } from '../shared/VisualCatalogContracts';
import type { CompositionRequirements } from '../shared/CompositionContract';
import type { ContextOptimizationConfig } from '../shared/ContextOptimization';

/** Rank comparison evidence against an already fixed plan; never choose or alter its layout. */
export class ComparisonSetSelector {
  constructor(private readonly config: ContextOptimizationConfig) {}
  private pattern(category: string, f: CompositionRequirements): string {
    return JSON.stringify([
      category,
      f.support,
      f.backdrop,
      f.pattern,
      f.depth,
      f.contextDensity,
      f.characterCount,
    ]);
  }
  private histogram(values: string[]) {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1 / values.length);
    return counts;
  }
  private distance(a: Map<string, number>, b: Map<string, number>): number {
    return [...new Set([...a.keys(), ...b.keys()])].reduce(
      (sum, key) => sum + Math.abs((a.get(key) ?? 0) - (b.get(key) ?? 0)),
      0,
    );
  }
  private terms(text: string): Set<string> {
    return new Set(text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
  }
  select(variant: Variant, catalog: VisualCatalog, availableIds: string[], includeGold: boolean) {
    const composition = variant.artContract?.composition;
    if (!composition || composition.targets.length !== 10)
      throw new Error('Comparison selection requires a complete accepted slot plan.');
    const targetCategories = this.histogram(composition.targets.map((target) => target.category));
    const targetPatterns = this.histogram(
      composition.targets.map((target) => this.pattern(target.category, target.required)),
    );
    const desired = new Set(targetPatterns.keys());
    const terms = this.terms(
      [
        variant.concept,
        ...variant.cards.flatMap((card) => [card.subject, card.role, ...(card.visual?.materials ?? [])]),
      ].join(' '),
    );
    const ranked = [...new Set(availableIds)]
      .map((id) => {
        const set = catalog.sets.find((set) => set.id === id);
        if (!set || set.cards.length !== 10)
          throw new Error('Comparison source set is missing or incomplete.');
        const cards = set.cards.map((member) => {
          const card = catalog.cards.find((card) => card.id === member.id && card.sha256 === member.sha256);
          if (!card) throw new Error('Comparison source member hash mismatch.');
          return card;
        });
        const gold = cards.some((card) => card.observation.category === '5');
        if (!includeGold && gold) return null;
        const categories = this.histogram(cards.map((card) => card.observation.category));
        const patterns = this.histogram(
          cards.map((card) => this.pattern(card.observation.category, card.observation.facets)),
        );
        const sourceTerms = this.terms(
          [
            set.analysis.theme,
            set.analysis.story,
            ...set.analysis.semanticRoles,
            ...cards.flatMap((card) => [card.observation.subject, ...card.observation.facets.materials]),
          ].join(' '),
        );
        const overlap = [...terms].filter((term) => sourceTerms.has(term)).length / Math.max(1, terms.size);
        const categoryDistance = this.distance(targetCategories, categories);
        const patternDistance = this.distance(targetPatterns, patterns);
        const score =
          categoryDistance * this.config.categoryWeight +
          patternDistance * this.config.patternWeight -
          overlap * this.config.semanticWeight;
        return {
          id,
          gold,
          score,
          patterns: new Set(patterns.keys()),
          reason: JSON.stringify({ categoryDistance, patternDistance, semanticOverlap: overlap }),
        };
      })
      .filter((entry) => entry !== null)
      .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
    if (ranked.length < this.config.minimumSets)
      throw new Error('Insufficient compatible source sets for comparison.');
    const selected: typeof ranked = [];
    const add = (entry: (typeof ranked)[number] | undefined) => {
      if (entry && !selected.some((item) => item.id === entry.id)) selected.push(entry);
    };
    if (includeGold) {
      const mixed = ranked.find((entry) => entry.gold);
      if (!mixed) throw new Error('Mixed-set verification requires a mixed source example.');
      add(mixed);
      add(ranked.find((entry) => !entry.gold));
    }
    for (const entry of ranked) {
      if (selected.length >= this.config.minimumSets) break;
      add(entry);
    }
    for (const entry of ranked) {
      if (selected.length >= this.config.maximumSets) break;
      const covered = new Set(selected.flatMap((item) => [...item.patterns]));
      if ([...entry.patterns].some((pattern) => desired.has(pattern) && !covered.has(pattern))) add(entry);
    }
    selected.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
    return {
      ids: selected.map((entry) => entry.id),
      reasons: selected.map((entry) => entry.reason),
      guidance: this.config.guidance,
    };
  }
}
