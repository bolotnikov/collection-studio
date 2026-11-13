import type { Plan } from '../shared/Contracts';

/** Validate declared visible identities before spending any image requests. */
export class DepictedEntityRules {
  static validate(plan: Pick<Plan, 'variants'>): void {
    const identities = new Map<string, string>();
    const appearances = new Map<string, string>();
    for (const [variantIndex, variant] of plan.variants.entries()) {
      for (const [index, card] of variant.cards.entries()) {
        const location = `set ${variantIndex + 1}, slot ${index + 1} (${card.subject})`;
        const entities = card.depictedEntities;
        if (!card.subjectType || !entities?.length)
          throw new Error(`Missing depicted identities at ${location}.`);
        const characters = entities.filter((entity) => entity.kind === 'character');
        const expected = variant.artContract?.composition?.targets.find((target) => target.index === index)
          ?.required.characterCount;
        if (
          card.category === '5'
            ? characters.length < 1 ||
              characters.length > 2 ||
              (expected !== undefined && characters.length !== expected)
            : characters.length !== 0 ||
              !entities.some((entity) => entity.kind === 'object' && entity.identity === card.subjectType)
        )
          throw new Error(`Depicted identities contradict the subject or character count at ${location}.`);
        for (const entity of entities) {
          const key = `${entity.kind}/${entity.identity}`;
          const previous = identities.get(key);
          if (previous)
            throw new Error(
              `Duplicate depicted entity "${key}" at ${location}; first used at ${previous}. Replace it with a distinct subject or person, not a renamed identity.`,
            );
          identities.set(key, location);
          if (entity.kind === 'character') {
            const appearance = entity.appearance
              .normalize('NFKC')
              .toLowerCase()
              .replace(/[^\p{L}\p{N}]+/gu, ' ')
              .trim();
            const prior = appearances.get(appearance);
            if (prior)
              throw new Error(
                `Duplicate character appearance at ${location}; first used at ${prior}. Design a visibly different person.`,
              );
            appearances.set(appearance, location);
          }
        }
      }
    }
  }
}
