import { z } from 'zod';
import { VisualCatalogContracts } from './VisualCatalogContracts';

export class CompositionContract {
  static readonly observed = VisualCatalogContracts.facets.pick({
    support: true,
    backdrop: true,
    pattern: true,
    depth: true,
    contextDensity: true,
    camera: true,
    subjectScale: true,
    characterCount: true,
    subjectPosition: true,
    backgroundColor: true,
    environmentKind: true,
    backgroundLayout: true,
    backgroundDetail: true,
    backgroundProps: true,
  });
  static readonly requirements = CompositionContract.observed.partial();
  static readonly target = z.object({
    appearance: z
      .object({
        backgroundColor: VisualCatalogContracts.facets.shape.backgroundColor.unwrap(),
        subjectScale: VisualCatalogContracts.facets.shape.subjectScale,
      })
      .optional(),
    referenceIds: z.array(z.string()).optional(),
    selectedReferenceIds: z.array(z.string()).min(2).max(8).optional(),
    index: z.number().int().min(0).max(9),
    category: z.enum(['1', '2', '3', '4', '5']),
    required: CompositionContract.requirements,
    preferred: CompositionContract.requirements,
  });
  static readonly set = z.object({
    version: z.literal('set-composition-v1'),
    positionPolicy: z
      .object({
        version: z.literal('source-position-v1'),
        goldSuffix: z.literal(true),
        mixedSetCount: z.number().int().min(3),
        supportingSetCount: z.number().int().min(3),
        sourceSetIds: z.array(z.string()).min(3),
      })
      .optional(),
    rhythm: z
      .object({
        version: z.literal('set-rhythm-v1'),
        columns: z.literal(5),
        colorFamilies: z.array(z.object({ color: z.string(), family: z.string() })),
        minimumDistinctColors: z.number().int().min(1).max(10),
        maximumColorFrequency: z.number().int().min(1).max(10),
        sourceSetCount: z.number().int().positive(),
        sourceDecorativeDuplicateSets: z.number().int().nonnegative(),
      })
      .optional(),
    catalogDependencyHash: z.string().length(64),
    sourceSetIds: z.array(z.string()).min(1).max(256),
    rationale: z.string().min(10),
    aggregate: z
      .object({
        version: z.literal('aggregate-pattern-v1'),
        sourceSetCount: z.number().int().positive(),
        contributingSetCount: z.number().int().positive(),
        patterns: z.array(
          z.object({
            category: z.enum(['1', '2', '3', '4', '5']),
            required: CompositionContract.requirements,
            expected: z.number().nonnegative(),
            count: z.number().int().nonnegative(),
            referenceCount: z.number().int().nonnegative(),
          }),
        ),
      })
      .optional(),
    selection: z
      .object({
        version: z.literal('source-prototype-v1'),
        sourceSetId: z.string(),
        sourceSetTitle: z.string().optional(),
        slots: z
          .array(
            z.object({
              index: z.number().int().min(0).max(9),
              sourceCardId: z.string(),
              sourceRequired: CompositionContract.requirements,
              adaptedFacets: z.array(z.enum(['support', 'pattern', 'depth'])),
            }),
          )
          .length(10),
      })
      .optional(),
    targets: z.array(CompositionContract.target).length(10),
  });
}
export type CompositionRequirements = z.infer<typeof CompositionContract.requirements>;
export type CompositionTarget = z.infer<typeof CompositionContract.target>;
