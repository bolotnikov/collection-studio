import { PromptCatalog } from './prompts/PromptCatalog';
import type { ActiveRun } from './ActiveRun';
import type { GenerationPort } from './GenerationPort';
import { ProductionContext } from './ProductionContext';
import { SetRules } from '../domain/SetRules';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Contracts, type Card, type Variant } from '../shared/Contracts';
import { SetContract } from '../shared/SetContract';
import { ProductionRules } from '../domain/ProductionRules';
import productionDefaults from '../../resources/production-config.json';
import { SetPlanningService } from './SetPlanningService';
import { CardProductionService } from './CardProductionService';
import { SetReviewService } from './SetReviewService';

export class ProductionWorkflow {
  private readonly cards: CardProductionService;
  private readonly reviews: SetReviewService;
  constructor(private readonly context: ProductionContext) {
    this.cards = new CardProductionService(context);
    this.reviews = new SetReviewService(context);
  }
  async execute(
    active: ActiveRun,
    provider: GenerationPort,
    singleCard?: { card: Card; variant: Variant; instruction: string },
  ): Promise<void> {
    const run = active.run;
    if (run.variants.length === 0) {
      run.status = 'planning';
      await this.context.publish(run, 'Planning ten subjects for each variant');
      const context = await this.context.sourceContext(active, 'planning');
      if (active.stop) {
        run.status = 'paused';
        await this.context.publish(run, 'Review paused');
        return;
      }
      run.sourceEvidence = context?.evidence;
      const references = [
        ...active.profile.references
          .slice(0, context ? 4 : 8)
          .map((ref) => path.join(this.context.referenceRoot, ref.filename)),
        ...(context?.referencePaths ?? []),
      ];
      const planned = run.workflowVersion
        ? await new SetPlanningService().plan(
            provider,
            run.brief,
            context?.profile ?? this.context.reviewProfile(active),
            references,
            run.planningPolicy ?? SetContract.planningPolicy.parse(productionDefaults),
            (run.planHistory ??= []),
            () => this.context.publish(run, 'Reviewing the set plan'),
            () => active.stop,
          )
        : {
            plan: await provider.plan(
              run.brief,
              context?.profile ?? this.context.reviewProfile(active),
              references,
            ),
            reviews: [],
          };
      if (!planned) {
        run.status = 'paused';
        await this.context.publish(run, 'Set plan needs revision. No images generated.');
        return;
      }
      const { plan, reviews } = planned;
      SetRules.validatePlan(plan, run.brief.variants);
      run.variants = plan.variants.map((v, index) => ({
        planReview: reviews[index],
        planSignature: ProductionRules.signature(v),
        ...v,
        id: randomUUID(),
        review: null,
        reviewError: null,
        cards: v.cards.map((c) => ({
          ...c,
          id: randomUUID(),
          status: 'pending',
          attempts: [],
          selectedAttemptId: null,
          locked: false,
          error: null,
        })),
      }));
      run.selectedVariantId = run.variants[0]?.id ?? null;
      await this.context.publish(run, 'Set plans validated');
    }
    if (active.preparation) {
      await this.context.publish(run, 'Analyzing the reference library');
      await active.preparation.initialize?.(
        () => active.stop,
        async (indexed, total) => {
          await this.context.publish(run, `Reference library: ${indexed}/${total} analyzed`);
        },
      );
      if (active.stop) {
        run.status = 'paused';
        await this.context.publish(run, 'Reference analysis paused. Cached results retained.');
        return;
      }
    }
    run.status = 'generating';
    const variantsToProduce = singleCard ? [singleCard.variant] : run.variants;
    for (const variant of variantsToProduce) {
      if (active.stop) break;
      if (run.workflowVersion) {
        Contracts.productionPlan.parse({ variants: [variant] });
        ProductionRules.validatePlan({ variants: [variant] }, 1);
        if (
          !ProductionRules.planMatches(variant) ||
          !ProductionRules.acceptsPlan(variant.planReview, run.planningPolicy?.minimumPlanScore)
        )
          throw new Error('Set plan has not passed independent review.');
        const pilot = ProductionRules.pilot(variant);
        const minimum = run.productionPolicy?.styleThreshold ?? 4;
        if (singleCard && singleCard.card.id !== pilot.id && !ProductionRules.pilotAccepted(variant, minimum))
          throw new Error('Verify the pilot before generating another card.');
        if (!singleCard && !ProductionRules.pilotAccepted(variant, minimum)) {
          if (
            !pilot.locked &&
            (SetRules.needsCardReview(this.context.images.selected(pilot)) ||
              pilot.attempts.length < 1 + (run.productionPolicy?.maxRepairsPerCard ?? 1))
          ) {
            await this.context.publish(run, 'Generating and verifying the pilot card');
            try {
              await this.cards.produce(active, provider, variant, pilot);
            } catch (error) {
              pilot.status = 'failed';
              pilot.error = this.context.errorMessage(error);
              active.stop = true;
              await this.context.publish(run, pilot.error);
            }
          }
          if (active.stop || !ProductionRules.pilotAccepted(variant, minimum)) {
            delete variant.pilotAttemptId;
            run.status = 'paused';
            await this.context.publish(run, 'Pilot needs revision. Remaining cards are blocked.');
            return;
          }
        }
        if (ProductionRules.pilotAccepted(variant, minimum)) {
          variant.pilotAttemptId = pilot.selectedAttemptId ?? undefined;
          await this.context.publish(run, 'Pilot verified. Producing the remaining cards.');
        }
      }
      if (singleCard) {
        await this.cards.produce(active, provider, variant, singleCard.card, singleCard.instruction);
        if (run.workflowVersion) {
          if (ProductionRules.pilotAccepted(variant, run.productionPolicy?.styleThreshold ?? 4))
            variant.pilotAttemptId = ProductionRules.pilot(variant).selectedAttemptId ?? undefined;
          else delete variant.pilotAttemptId;
        }
      } else {
        const jobs = variant.cards.filter(
          (card) =>
            !card.locked &&
            (SetRules.needsCardReview(this.context.images.selected(card)) ||
              card.status !== 'done' ||
              (run.productionPolicy &&
                (!SetRules.acceptsReview(
                  this.context.images.selected(card)?.review,
                  run.productionPolicy.styleThreshold,
                ) ||
                  Boolean(this.context.images.selected(card)?.reviewError)) &&
                card.attempts.length < 1 + run.productionPolicy.maxRepairsPerCard)),
        );
        let next = 0;
        const worker = async () => {
          while (!active.stop) {
            const card = jobs[next++];
            if (!card) break;
            try {
              await this.cards.produce(active, provider, variant, card);
            } catch (error) {
              card.status = 'failed';
              card.error = this.context.errorMessage(error);
              active.stop = true;
              await this.context.publish(run, card.error);
            }
          }
        };
        await Promise.all(Array.from({ length: run.planningPolicy?.productionConcurrency ?? 2 }, worker));
      }
    }
    if (active.stop) {
      run.status = 'paused';
      await this.context.publish(run, 'Paused. Finished cards are saved.');
      return;
    }
    if (run.variants.some((v) => v.cards.some((c) => !this.context.images.selected(c)))) {
      run.status = 'paused';
      await this.context.publish(
        run,
        'The collection is incomplete. Resume to generate the remaining cards.',
      );
      return;
    }
    run.status = 'reviewing';
    await this.context.publish(run, 'Reviewing set coherence');
    const variants = singleCard ? [singleCard.variant] : run.variants;
    for (const variant of variants) {
      if (active.stop) break;
      if (variant.cards.some((c) => !c.selectedAttemptId)) continue;
      try {
        await this.reviews.review(active, provider, variant);
        const policy = run.productionPolicy;
        if (policy) {
          for (
            let round = 0;
            round < policy.maxRepairsPerCard && !variant.review?.passed && !active.stop;
            round++
          ) {
            const targets = variant.cards.filter(
              (card) =>
                variant.review?.outlierCardIds.includes(card.id) &&
                !card.locked &&
                card.attempts.length < 1 + policy.maxRepairsPerCard,
            );
            if (!targets.length) break;
            const correction =
              variant.review?.findings.join('; ') ??
              PromptCatalog.render('correction.setFallback', {}, active.profile.promptCatalog);
            if (run.workflowVersion)
              targets.sort(
                (a, b) =>
                  Number(b.id === ProductionRules.pilot(variant).id) -
                  Number(a.id === ProductionRules.pilot(variant).id),
              );
            for (const target of targets) {
              if (active.stop || run.imageCalls >= run.brief.maxImageCalls) break;
              if (
                run.workflowVersion &&
                target.id !== ProductionRules.pilot(variant).id &&
                !ProductionRules.pilotAccepted(variant, run.productionPolicy?.styleThreshold ?? 4)
              )
                break;
              await this.cards.produce(
                active,
                provider,
                variant,
                target,
                ('corrections' in (variant.review ?? {})
                  ? Contracts.detailedSetReview
                      .parse(variant.review)
                      .corrections.find((c) => c.cardId === target.id)?.instruction
                  : undefined) ?? correction,
              );
            }
            if (run.workflowVersion) {
              if (ProductionRules.pilotAccepted(variant, run.productionPolicy?.styleThreshold ?? 4))
                variant.pilotAttemptId = ProductionRules.pilot(variant).selectedAttemptId ?? undefined;
              else {
                delete variant.pilotAttemptId;
                active.stop = true;
              }
            }
            await this.reviews.review(active, provider, variant);
          }
        }
      } catch (error) {
        variant.reviewError = this.context.errorMessage(error);
      }
      await this.context.publish(run);
    }
    run.status = active.stop ? 'paused' : 'completed';
    const needsReview = run.variants.some(
      (v) =>
        (run.reviewProtocol === 'set-v3' && !SetRules.hasCleanSetEvidence(v)) ||
        (run.workflowVersion &&
          !ProductionRules.readyForExport(
            v,
            run.productionPolicy?.styleThreshold ?? 4,
            run.planningPolicy,
          )) ||
        !SetRules.acceptsSetReview(
          v.review,
          run.productionPolicy?.styleThreshold ?? 4,
          Boolean(run.reviewProtocol),
        ) ||
        Boolean(v.reviewError) ||
        v.cards.some(
          (c) =>
            !SetRules.acceptsReview(
              this.context.images.selected(c)?.review,
              run.productionPolicy?.styleThreshold ?? 4,
            ) || Boolean(this.context.images.selected(c)?.reviewError),
        ),
    );
    if (needsReview) run.status = 'paused';
    await this.context.publish(
      run,
      active.stop
        ? 'Review paused'
        : needsReview
          ? 'Generation complete · needs art review'
          : 'Generation complete · automated checks passed',
    );
  }
}
