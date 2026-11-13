import type { CatalogCard } from '../shared/VisualCatalogContracts';
import type { CatalogDecision } from '../shared/CatalogCurationContracts';

/** Explicit reviewed decisions stay separate from model observations and numerical confidence. */
export class CatalogCurator {
  static apply(cards: CatalogCard[], decisions: CatalogDecision[]): CatalogCard[] {
    for (const decision of decisions)
      if (!cards.some((card) => card.id === decision.id && card.sha256 === decision.sha256))
        throw new Error('Catalog curation source identity mismatch.');
    return cards.map((card) => {
      const decision = decisions.find(
        (decision) => decision.id === card.id && decision.sha256 === card.sha256,
      );
      if (!decision) return card;
      return {
        ...card,
        curation: {
          modelCategory: card.curation?.modelCategory ?? card.observation.category,
          reason: decision.reason,
          evidenceSourceSha256: decision.evidenceSourceSha256,
          slot: decision.slot,
        },
        observation: {
          ...card.observation,
          category: decision.category,
          categoryRationale: decision.reason,
          facets: { ...card.observation.facets, characterCount: decision.characterCount },
        },
      };
    });
  }
}
