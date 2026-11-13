import type { ActiveRun } from './ActiveRun';
import type { GenerationPort } from './GenerationPort';
import { ProductionContext } from './ProductionContext';
import { SetRules } from '../domain/SetRules';
import path from 'node:path';
import type { Variant } from '../shared/Contracts';
import { PromptBuilder } from './PromptBuilder';

export class SetReviewService {
  constructor(private readonly context: ProductionContext) {}
  async review(active: ActiveRun, provider: GenerationPort, variant: Variant): Promise<void> {
    try {
      await this.reviewOnce(active, provider, variant);
    } finally {
      this.context.clearActivity(active.run, variant.id);
      await this.context.publish(active.run);
    }
  }
  private async reviewOnce(active: ActiveRun, provider: GenerationPort, variant: Variant): Promise<void> {
    const activity = {
      key: variant.id,
      subject: variant.title,
      index: active.run.variants.findIndex((item) => item.id === variant.id) + 1,
      total: active.run.variants.length,
    };
    this.context.activity(active.run, { ...activity, kind: 'set-references' });
    await this.context.publish(active.run);
    variant.review = null;
    delete variant.reviewSheet;
    const context = await this.context.sourceContext(active, 'set-review', variant);
    if (active.stop) return;
    const clean = context?.evidence.cleanSets;
    const attempts = variant.cards.map((card) => card.selectedAttemptId ?? '');
    try {
      if (active.run.reviewProtocol === 'set-v3' && (!clean || clean.length < 2))
        throw new Error('Clean reference sheets are required for set review.');
      if (clean?.some((sheet) => JSON.stringify(sheet.layout) !== JSON.stringify(clean[0]?.layout)))
        throw new Error('Clean reference layouts differ.');
      this.context.activity(active.run, { ...activity, kind: 'assembly' });
      await this.context.publish(active.run);
      const sheet = await this.context.images.sheet(
        this.context.repository.directory(active.run.id),
        variant,
        clean?.[0]?.layout,
      );
      variant.reviewSheet = path.basename(sheet);
      variant.sourceEvidence = context?.evidence;
      if (active.run.reviewProtocol === 'set-v3' && !SetRules.hasCleanSetEvidence(variant))
        throw new Error('Verified ordinary clean-set evidence is required.');
      const reviewProfile = {
        ...(context?.profile ?? this.context.reviewProfile(active)),
        activeArtContract: variant.artContract,
      };
      variant.reviewPrompt = PromptBuilder.setReview(variant, reviewProfile, active.run.brief);
      this.context.activity(active.run, { ...activity, kind: 'set-review' });
      await this.context.publish(active.run);
      variant.review = await provider.reviewSet(
        variant,
        sheet,
        reviewProfile,
        clean
          ? [
              ...(context?.referencePaths ?? []),
              ...active.profile.references
                .slice(0, 4)
                .map((r) => path.join(this.context.referenceRoot, r.filename)),
            ]
          : [
              ...active.profile.references
                .slice(0, context ? 4 : 8)
                .map((r) => path.join(this.context.referenceRoot, r.filename)),
              ...(context?.referencePaths ?? []),
            ],
        active.run.brief,
      );
      SetRules.validateSetReview(variant.review, variant);
      variant.review.passed = SetRules.acceptsSetReview(
        variant.review,
        active.run.productionPolicy?.styleThreshold ?? 4,
        Boolean(active.run.reviewProtocol),
      );
      variant.reviewedAttemptIds = attempts;
      variant.reviewError = null;
    } catch (error) {
      variant.review = null;
      variant.reviewError = this.context.errorMessage(error);
    }
    variant.reviewHistory ??= [];
    variant.reviewHistory.push({
      at: new Date().toISOString(),
      attemptIds: attempts,
      sheet: variant.reviewSheet,
      prompt: variant.reviewPrompt,
      review: structuredClone(variant.review),
      error: variant.reviewError,
      sourceEvidence: context?.evidence,
    });
    await this.context.publish(active.run);
  }
}
