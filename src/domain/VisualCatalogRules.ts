import type { VisualCatalog, CatalogSet } from '../shared/VisualCatalogContracts';
import type { LibraryItem } from '../shared/StyleContracts';
import type { SourceKnowledge } from '../shared/KnowledgeContracts';

/** Publication gates cover every source, exact membership and explicit uncertainty. */
export class VisualCatalogRules {
  static validateSources(
    library: LibraryItem[],
    knowledge: SourceKnowledge,
    memberships: { id: string; cards: CatalogSet['cards'] }[],
  ): void {
    const cards = new Map(library.map((card) => [card.id, card]));
    const sources = knowledge.images.filter((image) => image.role === 'collection-example');
    if (
      cards.size !== library.length ||
      memberships.length !== sources.length ||
      new Set(memberships.map((set) => set.id)).size !== sources.length ||
      sources.some((source) => !memberships.some((set) => set.id === source.id))
    )
      throw new Error('Catalog source identities or set coverage are inconsistent.');
    const used = new Set<string>();
    for (const set of memberships) {
      if (set.cards.length !== 10 || new Set(set.cards.map((card) => card.id)).size !== 10)
        throw new Error('A source set requires ten unique ordered cards.');
      for (const [index, card] of set.cards.entries()) {
        if (card.slot !== index + 1 || cards.get(card.id)?.sha256 !== card.sha256)
          throw new Error('Source membership disagrees with original card identity.');
        used.add(card.id);
      }
      const clean = knowledge.cleanSets?.find((sheet) => sheet.sourceImageId === set.id);
      if (
        clean &&
        JSON.stringify(clean.cards.map(({ slot, id, sha256 }) => ({ slot, id, sha256 }))) !==
          JSON.stringify(set.cards)
      )
        throw new Error('Clean sheet lineage disagrees with the source membership.');
    }
    if (library.some((card) => !used.has(card.id)))
      throw new Error('Original source card lacks set lineage.');
  }
  static validate(catalog: VisualCatalog, expectedIds: string[]): void {
    const cards = new Map(catalog.cards.map((card) => [card.id, card]));
    if (
      cards.size !== expectedIds.length ||
      catalog.cards.length !== cards.size ||
      expectedIds.some((id) => !cards.has(id))
    )
      throw new Error('Visual catalog must cover every individual source exactly once.');
    const categories = catalog.categoryExamples.filter((image) => image.role === 'category-example');
    if (categories.length !== 5 || new Set(categories.map((image) => image.category)).size !== 5)
      throw new Error('All five category exemplars are required.');
    for (const card of cards.values()) {
      if (card.observation.exemplarIds.some((id) => !categories.some((image) => image.id === id)))
        throw new Error('Card classification cites unknown category evidence.');
      if (card.observation.confidence < 0.8 && !card.observation.uncertainties.length)
        throw new Error('Low-confidence classifications must explain uncertainty.');
    }
    const sources = catalog.images.filter((image) => image.role === 'collection-example');
    if (
      new Set(catalog.sets.map((set) => set.id)).size !== sources.length ||
      catalog.sets.length !== sources.length
    )
      throw new Error('Every original set must have one visual profile.');
    const used = new Set<string>();
    for (const set of catalog.sets) {
      if (
        !sources.some((source) => source.id === set.id && source.sha256 === set.sourceSha256) ||
        new Set(set.cards.map((card) => card.id)).size !== 10
      )
        throw new Error('Invalid source-set identity or membership.');
      for (const [index, member] of set.cards.entries()) {
        if (member.slot !== index + 1 || cards.get(member.id)?.sha256 !== member.sha256)
          throw new Error('Set slot disagrees with the individual card catalog.');
        used.add(member.id);
      }
    }
    if (expectedIds.some((id) => !used.has(id))) throw new Error('Every source card requires set lineage.');
  }
}
