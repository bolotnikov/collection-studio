import { z } from 'zod';
import defaults from '../../resources/composition-planning.json';
import { CompositionContract } from './CompositionContract';
import { SetContract } from './SetContract';
import { VisualCatalogContracts } from './VisualCatalogContracts';

/** Semantic proposals, immutable assignments and descriptive output have separate boundaries. */
export class CompositionPlanningContracts {
  static readonly configuration = z.object({
    version: z.enum(['source-prototype-v1', 'aggregate-pattern-v1', 'slots-first-v1']),
    aggregation: z
      .object({
        categoryWeight: z.number().positive(),
        jointPatternWeight: z.number().positive(),
        visualBalanceWeight: z.number().positive(),
      })
      .optional(),
    policy: z.object({
      maxAdaptedSlots: z.number().int().min(0).max(3),
      adaptationPenalty: z.number().min(1).max(100),
      preferredSourceBonus: z.number().min(0).max(100),
      reusedSourcePenalty: z.number().min(0).max(100),
    }),
    prompts: z.object({
      subjects: z.string().min(20),
      details: z.string().min(20),
      lighting: z.string().min(10),
      materialTreatment: z.string().min(10),
      avoid: z.string().min(10),
    }),
  });
  static readonly defaults = CompositionPlanningContracts.configuration.parse(defaults);
  static readonly compatibility = z.object({
    support: z.array(VisualCatalogContracts.facets.shape.support).min(1),
    backdrop: z.array(VisualCatalogContracts.facets.shape.backdrop).min(1),
    pattern: z.array(VisualCatalogContracts.facets.shape.pattern).min(1),
    depth: z.array(VisualCatalogContracts.facets.shape.depth).min(1),
    contextDensity: z.array(VisualCatalogContracts.facets.shape.contextDensity).min(1),
  });
  static readonly subject = z.object({
    id: z.string().min(1),
    subject: z.string().min(2),
    role: z.string().min(3),
    materials: z.array(z.string().min(1)).min(1),
    silhouette: z.string().min(3),
    compatibleCategories: z.array(SetContract.category).min(1).max(5),
    compatibleComposition: CompositionPlanningContracts.compatibility.optional(),
    characterCount: z.number().int().min(0).max(2),
  });
  static readonly concept = z.object({
    title: z.string().min(2),
    concept: z.string().min(10),
    candidates: z.array(CompositionPlanningContracts.subject).min(10).max(14),
  });
  static readonly concepts = z.object({
    variants: z.array(CompositionPlanningContracts.concept).min(1).max(5),
  });
  static readonly conceptProposal = CompositionPlanningContracts.concepts.extend({
    variants: z
      .array(
        CompositionPlanningContracts.concept.extend({
          candidates: z
            .array(
              CompositionPlanningContracts.subject.extend({
                compatibleComposition: CompositionPlanningContracts.compatibility,
              }),
            )
            .min(10)
            .max(14),
        }),
      )
      .min(1)
      .max(5),
  });
  static readonly blueprint = z.object({
    warnings: z.array(z.string()).optional(),
    title: z.string(),
    concept: z.string(),
    composition: CompositionContract.set,
    slots: z
      .array(
        z.object({
          index: z.number().int().min(0).max(9),
          sourceCardId: z.string(),
          sourceRequired: CompositionContract.requirements,
          adaptedFacets: z.array(z.enum(['support', 'pattern', 'depth'])),
          subject: CompositionPlanningContracts.subject,
          target: CompositionContract.target,
        }),
      )
      .length(10),
  });
  static readonly slotPlan = z.object({
    composition: CompositionContract.set,
    slots: z
      .array(CompositionPlanningContracts.blueprint.shape.slots.element.omit({ subject: true }))
      .length(10),
  });
  static readonly assignedSubjects = z.object({
    variants: z
      .array(
        z.object({
          variantIndex: z.number().int().min(0).max(4),
          title: z.string().min(2),
          concept: z.string().min(10),
          lighting: z.string().min(10),
          materialTreatment: z.string().min(10),
          paletteRhythm: z.string().min(10),
          cards: z
            .array(
              CompositionPlanningContracts.conceptProposal.shape.variants.element.shape.candidates.element.extend(
                {
                  index: z.number().int().min(0).max(9),
                  description: z.string().min(10),
                  composition: z.string().min(10),
                  paletteRole: z.string().min(3),
                },
              ),
            )
            .length(10),
        }),
      )
      .min(1)
      .max(5),
  });
  static readonly details = z.object({
    variants: z
      .array(
        z.object({
          variantIndex: z.number().int().min(0).max(4),
          paletteRhythm: z.string().min(10),
          lighting: z.string().min(10).optional(),
          materialTreatment: z.string().min(10).optional(),
          cards: z
            .array(
              z.object({
                index: z.number().int().min(0).max(9),
                description: z.string().min(10),
                paletteRole: z.string().min(3),
                composition: z.string().min(3),
              }),
            )
            .length(10),
        }),
      )
      .min(1)
      .max(5),
  });
  static readonly descriptionProposal = CompositionPlanningContracts.details.extend({
    variants: z
      .array(
        CompositionPlanningContracts.details.shape.variants.element.extend({
          lighting: z.string().min(10),
          materialTreatment: z.string().min(10),
        }),
      )
      .min(1)
      .max(5),
  });
  static readonly draft = z.object({
    attempt: z.number().int().min(0),
    concepts: CompositionPlanningContracts.concepts.optional(),
    blueprints: z.array(CompositionPlanningContracts.blueprint).optional(),
    slotPlans: z.array(CompositionPlanningContracts.slotPlan).optional(),
    assignedSubjects: CompositionPlanningContracts.assignedSubjects.optional(),
  });
}
export type SemanticConcept = z.infer<typeof CompositionPlanningContracts.concept>;
export type CompositionBlueprint = z.infer<typeof CompositionPlanningContracts.blueprint>;
export type CompositionPlanningConfiguration = z.infer<typeof CompositionPlanningContracts.configuration>;
export type SemanticProposal = z.infer<typeof CompositionPlanningContracts.concepts>;
export type CompositionDetails = z.infer<typeof CompositionPlanningContracts.details>;
export type CompositionDraft = z.infer<typeof CompositionPlanningContracts.draft>;
export type SlotPlan = z.infer<typeof CompositionPlanningContracts.slotPlan>;
export type AssignedSubjects = z.infer<typeof CompositionPlanningContracts.assignedSubjects>;
