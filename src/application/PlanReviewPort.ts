import type { Brief, Plan, Profile } from '../shared/Contracts';
import type { PlanReview } from '../shared/SetContract';

export interface PlanReviewPort {
  reviewPlan(
    brief: Brief,
    variant: Plan['variants'][number],
    profile: Profile,
    references: string[],
  ): Promise<PlanReview>;
}
