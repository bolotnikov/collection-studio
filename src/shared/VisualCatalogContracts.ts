import { z } from 'zod';
import { KnowledgeContracts } from './KnowledgeContracts';

/** Orthogonal observations; composition category is never inferred from background alone. */
export class VisualCatalogContracts {
  static readonly category = z.enum(['1', '2', '3', '4', '5']);
  static readonly environment = z.object({
    majorShapes: z.array(z.string().min(1)).min(1),
    secondaryObjects: z.array(z.string().min(1)),
    smallDetails: z.array(z.string().min(1)),
    layout: z.string().min(10),
  });
  static readonly environmentFacets = z.object({
    environmentKind: z
      .enum(['sky', 'landscape', 'waterside', 'underwater', 'interior', 'stage', 'architecture'])
      .optional(),
    backgroundLayout: z
      .enum(['open-field', 'layered-bands', 'side-framing', 'enclosing-surfaces'])
      .optional(),
    backgroundDetail: z.enum(['broad-masses', 'local-accents', 'repeated-detail']).optional(),
    backgroundProps: z.enum(['none', 'one-or-two', 'several']).optional(),
  });
  static readonly backgroundEvidence = z.object({
    facets: VisualCatalogContracts.environmentFacets,
    environment: VisualCatalogContracts.environment,
  });
  static readonly facets = z.object({
    ...VisualCatalogContracts.environmentFacets.shape,
    support: z.enum(['none', 'simple-plane', 'material-surface', 'environment']),
    backdrop: z.enum(['plain', 'gradient', 'pattern', 'surface-continuation', 'environment']),
    pattern: z.enum([
      'none',
      'rays',
      'stripes',
      'repeated-motifs',
      'geometric',
      'organic',
      'waves',
      'circles',
      'checker',
    ]),
    subjectPosition: z.enum(['center', 'left', 'right', 'upper', 'lower']).optional(),
    backgroundColor: z
      .enum([
        'red',
        'orange',
        'yellow',
        'green',
        'cyan',
        'blue',
        'purple',
        'pink',
        'brown',
        'cream',
        'white',
        'gray',
        'black',
        'multicolor',
      ])
      .optional(),
    depth: z.enum(['flat', 'shallow', 'spatial']),
    contextDensity: z.enum(['none', 'minimal', 'contextual']),
    camera: z.enum(['front', 'three-quarter', 'top', 'low', 'other']),
    subjectScale: z.enum(['small', 'medium', 'large']),
    characterCount: z.number().int().min(0).max(10),
    palette: z.array(z.string().min(1)).min(1),
    materials: z.array(z.string().min(1)).min(1),
    silhouette: z.string().min(3),
    rendering: z.string().min(10),
    lighting: z.string().min(5),
  });
  static readonly observation = z.object({
    environment: VisualCatalogContracts.environment.optional(),
    category: VisualCatalogContracts.category,
    subject: z.string().min(3),
    facets: VisualCatalogContracts.facets,
    confidence: z.number().min(0).max(1),
    categoryRationale: z.string().min(10),
    exemplarIds: z.array(z.string()).min(1),
    alternatives: z.array(VisualCatalogContracts.category),
    uncertainties: z.array(z.string()),
  });
  static readonly card = z.object({
    curation: z
      .object({
        modelCategory: VisualCatalogContracts.category,
        reason: z.string(),
        evidenceSourceSha256: z.string().length(64),
        slot: z.number().int(),
      })
      .optional(),
    backdropSchemaVersion: z.literal(2).optional(),
    patternAnalysisKey: z.string().length(64).optional(),
    analysisKey: z.string().length(64).optional(),
    id: z.string(),
    sha256: z.string().length(64),
    filename: z.string(),
    observation: VisualCatalogContracts.observation,
  });
  static readonly setAnalysis = z.object({
    theme: z.string().min(3),
    story: z.string().min(10),
    paletteRhythm: z.string().min(10),
    backgroundRhythm: z.string().min(10),
    scaleAndCameraRhythm: z.string().min(10),
    semanticRoles: z.array(z.string()).length(10),
    cautions: z.array(z.string()),
  });
  static readonly set = z.object({
    analysisKey: z.string().length(64).optional(),
    id: z.string(),
    sourceSha256: z.string().length(64),
    cleanSha256: z.string().length(64).nullable(),
    cards: z
      .array(
        z.object({ slot: z.number().int().min(1).max(10), id: z.string(), sha256: z.string().length(64) }),
      )
      .length(10),
    analysis: VisualCatalogContracts.setAnalysis,
  });
  static readonly categoryProfile = z.object({
    id: z.string(),
    category: VisualCatalogContracts.category,
    permittedVariations: z.array(z.string()).min(1),
    cautions: z.array(z.string()),
  });
  static readonly catalog = z.object({
    version: z.literal('visual-catalog-v1'),
    model: z.string(),
    dependencyHash: z.string().length(64),
    baseDependencyHash: z.string().length(64).optional(),
    createdAt: z.string(),
    categoryExamples: z.array(KnowledgeContracts.image),
    categoryProfiles: z.array(VisualCatalogContracts.categoryProfile),
    categoryAnalysisKey: z.string().length(64).optional(),
    documents: z.array(KnowledgeContracts.document),
    images: z.array(KnowledgeContracts.image),
    cards: z.array(VisualCatalogContracts.card),
    sets: z.array(VisualCatalogContracts.set),
  });
}
export type VisualFacets = z.infer<typeof VisualCatalogContracts.facets>;
export type CardObservation = z.infer<typeof VisualCatalogContracts.observation>;
export type CatalogCard = z.infer<typeof VisualCatalogContracts.card>;
export type CatalogSet = z.infer<typeof VisualCatalogContracts.set>;
export type VisualCatalog = z.infer<typeof VisualCatalogContracts.catalog>;
