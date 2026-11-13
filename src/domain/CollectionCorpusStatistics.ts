import type { CatalogCard, CatalogSet, VisualCatalog } from '../shared/VisualCatalogContracts';

/** Counts source membership, not global-card frequency; no new model analysis is performed. */
export class CollectionCorpusStatistics {
  constructor(private readonly catalog: VisualCatalog) {}
  members(set: CatalogSet): CatalogCard[] {
    if (new Set(set.cards.map((member) => member.slot)).size !== 10)
      throw new Error('Source slots must be unique.');
    return [...set.cards]
      .sort((a, b) => a.slot - b.slot)
      .map((member) => {
        const card = this.catalog.cards.find(
          (card) => card.id === member.id && card.sha256 === member.sha256,
        );
        if (!card) throw new Error('Source membership identity mismatch.');
        return card;
      });
  }
  positionStatistics() {
    const sets = [...this.catalog.sets]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((set) => {
        const cards = this.members(set);
        const gold = cards.filter((card) => card.observation.category === '5').length;
        return {
          id: set.id,
          cards,
          gold,
          cohort: gold === 10 ? 'gold-only' : gold ? 'mixed' : 'ordinary-only',
        };
      });
    const axes = [
      'category',
      'support',
      'backdrop',
      'pattern',
      'depth',
      'contextDensity',
      'camera',
      'backgroundColor',
      'subjectScale',
      'subjectPosition',
      'characterCount',
    ];
    const cohorts = ['all', 'ordinary-only', 'mixed', 'gold-only', 'ordinary-members'].map((cohort) => {
      const source =
        cohort === 'all'
          ? sets
          : cohort === 'ordinary-members'
            ? sets.filter((set) => set.gold < 10)
            : sets.filter((set) => set.cohort === cohort);
      return {
        cohort,
        setCount: source.length,
        slots: Array.from({ length: 10 }, (_, index) => {
          const cards = source.flatMap((set) => {
            const card = set.cards[index];
            return card && (cohort !== 'ordinary-members' || card.observation.category !== '5') ? [card] : [];
          });
          return {
            index,
            observations: cards.length,
            distributions: axes.map((axis) => ({
              axis,
              counts: this.count(
                cards.map((card) =>
                  this.value(
                    {
                      ...card.observation.facets,
                      category: card.observation.category,
                    },
                    axis,
                  ),
                ),
              ),
            })),
          };
        }),
      };
    });
    const mixed = sets.filter((set) => set.cohort === 'mixed');
    const supporting = mixed.filter((set) =>
      set.cards.every((card, index) => (card.observation.category === '5') === index >= 10 - set.gold),
    );
    return {
      sourceSetCount: sets.length,
      cohorts,
      goldSuffix: {
        mixedSetCount: mixed.length,
        supportingSetCount: supporting.length,
        sourceSetIds: mixed.map((set) => set.id),
        supportingSourceSetIds: supporting.map((set) => set.id),
        countsByPosition: Array.from(
          { length: 10 },
          (_, index) => mixed.filter((set) => set.cards[index]?.observation.category === '5').length,
        ),
      },
    };
  }
  analyze() {
    const sets = this.catalog.sets.map((set) => {
      const cards = this.members(set);
      const facets = cards.map((card) => card.observation.facets);
      const categories = this.count(cards.map((card) => card.observation.category));
      const colors = this.count(facets.map((f) => f.backgroundColor ?? 'unknown'));
      const duplicatePairs = this.groups(
        cards,
        (card) =>
          `${card.observation.facets.backgroundColor ?? 'unknown'}/${card.observation.facets.pattern}`,
      ).filter((entry) => entry.slots.length > 1);
      const neighbors = facets.flatMap((f, index) =>
        [
          ...(index % 5 < 4 ? [{ index: index + 1, direction: 'horizontal' }] : []),
          ...(index < 5 ? [{ index: index + 5, direction: 'vertical' }] : []),
        ].map((neighbor) => ({
          slots: [index + 1, neighbor.index + 1],
          direction: neighbor.direction,
          sameColor: Boolean(
            f.backgroundColor && f.backgroundColor === facets[neighbor.index]?.backgroundColor,
          ),
          sameCategory: cards[index]?.observation.category === cards[neighbor.index]?.observation.category,
          samePattern: f.pattern === facets[neighbor.index]?.pattern,
        })),
      );
      return {
        id: set.id,
        title: this.catalog.images.find((image) => image.id === set.id)?.title ?? set.id,
        cohort: categories['5'] === 10 ? 'gold-only' : categories['5'] ? 'mixed' : 'ordinary-only',
        categories,
        colors,
        distinctColors: Object.keys(colors).filter((color) => color !== 'unknown').length,
        maximumColorFrequency: Math.max(...Object.values(colors)),
        patterns: this.count(facets.map((f) => f.pattern)),
        decorativeDuplicatePairs: duplicatePairs.filter((pair) => !pair.key.endsWith('/none')),
        duplicatePairs,
        neighbors,
        slots: cards.map((card, index) => ({
          index,
          category: card.observation.category,
          ...card.observation.facets,
        })),
      };
    });
    const cohorts = ['all', 'ordinary-only', 'mixed', 'gold-only'].map((cohort) => {
      const source = cohort === 'all' ? sets : sets.filter((set) => set.cohort === cohort);
      return {
        cohort,
        setCount: source.length,
        categories: ['1', '2', '3', '4', '5'].map((category) => ({
          category,
          ...this.range(source.map((set) => set.categories[category] ?? 0)),
          setsPresent: source.filter((set) => set.categories[category]).length,
        })),
        distinctColors: this.range(source.map((set) => set.distinctColors)),
        maximumColorFrequency: this.range(source.map((set) => set.maximumColorFrequency)),
        decorativeDuplicateSets: source.filter((set) => set.decorativeDuplicatePairs.length).length,
        adjacentSameColor: {
          horizontal: source.reduce(
            (sum, set) =>
              sum + set.neighbors.filter((pair) => pair.sameColor && pair.direction === 'horizontal').length,
            0,
          ),
          vertical: source.reduce(
            (sum, set) =>
              sum + set.neighbors.filter((pair) => pair.sameColor && pair.direction === 'vertical').length,
            0,
          ),
        },
      };
    });
    const distributions = [
      'category',
      'backgroundColor',
      'pattern',
      'backdrop',
      'support',
      'camera',
      'subjectScale',
      'subjectPosition',
      'depth',
      'contextDensity',
      'characterCount',
    ].map((axis) => {
      const values = sets.flatMap((set) => set.slots.map((slot) => this.value(slot, axis)));
      return {
        axis,
        values: Object.keys(this.count(values))
          .sort()
          .map((value) => ({
            value,
            count: values.filter((item) => item === value).length,
            setsPresent: sets.filter((set) => set.slots.some((slot) => this.value(slot, axis) === value))
              .length,
            perSet: this.range(
              sets.map((set) => set.slots.filter((slot) => this.value(slot, axis) === value).length),
            ),
            byCategory: ['1', '2', '3', '4', '5'].map((category) => ({
              category,
              count: sets
                .flatMap((set) => set.slots)
                .filter((slot) => slot.category === category && this.value(slot, axis) === value).length,
            })),
          })),
      };
    });
    const memberships = sets.flatMap((set) => set.slots.map((slot) => ({ setId: set.id, slot })));
    const joint = new Map<
      string,
      { category: string; color: string; pattern: string; backdrop: string; count: number; sets: Set<string> }
    >();
    for (const { setId, slot } of memberships) {
      const color = slot.backgroundColor ?? 'unknown';
      const key = JSON.stringify([slot.category, color, slot.pattern, slot.backdrop]);
      const entry = joint.get(key) ?? {
        category: slot.category,
        color,
        pattern: slot.pattern,
        backdrop: slot.backdrop,
        count: 0,
        sets: new Set<string>(),
      };
      entry.count++;
      entry.sets.add(setId);
      joint.set(key, entry);
    }
    const transitions = new Map<
      string,
      {
        direction: string;
        firstCategory: string;
        secondCategory: string;
        firstColor: string;
        secondColor: string;
        firstPattern: string;
        secondPattern: string;
        count: number;
      }
    >();
    for (const set of sets)
      for (const neighbor of set.neighbors) {
        const first = set.slots[(neighbor.slots[0] ?? 1) - 1];
        const second = set.slots[(neighbor.slots[1] ?? 1) - 1];
        if (!first || !second) throw new Error('Source grid neighbor is missing.');
        const value = {
          direction: neighbor.direction,
          firstCategory: first.category,
          secondCategory: second.category,
          firstColor: first.backgroundColor ?? 'unknown',
          secondColor: second.backgroundColor ?? 'unknown',
          firstPattern: first.pattern,
          secondPattern: second.pattern,
        };
        const key = JSON.stringify(value);
        const entry = transitions.get(key) ?? { ...value, count: 0 };
        entry.count++;
        transitions.set(key, entry);
      }
    return {
      catalogDependencyHash: this.catalog.dependencyHash,
      sourceSetCount: sets.length,
      cardMembershipCount: sets.length * 10,
      positions: this.positionStatistics(),
      cohorts,
      jointColorPatterns: [...joint.values()].map(({ sets, ...entry }) => ({
        ...entry,
        setsPresent: sets.size,
      })),
      gridTransitions: [...transitions.values()],
      distributions,
      sets,
    };
  }
  private value(value: object, key: string): string {
    return String(Object.entries(value).find(([name]) => name === key)?.[1] ?? 'unknown');
  }
  private count(values: string[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const value of values) result[value] = (result[value] ?? 0) + 1;
    return result;
  }
  private groups(cards: CatalogCard[], key: (card: CatalogCard) => string) {
    const result = new Map<string, number[]>();
    cards.forEach((card, index) => result.set(key(card), [...(result.get(key(card)) ?? []), index + 1]));
    return [...result].map(([key, slots]) => ({ key, slots }));
  }
  private range(values: number[]) {
    return {
      minimum: values.length ? Math.min(...values) : 0,
      maximum: values.length ? Math.max(...values) : 0,
      mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
    };
  }
}
