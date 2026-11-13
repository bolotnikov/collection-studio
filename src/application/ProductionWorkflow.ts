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
import { CompositionRepairRules } from '../domain/CompositionRepairRules';
import { SetCompositionVerificationService } from './SetCompositionVerificationService';

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
    const allowWarnings = ProductionRules.allowsWarnings(run.planningPolicy);
    if (run.variants.length === 0) {
      run.status = 'planning';
      const aggregate = ['aggregate-pattern-v1', 'slots-first-v1'].includes(
        active.profile.compositionPlanning?.version ?? '',
      );
      await this.context.publish(
        run,
        aggregate ? 'Loading aggregate composition statistics' : 'Choosing source sets',
      );
      const context = aggregate ? null : await this.context.sourceContext(active, 'planning');
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
        ? await new SetPlanningService(this.context.referenceRoot).plan(
            provider,
            run.brief,
            context?.profile ?? this.context.reviewProfile(active),
            references,
            run.planningPolicy ?? SetContract.planningPolicy.parse(productionDefaults),
            (run.planHistory ??= []),
            (message) => this.context.publish(run, message),
            () => active.stop,
            run,
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
        run.status = active.stop ? 'paused' : 'failed';
        await this.context.publish(
          run,
          active.stop
            ? 'Planning paused'
            : 'Automatic planning could not resolve the validation errors. No images generated.',
        );
        return;
      }
      const { plan, reviews } = planned;
      if ('warnings' in planned && planned.warnings?.length) {
        run.qualityWarnings = planned.warnings;
        await this.context.publish(run, 'Continuing with the strongest plan and recorded quality warnings');
      }
      SetRules.validatePlan(plan, run.brief.variants, Boolean(run.brief.includeGold));
      run.variants = plan.variants.map((v, index) => ({
        planValidation: 'validation' in planned ? planned.validation : undefined,
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
      await this.context.publish(
        run,
        active.profile.visualCatalog ? 'Reference library ready' : 'Analyzing the reference library',
      );
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
        ProductionRules.validatePlan({ variants: [variant] }, 1, Boolean(run.brief.includeGold));
        if (
          !ProductionRules.planMatches(variant) ||
          (!allowWarnings &&
            variant.planValidation !== 'deterministic-slots-first-v1' &&
            !ProductionRules.acceptsPlan(variant.planReview, run.planningPolicy?.minimumPlanScore))
        )
          throw new Error('Set plan has not passed independent review.');
      }

      if (singleCard) {
        await this.cards.produce(active, provider, variant, singleCard.card, singleCard.instruction, {
          manual: true,
        });
      } else {
        const jobs = variant.cards.filter(
          (card) =>
            !card.locked &&
            (run.reviewProtocol === 'composition-v1'
              ? !this.context.images.selected(card) ||
                CompositionRepairRules.needsCardRepair(run, variant, card) ||
                (card.status !== 'done' &&
                  !this.context.images.selected(card)?.compositionCheck &&
                  !this.context.images.selected(card)?.compositionCheckSkipped &&
                  !this.context.images.selected(card)?.compositionCheckError)
              : SetRules.needsCardReview(this.context.images.selected(card)) ||
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
      const failed = run.variants
        .flatMap((variant) => variant.cards)
        .find((card) => card.status === 'failed');
      run.status = failed ? 'failed' : 'paused';
      await this.context.publish(run, failed?.error || 'Paused. Finished cards are saved.');
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
    if (run.reviewProtocol === 'composition-v1') {
      if (run.repairPolicy)
        for (const variant of variantsToProduce) {
          if (active.stop) break;
          await new SetCompositionVerificationService(this.context, this.cards).execute(
            active,
            provider,
            variant,
          );
        }
      if (active.stop) {
        const failed = run.variants
          .flatMap((variant) => variant.cards)
          .find((card) => card.status === 'failed');
        run.status = failed ? 'failed' : 'paused';
        await this.context.publish(run, failed?.error || 'Paused. Finished cards are saved.');
        return;
      }
      run.status = 'completed';
      await this.context.publish(run, 'Generation complete');
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
            for (const target of targets) {
              if (active.stop || run.imageCalls >= run.brief.maxImageCalls) break;
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
                { automaticRevision: true },
              );
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
    if (allowWarnings) run.qualityWarnings = ProductionRules.warnings(run, true);
    if (needsReview && !allowWarnings) run.status = 'paused';
    await this.context.publish(
      run,
      active.stop
        ? 'Review paused'
        : allowWarnings && Boolean(run.qualityWarnings?.length)
          ? 'Generation complete · completed with quality warnings'
          : needsReview
            ? 'Generation complete · needs art review'
            : 'Generation complete · automated checks passed',
    );
  }
}
