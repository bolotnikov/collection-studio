import { z } from 'zod';

export class StyleContracts {
  static readonly policy = z.object({
    referenceLimit: z.number().int().min(4).max(12).default(8),
    maxRepairsPerCard: z.number().int().min(0).max(4).default(2),
    styleThreshold: z.number().min(4).max(5).default(5),
    rules: z
      .array(z.string().trim().min(5).max(1500))
      .max(40)
      .default([
        'A set tells one coherent story through ten varied recognizable objects; shared color or a loose theme alone is insufficient.',
        'Every set includes all four composition categories with varied silhouettes, materials and environmental complexity.',
        'The generated set must coexist with the supplied game reference art without perceptible rendering-style differences.',
        'Genre atmosphere changes subjects and storytelling, never the anchor rendering style.',
        'No gold character cards, people, typography, card frames or rarity decorations.',
      ]),
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
export type ReferenceAnalysis = z.infer<typeof StyleContracts.analysis>;
export type StyleEvidence = z.infer<typeof StyleContracts.evidence>;

export type ProductionPolicy = StylePolicy;
