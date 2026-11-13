import { CompositionVerificationService } from './CompositionVerificationService';
import { PromptCatalog } from './prompts/PromptCatalog';
import type { ActiveRun } from './ActiveRun';
import type { GenerationPort } from './GenerationPort';
import { ProductionContext } from './ProductionContext';
import { SetRules } from '../domain/SetRules';
import { ImageGenerationService } from './ImageGenerationService';
import path from 'node:path';
import {
  Contracts,
  type Attempt,
  type Profile,
  type Variant,
  type Card,
  type Review,
} from '../shared/Contracts';
import { PromptBuilder } from './PromptBuilder';
import { GenerationRequestBuilder } from './GenerationRequestBuilder';
import { SetComposition } from '../domain/SetComposition';
import { ProductionRules } from '../domain/ProductionRules';
import { CompositionRepairRules } from '../domain/CompositionRepairRules';
import type { RepairRequest } from '../shared/GenerationRepairContracts';

export class CardProductionService {
  constructor(private readonly context: ProductionContext) {}
  async produce(
    active: ActiveRun,
    provider: GenerationPort,
    variant: Variant,
    card: Card,
    instruction = '',
    options: { manual?: boolean; automaticRevision?: boolean; repair?: RepairRequest } = {},
  ): Promise<void> {
    const producing = (active.producing ??= new Set());
    producing.add(card.id);
    const previous = this.context.images.selected(card);
    try {
      if (options.manual || instruction.trim() || !active.run.repairPolicy || !previous?.compositionCheck)
        await this.produceOnce(
          active,
          provider,
          variant,
          card,
          instruction,
          Boolean(options.manual),
          options.repair,
        );
      if (!options.repair)
        while (
          !active.stop &&
          CompositionRepairRules.needsCardRepair(active.run, variant, card) &&
          CompositionRepairRules.hasImageBudget(active.run)
        ) {
          const source = this.context.images.selected(card);
          if (!source) throw new Error('Composition repair requires a selected version.');
          const correction = PromptCatalog.render(
            'correction.mandatory.v1',
            {
              violations: CompositionRepairRules.violations(variant, card, source),
              subject: card.subject,
              target: SetComposition.target(variant, card) ?? { category: card.category },
              previousAttemptId: source.id,
            },
            active.profile.promptCatalog,
          );
          await this.produceOnce(active, provider, variant, card, correction, false, {
            scope: 'card',
            sourceAttemptId: source.id,
            rootAttemptId: source.repairRootId ?? source.id,
            requestedAt: new Date().toISOString(),
            instruction: correction,
          });
          if (card.selectedAttemptId === source.id) break;
        }
      const selected = this.context.images.selected(card);
      if (options.automaticRevision && previous && this.score(selected) < this.score(previous)) {
        card.selectedAttemptId = previous.id;
        await this.context.publish(active.run, 'Retained the stronger previous version');
      }
    } finally {
      producing.delete(card.id);
      this.context.clearActivity(active.run, card.id);
      if (
        active.run.reviewProtocol !== 'composition-v1' &&
        ProductionRules.allowsWarnings(active.run.planningPolicy)
      )
        active.run.qualityWarnings = ProductionRules.warnings(active.run);
      await this.context.publish(active.run);
    }
  }
  private async produceOnce(
    active: ActiveRun,
    provider: GenerationPort,
    variant: Variant,
    card: Card,
    instruction: string,
    manual: boolean,
    repair?: RepairRequest,
  ): Promise<void> {
    const run = active.run;
    if (card.locked) return;
    const previous = this.context.images.selected(card);
    if (
      run.reviewProtocol !== 'composition-v1' &&
      !manual &&
      !instruction.trim() &&
      previous?.review &&
      !previous.reviewError &&
      !SetRules.acceptsReview(previous.review, run.productionPolicy?.styleThreshold ?? 4)
    ) {
      instruction = this.repairInstruction(previous.review, active.profile);
    }
    const folder = this.context.repository.directory(run.id),
      references = this.context.references(card, active.profile, variant);
    this.context.activity(run, {
      key: card.id,
      kind: 'references',
      subject: card.subject,
      index: variant.cards.findIndex((item) => item.id === card.id) + 1,
      total: variant.cards.length,
      attempt: card.attempts.length + 1,
    });
    await this.context.publish(run, `Preparing reference context: ${card.subject}`);
    const context = await this.context.sourceContext(active, 'card', variant, card);
    if (active.stop) return;
    const cardProfile = {
      ...(context?.profile ?? this.context.reviewProfile(active)),
      activeArtContract: variant.artContract,
      compositionState: variant.artContract?.composition
        ? SetComposition.snapshot(variant, active.producing, run.productionPolicy?.styleThreshold ?? 4)
        : undefined,
    };
    const prepared = await active.preparation?.prepare(run.brief, card, variant, cardProfile, instruction);
    if (active.stop) return;
    if (variant.artContract?.composition)
      cardProfile.compositionState = SetComposition.snapshot(
        variant,
        active.producing,
        run.productionPolicy?.styleThreshold ?? 4,
      );
    const request = new GenerationRequestBuilder().build({
      prompt: prepared?.prompt ?? PromptBuilder.build(card, variant, cardProfile, instruction),
      profile: cardProfile,
      target: SetComposition.target(variant, card),
      brief: run.brief,
      card,
      references: prepared?.references ?? references,
      prepared,
      sourceContext: context,
      instruction,
      previous: previous ? { id: previous.id, path: path.join(folder, previous.master) } : undefined,
    });
    const selectedReferences = [...(prepared?.references ?? references), ...(context?.referencePaths ?? [])];
    const reviewProfile = { ...cardProfile, inputManifest: request.reviewManifest };
    if (
      !manual &&
      !instruction.trim() &&
      (run.reviewProtocol === 'composition-v1'
        ? previous && !previous.compositionCheck && !previous.compositionCheckError
        : SetRules.needsCardReview(previous))
    ) {
      if (!previous) throw new Error('Selected attempt missing.');
      await this.reviewAndRepair(
        active,
        provider,
        variant,
        card,
        previous,
        reviewProfile,
        selectedReferences,
      );
      return;
    }
    const prompt = request.prompt;
    if (active.stop) return;
    if (repair) {
      if (card.selectedAttemptId !== repair.sourceAttemptId)
        throw new Error('Repair source selection changed.');
      if (!CompositionRepairRules.hasImageBudget(run)) return;
      (card.repairRequests ??= []).push(repair);
    }
    const callsBeforeGeneration = run.imageCalls;
    const generated = await new ImageGenerationService(this.context).generate(
      active,
      provider,
      variant,
      card,
      request,
    );
    if (!generated) {
      if (repair && run.imageCalls === callsBeforeGeneration)
        card.repairRequests = card.repairRequests?.filter((request) => request !== repair);
      return;
    }
    const { result, id, files, elapsedMs } = generated;
    const attempt = {
      repairRootId: repair?.rootAttemptId,
      revisionOf: instruction.trim() ? previous?.id : undefined,
      id,
      ...files,
      prompt,
      generationInputManifest: request.generationManifest,
      model: run.imageModel,
      createdAt: new Date().toISOString(),
      elapsedMs,
      requestId: result.requestId,
      usage: result.usage,
      review: null,
      reviewError: null,
      evidence: prepared?.evidence,
      sourceEvidence: context?.evidence,
    };
    card.attempts.push(attempt);
    card.selectedAttemptId = id;
    if (repair) repair.resultAttemptId = id;
    const stored = card.attempts.find((a) => a.id === id);
    if (!stored) throw new Error('Attempt was not persisted.');
    await this.reviewAndRepair(active, provider, variant, card, stored, reviewProfile, selectedReferences);
  }
  private async reviewAndRepair(
    active: ActiveRun,
    provider: GenerationPort,
    variant: Variant,
    card: Card,
    stored: Attempt,
    cardProfile: Profile,
    selectedReferences: string[],
  ): Promise<void> {
    const run = active.run;
    if (run.reviewProtocol === 'composition-v1') {
      await new CompositionVerificationService(this.context).verify(
        active,
        provider,
        variant,
        card,
        stored,
        selectedReferences,
      );
      return;
    }
    stored.review = null;
    stored.reviewError = null;
    stored.reviewPrompt = PromptBuilder.cardReview(card, cardProfile, run.brief);
    stored.reviewInputManifest = cardProfile.inputManifest;
    stored.reviewSourceEvidence = cardProfile.knowledgeContext;
    card.status = 'reviewing';
    this.context.activity(run, {
      key: card.id,
      kind: 'card-review',
      subject: card.subject,
      index: variant.cards.findIndex((item) => item.id === card.id) + 1,
      total: variant.cards.length,
      attempt: card.attempts.findIndex((attempt) => attempt.id === stored.id) + 1,
    });
    await this.context.publish(run, `Reviewing: ${card.subject}`);
    try {
      stored.review = Contracts.review.parse(
        await provider.review(
          card,
          path.join(this.context.repository.directory(run.id), stored.preview),
          selectedReferences,
          cardProfile,
          run.brief,
        ),
      );
      stored.review.passed = SetRules.acceptsReview(stored.review, run.productionPolicy?.styleThreshold ?? 4);
      const target = SetComposition.target(variant, card);
      if (target) {
        if (!stored.review.observedComposition)
          throw new Error('Card verifier did not return observed composition evidence.');
        stored.review.compositionMatch =
          (card.category === '5' || stored.review.observedComposition.characterCount === 0) &&
          SetComposition.matches(stored.review.observedComposition, target.required);
        stored.review.passed = SetRules.acceptsReview(
          stored.review,
          run.productionPolicy?.styleThreshold ?? 4,
        );
        if (!stored.review.compositionMatch) {
          const mismatch = JSON.stringify({
            expectedComposition: target.required,
            observedComposition: stored.review.observedComposition,
          });
          stored.review.findings.push(mismatch);
          stored.review.correction = [stored.review.correction, mismatch].filter(Boolean).join('\n');
        }
      }
    } catch (error) {
      stored.reviewError = this.context.errorMessage(error);
    }
    card.status = 'done';
    await this.context.publish(run);
    const outstanding = run.variants
      .flatMap((v) => v.cards)
      .filter((c) => c.status === 'pending' && !c.selectedAttemptId).length;
    if (
      !active.stop &&
      (run.productionPolicy ? true : run.brief.autoRepair) &&
      stored.review &&
      !stored.review.passed &&
      card.attempts.length < 1 + (run.productionPolicy?.maxRepairsPerCard ?? 1) &&
      run.imageCalls + outstanding < run.brief.maxImageCalls
    ) {
      await this.produce(
        active,
        provider,
        variant,
        card,
        this.repairInstruction(stored.review, active.profile),
        { automaticRevision: true },
      );
    }
  }
  private score(attempt: Attempt | undefined): number {
    if (!attempt?.review || attempt.reviewError) return 0;
    const review = attempt.review;
    return review.style + review.readability + review.subjectMatch + (review.passed ? 20 : 0);
  }
  private repairInstruction(review: Review, profile: Profile): string {
    return (
      review.correction.trim() ||
      review.findings.join('; ').trim() ||
      PromptCatalog.render('correction.cardFallback', {}, profile.promptCatalog)
    );
  }
}
