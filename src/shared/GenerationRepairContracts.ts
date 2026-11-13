import { z } from 'zod';

/** Additive persisted contracts keep historical observations and settings readable. */
export class GenerationRepairContracts {
  static readonly limit = z.number().int().min(0).max(150);
  static readonly limits = z.object({
    maxCardRegenerations: GenerationRepairContracts.limit.default(0),
    maxSetRegenerationRounds: GenerationRepairContracts.limit.default(0),
  });
  static readonly policy = GenerationRepairContracts.limits.extend({
    version: z.literal('bounded-composition-v1'),
    enabledAt: z.string(),
    reason: z.enum(['new-run', 'user-requested-resume', 'user-requested-regeneration']),
  });
  static readonly violation = z.object({
    kind: z.enum([
      'wrong-subject',
      'clipped-silhouette',
      'forbidden-character',
      'wrong-category',
      'wrong-background',
    ]),
    evidence: z.string().trim().min(1),
  });
  static readonly request = z.object({
    scope: z.enum(['card', 'set']),
    sourceAttemptId: z.string(),
    rootAttemptId: z.string(),
    requestedAt: z.string(),
    instruction: z.string(),
    roundId: z.string().optional(),
    resultAttemptId: z.string().optional(),
  });
  static readonly setObservation = z.object({
    findings: z.array(z.string()),
    corrections: z
      .array(
        z.object({
          cardId: z.string().min(1),
          kind: z.enum([
            'duplicate-subject',
            'duplicate-silhouette',
            'color-pattern-rhythm',
            'adjacent-color',
            'shared-contract',
          ]),
          evidence: z.string().trim().min(1),
          instruction: z.string().trim().min(1),
        }),
      )
      .max(10),
  });
  static readonly setReview = z.object({
    id: z.string(),
    at: z.string(),
    attemptIds: z.array(z.string()).length(10),
    sheet: z.string().optional(),
    prompt: z.string(),
    observation: GenerationRepairContracts.setObservation.optional(),
    error: z.string().optional(),
  });
  static readonly round = z.object({
    id: z.string(),
    reviewId: z.string(),
    targetCardIds: z.array(z.string()).min(1).max(10),
    startedAt: z.string(),
    completedAt: z.string().optional(),
  });
}

export type RepairRequest = z.infer<typeof GenerationRepairContracts.request>;
export type GridRepairRound = z.infer<typeof GenerationRepairContracts.round>;
