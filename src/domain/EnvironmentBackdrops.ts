import { z } from 'zod';
import reviewed from '../../resources/environment-backdrops.json';
import {
  VisualCatalogContracts,
  type VisualCatalog,
  type CardObservation,
} from '../shared/VisualCatalogContracts';

/** Hash-bound editorial observations supplement source analysis before user edits, never frozen runs. */
export class EnvironmentBackdrops {
  static readonly facets = VisualCatalogContracts.environmentFacets;
  static readonly review = z
    .object({
      version: z.literal('environment-background-v1'),
      reviewedAt: z.string(),
      method: z.literal('visual-inspection'),
      cards: z.array(
        z.object({
          id: z.string(),
          sha256: z.string().length(64),
          hasEnvironment: z.boolean(),
          facets: EnvironmentBackdrops.facets.required().optional(),
          environment: VisualCatalogContracts.environment.optional(),
        }),
      ),
    })
    .superRefine((review, context) => {
      if (new Set(review.cards.map((card) => card.id)).size !== review.cards.length)
        context.addIssue({ code: 'custom', message: 'Duplicate background-review identity.' });
      for (const card of review.cards) {
        if (
          card.hasEnvironment !== Boolean(card.environment && card.facets) ||
          (!card.hasEnvironment && (card.environment || card.facets))
        )
          context.addIssue({
            code: 'custom',
            message: 'Background review is incomplete or contradicts its scope.',
          });
        if (card.environment && card.facets) {
          const count = card.environment.secondaryObjects.length;
          const props = count === 0 ? 'none' : count <= 2 ? 'one-or-two' : 'several';
          if (card.facets.backgroundProps !== props)
            context.addIssue({
              code: 'custom',
              message: 'Background-object count disagrees with its evidence.',
            });
        }
      }
    })
    .parse(reviewed);

  static evidence(observation?: CardObservation) {
    return observation?.environment
      ? VisualCatalogContracts.backgroundEvidence.parse({
          facets: observation.facets,
          environment: observation.environment,
        })
      : undefined;
  }

  static apply(catalog: VisualCatalog): void {
    for (const card of catalog.cards) {
      const entry = this.review.cards.find((entry) => entry.id === card.id && entry.sha256 === card.sha256);
      if (!entry?.hasEnvironment || !entry.environment || !entry.facets) continue;
      card.observation.environment ??= structuredClone(entry.environment);
      card.observation.facets = { ...entry.facets, ...card.observation.facets };
    }
  }
}
