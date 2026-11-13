import { SetSheetLayout } from './SetSheetLayout';
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
  static readonly cleanSet = z.object({
    sourceImageId: z.string(),
    sourceSha256: z.string().length(64),
    filename: z.string(),
    sha256: z.string().length(64),
    layout: SetSheetLayout.schema,
    method: z.enum(['original-card-assembly-v1', 'user-declared-card-assembly-v1']),
    primaryEligible: z.boolean(),
    cards: z
      .array(
        z.object({
          use: z.enum(['ordinary', 'excluded-gold-character']),
          slot: z.number().int().min(1).max(10),
          id: z.string(),
          filename: z.string(),
          sha256: z.string().length(64),
          source: z.string(),
          match: z
            .object({ error: z.number().nonnegative(), runnerUpError: z.number().positive() })
            .optional(),
        }),
      )
      .length(10),
  });
  static readonly corpus = z
    .object({
      version: z.literal(1),
      documents: z.array(KnowledgeContracts.document),
      images: z.array(KnowledgeContracts.image),
      cleanSets: z.array(KnowledgeContracts.cleanSet).optional(),
    })
    .superRefine((corpus, context) => {
      const sources = new Set<string>();
      for (const [index, sheet] of (corpus.cleanSets ?? []).entries()) {
        const original = corpus.images.find(
          (image) => image.id === sheet.sourceImageId && image.role === 'collection-example',
        );
        if (
          !original ||
          original.sha256 !== sheet.sourceSha256 ||
          sources.has(sheet.sourceImageId) ||
          sheet.primaryEligible !== sheet.cards.every((card) => card.use === 'ordinary') ||
          new Set(sheet.cards.map((card) => card.id)).size !== 10 ||
          sheet.cards.some((card, slot) => card.slot !== slot + 1)
        )
          context.addIssue({
            code: 'custom',
            path: ['cleanSets', index],
            message: 'Invalid clean-set lineage, membership or order.',
          });
        sources.add(sheet.sourceImageId);
      }

      const ids = new Set<string>(),
        paths = new Set<string>();
      for (const [index, image] of corpus.images.entries()) {
        if ((image.role === 'category-example') !== (image.category !== null))
          context.addIssue({
            code: 'custom',
            path: ['images', index, 'category'],
            message: 'Only category examples must declare a category.',
          });
        if (ids.has(image.id) || paths.has(image.filename))
          context.addIssue({
            code: 'custom',
            path: ['images', index],
            message: 'Image IDs and paths must be unique.',
          });
        ids.add(image.id);
        paths.add(image.filename);
      }
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
    cleanSets: z
      .array(KnowledgeContracts.cleanSet.extend({ reason: z.string(), attached: z.boolean() }))
      .optional(),
    guidance: z.string(),
    createdAt: z.string(),
  });
}
export type SourceKnowledge = z.infer<typeof KnowledgeContracts.corpus>;
export type KnowledgeImage = z.infer<typeof KnowledgeContracts.image>;
export type KnowledgeAnalysis = z.infer<typeof KnowledgeContracts.analysis>;
export type KnowledgeEvidence = z.infer<typeof KnowledgeContracts.evidence>;
