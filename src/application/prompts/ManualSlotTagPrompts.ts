import type { Card, Profile, Variant } from '../../shared/Contracts';
import { SetComposition } from '../../domain/SetComposition';
import { PromptCatalog } from './PromptCatalog';

/** One authored precedence policy is shared by generation and both verification stages. */
export class ManualSlotTagPrompts {
  static render(
    profile: Profile,
    variant: Variant,
    cards: Card[] = variant.cards,
    instruction?: string,
  ): string {
    const overrides = cards
      .filter((card) => card.slotTagEdits?.length)
      .map((card) => ({
        cardId: card.id,
        revision: card.slotTagEdits?.at(-1),
        target: SetComposition.target(variant, card),
        revisionInstructions:
          instruction ??
          card.attempts.find((attempt) => attempt.id === card.selectedAttemptId)?.revisionInstruction ??
          '',
      }));
    return overrides.length
      ? '\n' + new PromptCatalog(profile.promptCatalog).render('manual.slot-tags.v1', { overrides })
      : '';
  }
}
