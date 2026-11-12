import { z } from 'zod';

export class KnowledgeContracts {
  static readonly document = z.object({
    id: z.string().min(1),
    title: z.string(),
    source: z.string(),
    filename: z.string(),
    sha256: z.string().length(64),
    text: z.string(),
    role: z.enum([
      'assignment',
      'collection-structure',
      'composition-rules',
      'analysis-space',
      'reference-inventory',
      'delivery',
    ]),
  });
  static readonly image = z.object({
    id: z.string().min(1),
    title: z.string(),
    source: z.string(),
    filename: z.string(),
    sha256: z.string().length(64),
    role: z.enum(['collection-example', 'category-example', 'delivery-template']),
    category: z.enum(['1', '2', '3', '4', '5']).nullable(),
  });
  static readonly corpus = z.object({
    version: z.literal(1),
    documents: z.array(KnowledgeContracts.document),
    images: z.array(KnowledgeContracts.image),
  });
  static readonly analysis = z.object({
    summary: z.string().min(1),
    theme: z.string(),
    semanticPrinciples: z.array(z.string()),
    visualPrinciples: z.array(z.string()),
    objectRoles: z.array(z.string()),
    avoidTransferring: z.array(z.string()),
    ordinarySetExample: z.boolean(),
  });
  static readonly evidence = z.object({
    version: z.literal(1),
    stage: z.enum(['planning', 'card', 'set-review']),
    model: z.string(),
    documents: z.array(
      KnowledgeContracts.document.pick({ id: true, sha256: true, source: true, role: true }),
    ),
    images: z.array(
      KnowledgeContracts.image.extend({
        reason: z.string().min(1),
        attached: z.boolean(),
        analysis: KnowledgeContracts.analysis,
      }),
    ),
    guidance: z.string(),
    createdAt: z.string(),
  });
}
export type SourceKnowledge = z.infer<typeof KnowledgeContracts.corpus>;
export type KnowledgeImage = z.infer<typeof KnowledgeContracts.image>;
export type KnowledgeAnalysis = z.infer<typeof KnowledgeContracts.analysis>;
export type KnowledgeEvidence = z.infer<typeof KnowledgeContracts.evidence>;
