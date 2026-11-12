import type { Brief, Plan, Run, Review } from '../shared/Contracts';

export class SetRules {
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
