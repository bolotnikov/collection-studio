import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ActiveRun } from './ActiveRun';
import type { GenerationPort } from './GenerationPort';
import type { Variant } from '../shared/Contracts';
import { GenerationRepairContracts } from '../shared/GenerationRepairContracts';
import type { GridRepairRound } from '../shared/GenerationRepairContracts';
import { CompositionRepairRules } from '../domain/CompositionRepairRules';
import { SetComposition } from '../domain/SetComposition';
import { CardProductionService } from './CardProductionService';
import { ProductionContext } from './ProductionContext';
import { PromptCatalog } from './prompts/PromptCatalog';
import { ManualSlotTagPrompts } from './prompts/ManualSlotTagPrompts';
import { SlotTagRules } from '../domain/SlotTagRules';

/** Reviews exact selected versions and persists bounded, resumable correction batches. */
export class SetCompositionVerificationService {
  constructor(
    private readonly context: ProductionContext,
    private readonly cards: CardProductionService,
  ) {}

  async execute(active: ActiveRun, provider: GenerationPort, variant: Variant): Promise<void> {
    const policy = active.run.repairPolicy;
    if (!policy || policy.maxSetRegenerationRounds === 0) return;
    const history = (variant.gridReviewHistory ??= []);
    const rounds = (variant.gridRepairRounds ??= []);
    while (!active.stop) {
      const pending = rounds.find((round) => !round.completedAt && !round.supersededAt);
      if (pending) {
        await this.correct(active, provider, variant, pending);
        if (active.stop) return;
      }
      const currentHistory = history.filter((entry) =>
        SlotTagRules.gridCurrent(variant, entry.slotTagRevisions),
      );
      let review = currentHistory.at(-1);
      const selection = variant.cards.map((card) => card.selectedAttemptId ?? '');
      if (!review || JSON.stringify(review.attemptIds) !== JSON.stringify(selection)) {
        if (currentHistory.length >= 1 + policy.maxSetRegenerationRounds) return;
        review = await this.inspect(active, provider, variant, selection);
      }
      if (
        active.stop ||
        review.error ||
        !review.observation?.corrections.length ||
        rounds.filter((round) => currentHistory.some((entry) => entry.id === round.reviewId)).length >=
          policy.maxSetRegenerationRounds
      )
        return;
      const targets = review.observation.corrections.filter(
        (correction) =>
          !variant.cards.find((card) => card.id === correction.cardId)?.locked &&
          SlotTagRules.gridCorrectionAllowed(variant, correction.cardId, correction.kind),
      );
      if (!targets.length || !CompositionRepairRules.hasImageBudget(active.run)) return;
      const round = {
        id: randomUUID(),
        reviewId: review.id,
        targetCardIds: targets.map((target) => target.cardId),
        startedAt: new Date().toISOString(),
      };
      rounds.push(round);
      await this.context.publish(active.run);
      await this.correct(active, provider, variant, round);
    }
  }

  private async inspect(active: ActiveRun, provider: GenerationPort, variant: Variant, attemptIds: string[]) {
    const review = GenerationRepairContracts.setReview.parse({
      id: randomUUID(),
      at: new Date().toISOString(),
      attemptIds,
      slotTagRevisions: variant.cards.some((card) => card.slotTagEdits?.length)
        ? SlotTagRules.gridRevisions(variant)
        : undefined,
      prompt:
        PromptCatalog.render(
          'review.grid.v1',
          {
            brief: active.run.brief,
            artContract: SetComposition.activeContract(variant) ?? { concept: variant.concept },
            cards: variant.cards.map((card, index) => ({
              index: index + 1,
              cardId: card.id,
              subject: card.subject,
              visual: card.visual,
              target: SetComposition.target(variant, card) ?? { category: card.category },
            })),
          },
          active.profile.promptCatalog,
        ) + ManualSlotTagPrompts.render(active.profile, variant),
      error: 'Set composition request outcome is unknown.',
    });
    (variant.gridReviewHistory ??= []).push(review);
    try {
      if (!provider.verifySetComposition) throw new Error('Set composition verification is unavailable.');
      const sheet = await this.context.images.sheet(
        this.context.repository.directory(active.run.id),
        variant,
      );
      review.sheet = path.basename(sheet);
      this.context.activity(active.run, {
        key: variant.id,
        kind: 'set-review',
        subject: variant.title,
        index: active.run.variants.indexOf(variant) + 1,
        total: active.run.variants.length,
      });
      await this.context.publish(active.run, 'Checking complete set composition');
      if (active.stop) {
        variant.gridReviewHistory = variant.gridReviewHistory?.filter((entry) => entry !== review);
        return review;
      }
      const observation = GenerationRepairContracts.setObservation.parse(
        await provider.verifySetComposition(review.prompt, sheet),
      );
      const ids = observation.corrections.map((correction) => correction.cardId);
      if (new Set(ids).size !== ids.length || ids.some((id) => !variant.cards.some((card) => card.id === id)))
        throw new Error('Set composition corrections must identify distinct existing cards.');
      review.observation = observation;
      delete review.error;
    } catch (error) {
      review.error = this.context.errorMessage(error);
    } finally {
      this.context.clearActivity(active.run, variant.id);
      await this.context.publish(active.run);
    }
    return review;
  }

  private async correct(
    active: ActiveRun,
    provider: GenerationPort,
    variant: Variant,
    round: GridRepairRound,
  ): Promise<void> {
    const review = variant.gridReviewHistory?.find((review) => review.id === round.reviewId);
    if (!review?.observation) throw new Error('Set repair round is missing its review evidence.');
    if (!SlotTagRules.gridCurrent(variant, review.slotTagRevisions)) {
      round.supersededAt = new Date().toISOString();
      await this.context.publish(active.run);
      return;
    }
    let next = 0;
    const worker = async () => {
      while (!active.stop) {
        const cardId = round.targetCardIds[next++];
        if (!cardId) return;
        const card = variant.cards.find((card) => card.id === cardId);
        const correction = review.observation?.corrections.find((correction) => correction.cardId === cardId);
        if (!card || !correction) throw new Error('Invalid set repair target.');
        if (card.locked || card.repairRequests?.some((request) => request.roundId === round.id)) continue;
        if (!CompositionRepairRules.hasImageBudget(active.run)) continue;
        const source = this.context.images.selected(card);
        if (!source || source.id !== review.attemptIds[variant.cards.indexOf(card)]) continue;
        const instruction = PromptCatalog.render(
          'correction.grid.v1',
          { correction, previousAttemptId: source.id },
          active.profile.promptCatalog,
        );
        try {
          await this.cards.produce(active, provider, variant, card, instruction, {
            repair: {
              scope: 'set',
              sourceAttemptId: source.id,
              rootAttemptId: source.id,
              requestedAt: new Date().toISOString(),
              instruction,
              roundId: round.id,
            },
          });
        } catch (error) {
          card.status = 'failed';
          card.error = this.context.errorMessage(error);
          active.stop = true;
          await this.context.publish(active.run, card.error);
        }
      }
    };
    await Promise.all(Array.from({ length: active.run.planningPolicy?.productionConcurrency ?? 2 }, worker));
    if (!active.stop) {
      round.completedAt = new Date().toISOString();
      await this.context.publish(active.run);
    }
  }
}
