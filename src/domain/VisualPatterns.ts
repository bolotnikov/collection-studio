import definitions from '../../resources/visual-patterns.json';
import type { VisualFacets, CatalogCard, CatalogSet } from '../shared/VisualCatalogContracts';

export class VisualPatterns {
  static readonly dimensions = definitions;
  static validate(facets: Pick<VisualFacets, 'backdrop' | 'pattern'>): void {
    if ((facets.backdrop === 'pattern') === (facets.pattern === 'none'))
      throw new Error('Choose a pattern geometry for a patterned backdrop; use None for other backdrops.');
  }
  static tags(facets: Partial<VisualFacets>): string[] {
    const values: Record<string, unknown> = { ...facets };
    return definitions.flatMap((axis) =>
      typeof values[axis.key] === 'string' ? [`${axis.key}:${values[axis.key]}`] : [],
    );
  }
  static label(tag: string): string {
    const [axis, value] = tag.split(':');
    return (
      definitions.find((item) => item.key === axis)?.values.find((item) => item.value === value)?.label ?? tag
    );
  }
  static counts(cards: CatalogCard[]) {
    const counts = new Map<string, number>();
    for (const card of cards)
      for (const tag of this.tags(card.observation.facets)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts].map(([tag, count]) => ({ tag, count }));
  }
  static ranges(sets: CatalogSet[], cards: CatalogCard[]) {
    const present = new Set(
      cards.flatMap((card) => [
        `category:${card.observation.category}`,
        ...this.tags(card.observation.facets),
      ]),
    );
    const tags = [
      ...['1', '2', '3', '4', '5'].map((category) => `category:${category}`),
      ...definitions.flatMap((axis) => axis.values.map((option) => `${axis.key}:${option.value}`)),
    ].filter((tag) => present.has(tag));
    return tags.map((tag) => {
      const values = sets.map(
        (set) =>
          set.cards.filter((member) => {
            const card = cards.find((card) => card.id === member.id);
            return (
              card &&
              (tag === `category:${card.observation.category}` ||
                this.tags(card.observation.facets).includes(tag))
            );
          }).length,
      );
      return {
        tag,
        min: values.length ? Math.min(...values) : 0,
        max: Math.max(...values, 0),
        average: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
      };
    });
  }
}
