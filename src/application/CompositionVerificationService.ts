import path from 'node:path';
import { Contracts, type Attempt, type Card, type Variant } from '../shared/Contracts';
import { SetComposition } from '../domain/SetComposition';
import type { ActiveRun } from './ActiveRun';
import type { GenerationPort } from './GenerationPort';
import { ProductionContext } from './ProductionContext';
import { PromptCatalog } from './prompts/PromptCatalog';

/** Records observations; bounded repair decisions belong to production orchestration. */
export class CompositionVerificationService {
  constructor(private readonly context: ProductionContext) {}
  async verify(
    active: ActiveRun,
    provider: GenerationPort,
    variant: Variant,
    card: Card,
    attempt: Attempt,
    references: string[],
  ): Promise<void> {
    if (active.run.repairPolicy?.maxCardRegenerations === 0) {
      attempt.compositionCheckSkipped = 'disabled-by-policy';
      card.status = 'done';
      await this.context.publish(active.run);
      return;
    }
    const target = SetComposition.target(variant, card);
    attempt.reviewPrompt = PromptCatalog.render(
      'review.composition.v1',
      {
        card: { subject: card.subject, description: card.description, visual: card.visual },
        categoryRules: active.profile.categories[card.category],
        target: target ?? { category: card.category },
      },
      active.profile.promptCatalog?.['review.composition.v1'] ? active.profile.promptCatalog : undefined,
    );
    if (active.run.repairPolicy)
      attempt.reviewPrompt +=
        '\n' + PromptCatalog.render('review.mandatoryViolations.v1', {}, active.profile.promptCatalog);
    const backgroundRules = active.profile.requirements?.find(
      (section) =>
        section.id === 'environment-background' && (!section.stages || section.stages.includes('card')),
    );
    if (backgroundRules && active.profile.promptCatalog?.['review.environment.v1']) {
      attempt.backgroundReviewVersion = 'environment-background-v1';
      attempt.reviewPrompt +=
        '\n' +
        PromptCatalog.render(
          'review.environment.v1',
          { rules: backgroundRules.rules },
          active.profile.promptCatalog,
        );
    }
    card.status = 'reviewing';
    this.context.activity(active.run, {
      key: card.id,
      kind: 'card-review',
      subject: card.subject,
      index: variant.cards.indexOf(card) + 1,
      total: variant.cards.length,
      attempt: card.attempts.indexOf(attempt) + 1,
    });
    await this.context.publish(active.run, `Checking composition: ${card.subject}`);
    try {
      if (!provider.verifyComposition) throw new Error('Composition verification is unavailable.');
      await this.context.images.read(this.context.repository.directory(active.run.id), attempt, 'master');
      const observation = Contracts.compositionObservation.parse(
        await provider.verifyComposition(
          attempt.reviewPrompt,
          path.join(this.context.repository.directory(active.run.id), attempt.master),
          references,
        ),
      );
      attempt.compositionCheck = {
        ...observation,
        matches:
          observation.subjectPresent &&
          observation.completeSilhouette &&
          observation.compositionDescriptionMatch &&
          observation.observedCategory === card.category &&
          (card.category === '5' || observation.observedComposition.characterCount === 0) &&
          (!target ||
            (SetComposition.matches(observation.observedComposition, target.required) &&
              (!target.appearance ||
                SetComposition.matches(observation.observedComposition, target.appearance)))),
      };
      delete attempt.compositionCheckError;
    } catch (error) {
      attempt.compositionCheckError = this.context.errorMessage(error);
    }
    card.status = 'done';
    await this.context.publish(active.run);
  }
}
