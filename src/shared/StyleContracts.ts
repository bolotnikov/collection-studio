import productionRules from '../../resources/production-rules.json';
import { z } from 'zod';
import { StyleRuleContracts } from './StyleRuleContracts';

export class StyleContracts {
  static readonly referenceMetadata = z.object({
    category: z.enum(['1', '2', '3', '4']),
    description: StyleRuleContracts.line,
  });
  static readonly referenceEdit = StyleContracts.referenceMetadata.extend({ id: z.string().min(1) });
  static readonly policy = z.object({
    referenceLimit: z.number().int().min(4).max(12).default(8),
    maxRepairsPerCard: z.number().int().min(0).max(4).default(2),
    styleThreshold: z.number().min(4).max(5).default(5),
    rules: z.array(z.string().trim().min(5).max(1500)).max(40).default(productionRules),
  });
  static readonly libraryItem = z.object({
    id: z.string().min(1),
    filename: z.string().min(1),
    title: z.string(),
    category: z.enum(['1', '2', '3', '4', 'unknown']),
    sha256: z.string().min(1),
    source: z.string(),
    origin: z.enum(['anchor', 'user']).default('anchor'),
    approved: z.boolean().default(true),
    tags: z.array(z.string()).default([]),
    metadata: StyleContracts.referenceMetadata.optional(),
  });
  static readonly analysis = z.object({
    eligible: z.boolean(),
    exclusionReason: z.string(),
    subject: z.string(),
    materials: z.array(z.string()),
    silhouette: z.string(),
    rendering: z.string(),
    lighting: z.string(),
    palette: z.string(),
    background: z.string(),
    category: z.enum(['1', '2', '3', '4', '5']),
    usefulPrinciples: z.array(z.string()),
    avoidCopying: z.array(z.string()),
  });
  static readonly selection = z.object({
    selections: z.array(
      z.object({
        id: z.string(),
        reason: z.string().trim().min(1),
        role: z.string().trim().min(1),
        take: z.string().trim().min(1),
        ignore: z.string().trim().min(1),
      }),
    ),
    visualDirection: z.string().trim().min(1),
    materialGuidance: z.string().trim().min(1),
    compositionGuidance: z.string().trim().min(1),
    pitfalls: z.array(z.string()),
  });
  static readonly evidence = z.object({
    version: z.literal('style-v2'),
    query: z.string(),
    policy: StyleContracts.policy,
    references: z.array(
      z.object({
        id: z.string(),
        category: z.enum(['1', '2', '3', '4', 'unknown']).optional(),
        purposes: z.array(z.enum(['shared-style', 'category', 'supporting'])).optional(),
        sha256: z.string(),
        source: z.string(),
        origin: z.enum(['anchor', 'user']),
        reason: z.string().trim().min(1),
        role: z.string().trim().min(1),
        take: z.string().trim().min(1),
        ignore: z.string().trim().min(1),
      }),
    ),
    analysis: StyleContracts.selection,
    createdAt: z.string(),
    model: z.string(),
  });
}
export type StylePolicy = z.infer<typeof StyleContracts.policy>;
export type LibraryItem = z.infer<typeof StyleContracts.libraryItem>;
export type ReferenceMetadata = z.infer<typeof StyleContracts.referenceMetadata>;
export type ReferenceEdit = z.infer<typeof StyleContracts.referenceEdit>;
export type ReferenceAnalysis = z.infer<typeof StyleContracts.analysis>;
export type StyleEvidence = z.infer<typeof StyleContracts.evidence>;

export type ProductionPolicy = StylePolicy;
