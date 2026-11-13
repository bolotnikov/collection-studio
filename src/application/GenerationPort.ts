import type { CompositionPlanningPort } from './CompositionPlanningPort';
import type { PlanReviewPort } from './PlanReviewPort';
import type { Brief, Card, Plan, Profile, Review, SetReview, Variant } from '../shared/Contracts';
export interface ImageResult {
  bytes: Buffer;
  requestId: string | null;
  usage: Record<string, unknown> | null;
}
export interface GenerationPort extends PlanReviewPort, CompositionPlanningPort {
  plan(brief: Brief, profile: Profile, referencePaths?: string[], correction?: string): Promise<Plan>;
  image(prompt: string, referencePaths: string[], quality: Brief['quality']): Promise<ImageResult>;
  review(
    card: Card,
    imagePath: string,
    referencePaths: string[],
    profile: Profile,
    brief?: Brief,
  ): Promise<Review>;
  reviewSet(
    variant: Variant,
    contactSheet: string,
    profile: Profile,
    referencePaths?: string[],
    brief?: Brief,
  ): Promise<SetReview>;
}
