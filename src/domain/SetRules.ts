import type { Attempt, Brief, Plan, Run, Review, SetReview, Variant } from '../shared/Contracts';

export class SetRules {
  static needsCardReview(attempt: Attempt | undefined): boolean {
    return Boolean(attempt && (!attempt.review || attempt.reviewError));
  }
  static hasCleanSetEvidence(variant: Variant): boolean {
    const evidence = variant.sourceEvidence,
      sheets = evidence?.cleanSets;
    return Boolean(
      variant.reviewSheet &&
      evidence?.stage === 'set-review' &&
      sheets &&
      sheets.length >= 2 &&
      sheets.length <= 4 &&
      new Set(sheets.map((sheet) => sheet.sourceImageId)).size === sheets.length &&
      sheets.every(
        (sheet) =>
          sheet.primaryEligible &&
          sheet.cards.length === 10 &&
          sheet.cards.every((card) => card.use === 'ordinary') &&
          JSON.stringify(sheet.layout) === JSON.stringify(sheets[0]?.layout) &&
          evidence.images.some(
            (image) => image.id === sheet.sourceImageId && image.sha256 === sheet.sourceSha256,
          ),
      ),
    );
  }

  static acceptsSetReview(review: SetReview | null | undefined, minimumStyle = 4, detailed = false): boolean {
    if (!review?.passed || review.coherence < 4 || review.outlierCardIds.length) return false;
    if (!('assessment' in review)) return !detailed;
    const a = review.assessment;
    return (
      a.styleCompatibility >= minimumStyle &&
      a.thematicCohesion >= 4 &&
      a.silhouetteDiversity >= 4 &&
      a.materialDiversity >= 4 &&
      a.paletteBalance >= 4 &&
      a.compositionBalance >= 4 &&
      a.categoryCoverage &&
      !a.redundantSubjects
    );
  }
  static validateSetReview(review: SetReview, variant: Variant): void {
    const ids = new Set(variant.cards.map((c) => c.id));
    if (
      new Set(review.outlierCardIds).size !== review.outlierCardIds.length ||
      review.outlierCardIds.some((id) => !ids.has(id))
    )
      throw new Error('Review contains invalid card IDs.');
    if (
      'corrections' in review &&
      (review.corrections.some((c) => !ids.has(c.cardId)) ||
        review.outlierCardIds.some((id) => !review.corrections.some((c) => c.cardId === id)))
    )
      throw new Error('Every set outlier needs a targeted correction.');
  }
  static reviewMatchesSelection(variant: Variant, required = false): boolean {
    if (!variant.reviewedAttemptIds) return !required;
    return (
      variant.reviewedAttemptIds.length === variant.cards.length &&
      variant.cards.every((c, i) => c.selectedAttemptId === variant.reviewedAttemptIds?.[i])
    );
  }
  static acceptsReview(review: Review | null | undefined, minimumStyle = 4): boolean {
    return Boolean(
      review?.passed &&
      review.categoryMatch &&
      review.style >= minimumStyle &&
      review.readability >= 4 &&
      review.subjectMatch >= 4,
    );
  }

  static validatePlan(plan: Plan, expectedVariants: number): void {
    if (plan.variants.length !== expectedVariants) throw new Error(`Expected ${expectedVariants} variants.`);
    for (const variant of plan.variants) {
      if (variant.cards.length !== 10) throw new Error('Each variant must contain exactly ten cards.');
      const names = variant.cards.map((c) => c.subject.trim().toLocaleLowerCase());
      if (new Set(names).size !== 10) throw new Error('Duplicate subjects in a variant.');
      const categories = new Set(variant.cards.map((c) => c.category));
      if (categories.size !== 4) throw new Error('Each variant must include all four categories.');
    }
  }
  static validateBrief(brief: Brief): void {
    if (brief.maxImageCalls < brief.variants * 10)
      throw new Error('Image limit must cover all variants (ten cards each).');
  }
  static reserveImage(run: Run): void {
    if (run.imageCalls >= run.brief.maxImageCalls)
      throw new Error('Generation limit reached. Results are saved.');
    run.imageCalls++;
  }
}
