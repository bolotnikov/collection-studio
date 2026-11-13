import { Contracts, type Profile } from '../shared/Contracts';
import type { LibraryItem } from '../shared/StyleContracts';

/** Freeze one effective catalog for every consumer in a new production run. */
export class ReferenceProfile {
  static resolve(profile: Profile, catalog: LibraryItem[], effectiveRevision?: string): Profile {
    const items = new Map(catalog.map((item) => [item.id, item]));
    if (items.size !== catalog.length) throw new Error('Duplicate reference catalog IDs.');
    let visualCatalog = profile.visualCatalog;
    if (visualCatalog) {
      let changed = false;
      const cards = visualCatalog.cards.map((card) => {
        const item = items.get(card.id);
        if (!item || item.sha256 !== card.sha256)
          throw new Error('Visual catalog metadata identity mismatch.');
        const category = item.metadata?.category ?? item.category;
        const subject = item.metadata?.description ?? item.title;
        if (
          category === 'unknown' ||
          (category === card.observation.category && subject === card.observation.subject)
        )
          return card;
        changed = true;
        return { ...card, observation: { ...card.observation, category, subject } };
      });
      if (changed && !effectiveRevision)
        throw new Error('Effective reference metadata requires its own catalog revision.');
      visualCatalog = {
        ...structuredClone(visualCatalog),
        cards,
        baseDependencyHash: visualCatalog.baseDependencyHash ?? visualCatalog.dependencyHash,
        dependencyHash: effectiveRevision ?? visualCatalog.dependencyHash,
      };
    }
    return Contracts.profile.parse({
      ...profile,
      visualCatalog,
      library: catalog.map((item) => ({
        ...structuredClone(item),
        metadata:
          item.category === 'unknown'
            ? item.metadata
            : {
                category: item.metadata?.category ?? item.category,
                description: item.metadata?.description ?? item.title,
              },
      })),
      references: profile.references.map((reference) => {
        const item = items.get(reference.id);
        if (!item || item.sha256 !== reference.sha256 || item.filename !== reference.filename)
          throw new Error(`Original reference identity mismatch: ${reference.id}`);
        return {
          ...reference,
          category: item.metadata?.category ?? item.category,
          title: item.metadata?.description ?? item.title,
        };
      }),
    });
  }
}
