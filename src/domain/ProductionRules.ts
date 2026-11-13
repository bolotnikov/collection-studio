import type { Plan, Variant, Run } from '../shared/Contracts';
import type { PlanReview, PlanningPolicy } from '../shared/SetContract';
import { SetRules } from './SetRules';
import { SetComposition } from './SetComposition';

export class ProductionRules {
  static allowsWarnings(policy?: PlanningPolicy): boolean {
    return policy?.qualityMode === 'best-effort-v1';
  }
  static warnings(run: Run, includeSet = false): string[] {
    const result: string[] = [];
    for (const variant of run.variants) {
      result.push(...(variant.artContract?.warnings ?? []).map((warning) => `${variant.title}: ${warning}`));
      if (
        variant.planValidation !== 'deterministic-slots-first-v1' &&
        !this.acceptsPlan(variant.planReview, run.planningPolicy?.minimumPlanScore)
      )
        result.push(
          `${variant.title}: ${variant.planReview?.findings.join('; ') || 'Independent plan review did not pass or was unavailable.'}`,
        );
      for (const card of variant.cards) {
        const attempt = card.attempts.find((attempt) => attempt.id === card.selectedAttemptId);
        if (!attempt) continue;
        for (const warning of attempt.evidence?.warnings ?? []) result.push(`${card.subject}: ${warning}`);
        if (
          !SetRules.acceptsReview(attempt.review, run.productionPolicy?.styleThreshold ?? 4) ||
          attempt.reviewError
        )
          result.push(
            `${card.subject}: ${attempt.reviewError || attempt.review?.findings.join('; ') || 'Card verification did not pass or was unavailable.'}`,
          );
      }
      if (
        includeSet &&
        (!SetRules.acceptsSetReview(
          variant.review,
          run.productionPolicy?.styleThreshold ?? 4,
          Boolean(run.reviewProtocol),
        ) ||
          variant.reviewError)
      )
        result.push(
          `${variant.title}: ${variant.reviewError || variant.review?.findings.join('; ') || 'Whole-set verification did not pass or was unavailable.'}`,
        );
    }
    return [...new Set(result)];
  }
  /** Validate new proposals only; historical contracts retain their original semantics. */
  static validateReferenceBindings(plan: Plan): void {
    const position =
      /\b(?:images?|inputs?|attachments?)\s*(?:#|№)?\s*\d|(?:изображени[еяй]|вложени[еяй])\s*(?:#|№)?\s*\d/iu;
    for (const variant of plan.variants) {
      if (position.test(JSON.stringify(variant.artContract)))
        throw new Error('Art contracts must use stable reference IDs, never stage-specific image numbers.');
    }
  }
  static signature(variant: Plan['variants'][number]): string {
    return JSON.stringify([
      variant.title,
      variant.concept,
      variant.artContract,
      variant.cards.map((c) => [
        c.subject,
        c.description,
        c.category,
        c.role,
        c.visual,
        ...(c.subjectType ? [c.subjectType] : []),
      ]),
    ]);
  }
  static planMatches(variant: Variant): boolean {
    return variant.planSignature === this.signature(variant);
  }
  static validatePlan(plan: Plan, count: number, includeGold = false): void {
    SetRules.validatePlan(plan, count, includeGold);
    for (const variant of plan.variants) {
      const contract = variant.artContract;
      if (!contract) throw new Error('Art contract missing.');
      for (const category of ['1', '2', '3', '4', '5'] as const)
        if (
          variant.cards.filter((card) => card.category === category).length !==
          (contract.categoryAllocation[category] ?? 0)
        )
          throw new Error(`Category ${category} does not match the accepted allocation.`);
      if (Object.values(contract.categoryAllocation).reduce((sum, count) => sum + (count ?? 0), 0) !== 10)
        throw new Error('Category allocation must total ten.');
    }
  }
  static acceptsPlan(review: PlanReview | undefined, minimum = 4): boolean {
    return Boolean(
      review?.passed &&
      review.categoryAllocationValid &&
      review.producerRequirementsMet &&
      review.thematicCohesion >= minimum &&
      review.visualDiversity >= minimum &&
      review.styleFaithfulness >= minimum,
    );
  }
  static readyForExport(variant: Variant, minimumStyle: number, policy?: PlanningPolicy): boolean {
    if (
      !this.planMatches(variant) ||
      !variant.artContract ||
      (variant.planValidation !== 'deterministic-slots-first-v1' &&
        !this.acceptsPlan(variant.planReview, policy?.minimumPlanScore))
    )
      return false;
    return (
      !variant.artContract.composition ||
      variant.cards.every((card) => {
        const target = SetComposition.target(variant, card);
        const attempt = card.attempts.find((attempt) => attempt.id === card.selectedAttemptId);
        return Boolean(
          target &&
          attempt?.review?.observedComposition &&
          attempt.review.compositionMatch === true &&
          SetComposition.matches(attempt.review.observedComposition, target.required),
        );
      })
    );
  }
}
