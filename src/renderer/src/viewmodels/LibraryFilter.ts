import type { LibraryItem } from '../../../shared/StyleContracts';

export type CategoryFilter = 'all' | '1' | '2' | '3' | '4' | 'unknown' | 'excluded';
export class LibraryFilter {
  static readonly categories: CategoryFilter[] = ['all', '1', '2', '3', '4', 'unknown', 'excluded'];
  static bucket(item: LibraryItem): Exclude<CategoryFilter, 'all'> {
    return item.tags.includes('exclude:ordinary-card-generation') ? 'excluded' : item.category;
  }
  static groups(items: LibraryItem[], filter: CategoryFilter) {
    return this.categories
      .filter((category) => category !== 'all' && (filter === 'all' || filter === category))
      .map((category) => ({ category, items: items.filter((item) => this.bucket(item) === category) }))
      .filter((group) => group.items.length);
  }
  static count(items: LibraryItem[], filter: CategoryFilter): number {
    return filter === 'all' ? items.length : items.filter((item) => this.bucket(item) === filter).length;
  }
}
