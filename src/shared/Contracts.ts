import { ContextOptimization } from './ContextOptimization';
import { CompositionPlanningContracts } from './CompositionPlanningContracts';
import type { StyleRuleSettings, StyleRuleEdit } from './StyleRuleContracts';
import { RetrievalConfiguration } from './RetrievalConfiguration';
import { SetContract } from './SetContract';
import { KnowledgeContracts } from './KnowledgeContracts';
import { StyleContracts, type ProductionPolicy, type LibraryItem } from './StyleContracts';
import { z } from 'zod';
import { VisualCatalogContracts } from './VisualCatalogContracts';
import { CompositionContract } from './CompositionContract';
import { GenerationRepairContracts } from './GenerationRepairContracts';
import { SlotTagContracts, type SlotTagEdit } from './SlotTagContracts';

export class Contracts {
  static readonly inputManifest = z.array(
    z.object({
      image: z.number().int().positive(),
      role: z.string().min(1),
      id: z.string().optional(),
      category: z.string().nullable().optional(),
      take: z.string().optional(),
      ignore: z.string().optional(),
      background: VisualCatalogContracts.backgroundEvidence.optional(),
    }),
  );
  static readonly artDirectionRequest = z.object({
    theme: z.string().trim().min(2).max(180),
    wishes: z.string().max(3000),
    includeGold: z.boolean().optional(),
  });
  static readonly artDirectionResult = z.object({ text: z.string().trim().min(10).max(600) });
  static readonly brief = z.object({
    theme: z.string().trim().min(2).max(180),
    wishes: z.string().max(3000),
    variants: z.number().int().min(1).max(5).default(1),
    quality: z.enum(['low', 'medium', 'high']),
    maxImageCalls: z.number().int().min(1).max(150),
    autoRepair: z.boolean(),
    includeGold: z.boolean().optional(),
  });
  static readonly plannedCard = z.object({
    subject: z.string().min(2),
    subjectType: CompositionPlanningContracts.subjectType.optional(),
    description: z.string().min(10),
    category: z.enum(['1', '2', '3', '4', '5']),
    role: z.string().min(3),
    visual: SetContract.visual.optional(),
  });
  static readonly plan = z.object({
    variants: z.array(
      z.object({
        title: z.string(),
        concept: z.string(),
        artContract: SetContract.persistedArt.optional(),
        cards: z.array(Contracts.plannedCard),
      }),
    ),
  });
  static readonly productionPlan = z.object({
    variants: z
      .array(
        z.object({
          title: z.string().min(2),
          concept: z.string().min(10),
          artContract: SetContract.art,
          cards: z.array(Contracts.plannedCard.extend({ visual: SetContract.visual })).length(10),
        }),
      )
      .min(1)
      .max(5),
  });
  static readonly review = z.object({
    passed: z.boolean(),
    style: z.number().min(1).max(5),
    readability: z.number().min(1).max(5),
    subjectMatch: z.number().min(1).max(5),
    categoryMatch: z.boolean(),
    findings: z.array(z.string()),
    correction: z.string(),
    observedComposition: CompositionContract.observed
      .extend({ characterCount: CompositionContract.observed.shape.characterCount.optional() })
      .optional(),
    compositionMatch: z.boolean().optional(),
  });
  static readonly preparedProductionPlan = Contracts.productionPlan.extend({
    variants: z
      .array(
        Contracts.productionPlan.shape.variants.element.extend({
          artContract: SetContract.art.extend({ composition: CompositionContract.set }),
        }),
      )
      .min(1)
      .max(5),
  });
  static readonly compositionReview = Contracts.review.extend({
    observedComposition: CompositionContract.observed,
  });
  static readonly setReview = z.object({
    passed: z.boolean(),
    coherence: z.number().min(1).max(5),
    findings: z.array(z.string()),
    outlierCardIds: z.array(z.string()),
  });
  static readonly detailedSetReview = Contracts.setReview.extend({
    assessment: z.object({
      styleCompatibility: z.number().min(1).max(5),
      thematicCohesion: z.number().min(1).max(5),
      silhouetteDiversity: z.number().min(1).max(5),
      materialDiversity: z.number().min(1).max(5),
      paletteBalance: z.number().min(1).max(5),
      compositionBalance: z.number().min(1).max(5),
      categoryCoverage: z.boolean(),
      redundantSubjects: z.boolean(),
    }),
    corrections: z.array(z.object({ cardId: z.string(), instruction: z.string().min(1) })),
  });
  static readonly compositionCheck = z.object({
    unexpectedBackgroundObjects: z
      .array(z.object({ object: z.string().trim().min(1), position: z.string().trim().min(1) }))
      .optional(),
    confirmedViolations: z.array(GenerationRepairContracts.violation).optional(),
    subjectPresent: z.boolean(),
    completeSilhouette: z.boolean(),
    compositionDescriptionMatch: z.boolean(),
    observedCategory: z.enum(['1', '2', '3', '4', '5']),
    observedComposition: CompositionContract.observed.extend({
      subjectPosition: CompositionContract.observed.shape.subjectPosition.unwrap(),
      backgroundColor: CompositionContract.observed.shape.backgroundColor.unwrap(),
    }),
    findings: z.array(z.string()),
    matches: z.boolean(),
  });
  static readonly compositionObservation = Contracts.compositionCheck.omit({ matches: true });
  static readonly repairableCompositionObservation = Contracts.compositionObservation.extend({
    confirmedViolations: z.array(GenerationRepairContracts.violation),
  });
  static readonly attempt = z.object({
    revisionInstruction: z.string().optional(),
    slotTagRevision: z.number().int().positive().optional(),
    slotTargetSnapshot: CompositionContract.target.optional(),
    backgroundReviewVersion: z.literal('environment-background-v1').optional(),
    repairRootId: z.string().optional(),
    revisionOf: z.string().optional(),
    id: z.string(),
    master: z.string(),
    preview: z.string(),
    hashes: z.object({ master: z.string().length(64), preview: z.string().length(64) }).optional(),
    prompt: z.string(),
    model: z.string(),
    createdAt: z.string(),
    elapsedMs: z.number(),
    requestId: z.string().nullable(),
    usage: z.record(z.string(), z.unknown()).nullable(),
    review: Contracts.review.nullable(),
    reviewError: z.string().nullable(),
    compositionCheck: Contracts.compositionCheck.optional(),
    compositionCheckError: z.string().optional(),
    compositionCheckSkipped: z.literal('disabled-by-policy').optional(),
    reviewPrompt: z.string().optional(),
    generationInputManifest: Contracts.inputManifest.optional(),
    reviewInputManifest: Contracts.inputManifest.optional(),
    reviewSourceEvidence: KnowledgeContracts.evidence.optional(),
    evidence: StyleContracts.evidence.optional(),
    sourceEvidence: KnowledgeContracts.evidence.optional(),
  });
  static readonly card = Contracts.plannedCard.extend({
    slotTagEdits: z.array(SlotTagContracts.revision).min(1).optional(),
    generationFailures: z
      .array(
        z.object({
          at: z.string(),
          imageCall: z.number().int().positive(),
          phase: z.enum(['provider', 'image-storage']),
          error: z.string(),
        }),
      )
      .optional(),
    repairRequests: z.array(GenerationRepairContracts.request).optional(),
    id: z.string(),
    status: z.enum(['pending', 'generating', 'reviewing', 'done', 'failed']),
    attempts: z.array(Contracts.attempt),
    selectedAttemptId: z.string().nullable(),
    locked: z.boolean(),
    error: z.string().nullable(),
  });
  static readonly variant = z.object({
    gridReviewHistory: z.array(GenerationRepairContracts.setReview).optional(),
    gridRepairRounds: z.array(GenerationRepairContracts.round).optional(),
    id: z.string(),
    title: z.string(),
    concept: z.string(),
    artContract: SetContract.persistedArt.optional(),
    pilotAttemptId: z.string().optional(), // Archived evidence only; never an execution gate.
    planReview: SetContract.review.optional(),
    planValidation: z.literal('deterministic-slots-first-v1').optional(),
    planSignature: z.string().optional(),
    cards: z.array(Contracts.card),
    review: z.union([Contracts.detailedSetReview, Contracts.setReview]).nullable(),
    sourceEvidence: KnowledgeContracts.evidence.optional(),
    reviewedAttemptIds: z.array(z.string()).optional(),
    reviewSheet: z.string().optional(),
    reviewPrompt: z.string().optional(),
    reviewHistory: z
      .array(
        z.object({
          at: z.string(),
          sheet: z.string().optional(),
          prompt: z.string().optional(),
          attemptIds: z.array(z.string()),
          review: z.union([Contracts.detailedSetReview, Contracts.setReview]).nullable(),
          error: z.string().nullable(),
          sourceEvidence: KnowledgeContracts.evidence.optional(),
        }),
      )
      .optional(),
    reviewError: z.string().nullable(),
  });
  static readonly run = z.object({
    repairPolicy: GenerationRepairContracts.policy.optional(),
    providerHistory: z
      .array(
        z.object({
          from: z.enum(['openai', 'codex']),
          to: z.literal('codex'),
          at: z.string(),
          imageModel: z.string(),
          textModel: z.string(),
        }),
      )
      .optional(),
    id: z.string().uuid(),
    createdAt: z.string(),
    updatedAt: z.string(),
    brief: Contracts.brief,
    status: z.enum(['planning', 'generating', 'reviewing', 'completed', 'paused', 'failed']),
    stage: z.string(),
    imageCalls: z.number(),
    activities: z
      .array(
        z.object({
          key: z.string(),
          kind: z.enum([
            'references',
            'generation',
            'card-review',
            'set-references',
            'assembly',
            'set-review',
          ]),
          subject: z.string(),
          index: z.number().int().min(1),
          total: z.number().int().min(1),
          attempt: z.number().int().min(1).optional(),
        }),
      )
      .optional(),
    variants: z.array(Contracts.variant),
    imageModel: z.string(),
    textModel: z.string(),
    planningModel: z.string().min(2).max(100).optional(),
    provider: z.enum(['openai', 'codex']).default('openai'),
    events: z.array(z.object({ at: z.string(), message: z.string() })),
    selectedVariantId: z.string().nullable(),
    productionPolicy: StyleContracts.policy.optional(),
    sourceEvidence: KnowledgeContracts.evidence.optional(),
    workflowVersion: z.enum(['planned-pilot-v1', 'planned-set-v2']).optional(),
    planningPolicy: SetContract.planningPolicy.optional(),
    planningSessionStart: z.number().int().nonnegative().optional(),
    qualityWarnings: z.array(z.string()).optional(),
    compositionDraft: CompositionPlanningContracts.draft.optional(),
    planHistory: z
      .array(
        z.object({
          at: z.string(),
          plan: Contracts.plan,
          reviews: z.array(SetContract.review),
          validation: z.literal('deterministic-slots-first-v1').optional(),
          errors: z.array(z.string()),
          reviewError: z.string().optional(),
          compositionDraft: CompositionPlanningContracts.draft.optional(),
        }),
      )
      .optional(),
    reviewProtocol: z.enum(['set-v2', 'set-v3', 'composition-v1']).optional(),
    reviewProtocolHistory: z
      .array(
        z.object({
          from: z.enum(['set-v2', 'set-v3']).optional(),
          to: z.literal('composition-v1'),
          at: z.string(),
          reason: z.enum(['user-requested-resume', 'user-requested-regeneration']),
        }),
      )
      .optional(),
  });
  static readonly reference = z.object({
    id: z.string(),
    filename: z.string(),
    title: z.string(),
    category: z.enum(['1', '2', '3', '4', '5']),
    sha256: z.string(),
    source: z.string(),
  });
  static readonly profile = z.object({
    productionRunId: z.string().uuid().optional(),
    subjectUniqueness: z.literal('batch-unique-v1').optional(),
    id: z.string(),
    name: z.string(),
    rules: z.array(z.string()),
    categories: z.object({
      '1': z.string(),
      '2': z.string(),
      '3': z.string(),
      '4': z.string(),
      '5': z.string().optional(),
    }),
    references: z.array(Contracts.reference),
    library: z.array(StyleContracts.libraryItem).optional(),
    requirements: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          rules: z.array(z.string().min(1)),
          stages: z.array(z.enum(['planning', 'card', 'set-review'])).optional(),
        }),
      )
      .optional(),
    activeArtContract: SetContract.art.optional(),
    retrievalConfig: RetrievalConfiguration.schema.optional(),
    promptCatalog: z.record(z.string(), z.string()).optional(),
    knowledge: KnowledgeContracts.corpus.optional(),
    knowledgeContext: KnowledgeContracts.evidence.optional(),
    inputManifest: Contracts.inputManifest.optional(),
    reviewStyleThreshold: z.number().min(4).max(5).optional(),
    analysisModel: z.string().min(1).optional(),
    allowQualityWarnings: z.boolean().optional(),
    visualCatalog: VisualCatalogContracts.catalog.optional(),
    compositionState: z.unknown().optional(),
    compositionPlanning: CompositionPlanningContracts.configuration.optional(),
    contextOptimization: ContextOptimization.schema.optional(),
    referenceSelection: z.literal('catalogue-v1').optional(),
  });
  static readonly id = z.string().uuid();
  static readonly settings = z.object({
    ...GenerationRepairContracts.limits.shape,
    codexPath: z.string().max(1000).default(''),
    codexModel: z.enum(['gpt-6.1-sol', 'gpt-6.1-terra']).default('gpt-6.1-terra'),
    planningModel: z.enum(['gpt-6.1-sol', 'gpt-6.1-terra']).optional(),
  });
}

export type ArtDirectionRequest = z.infer<typeof Contracts.artDirectionRequest>;
export type ArtDirectionResult = z.infer<typeof Contracts.artDirectionResult>;
export type Brief = z.infer<typeof Contracts.brief>;
export type Plan = z.infer<typeof Contracts.plan>;
export type Card = z.infer<typeof Contracts.card>;
export type Attempt = z.infer<typeof Contracts.attempt>;
export type Variant = z.infer<typeof Contracts.variant>;
export type Run = z.infer<typeof Contracts.run>;
export type Review = z.infer<typeof Contracts.review>;
export type SetReview = z.infer<typeof Contracts.setReview> | z.infer<typeof Contracts.detailedSetReview>;
export type Profile = z.infer<typeof Contracts.profile>;
export type Settings = z.infer<typeof Contracts.settings>;
export type Bootstrap = {
  catalogReady?: boolean;
  catalogState?: import('./CatalogState').CatalogState;
  styleRules: StyleRuleSettings;
  runs: Run[];
  profile: Profile;
  settings: Settings;
  codexReady: boolean;
  referenceCount: number;
  dataPath: string;
  productionPolicy: ProductionPolicy;
  library: LibraryItem[];
};
export interface StudioApi {
  getRunProfile(runId: string): Promise<Profile>;
  getKnowledge(): Promise<import('./KnowledgeEditorContracts').KnowledgeSnapshot>;
  saveKnowledge(edit: import('./KnowledgeEditorContracts').KnowledgeEdit): Promise<void>;
  removeKnowledge(kind: import('./KnowledgeEditorContracts').KnowledgeKind, id: string): Promise<void>;
  importKnowledge(
    input: import('zod').z.infer<typeof import('./KnowledgeEditorContracts').KnowledgeEditorContracts.import>,
  ): Promise<string | null>;
  getCatalogStatus(): Promise<import('./CatalogState').CatalogState>;
  importReference(): Promise<LibraryItem | null>;
  editReference(input: import('./StyleContracts').ReferenceEdit): Promise<void>;
  analyzeReference(id: string): Promise<import('./StyleContracts').ReferenceMetadata>;
  saveStyleRules(input: StyleRuleEdit): Promise<StyleRuleSettings>;
  suggestArtDirection(request: ArtDirectionRequest): Promise<ArtDirectionResult>;
  saveProductionPolicy(policy: ProductionPolicy): Promise<void>;
  approveReference(runId: string, cardId: string): Promise<void>;
  removeReference(id: string): Promise<void>;
  deleteRun(id: string): Promise<void>;
  setLanguage(locale: 'en' | 'ru'): Promise<void>;
  getSystemLanguages(): Promise<string[]>;
  setAppearance(theme: 'dark' | 'light'): Promise<void>;
  bootstrap(): Promise<Bootstrap>;
  start(brief: Brief): Promise<Run>;
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  retry(runId: string, cardId: string, instruction: string): Promise<void>;
  selectAttempt(runId: string, cardId: string, attemptId: string): Promise<void>;
  lock(runId: string, cardId: string, locked: boolean): Promise<void>;
  selectVariant(runId: string, variantId: string): Promise<void>;
  setBudget(runId: string, maximum: number): Promise<void>;
  setSlotTags(runId: string, cardId: string, edit: SlotTagEdit): Promise<void>;
  previewDelivery(runId: string, variantId: string): Promise<import('./DeliveryContracts').DeliveryPreview[]>;
  exportDeliveryPreview(
    runId: string,
    variantId: string,
    preview: import('./DeliveryContracts').DeliveryPreview,
  ): Promise<string | null>;
  exportDiagnostics(runId: string): Promise<string | null>;
  exportExecutionLog(runId: string): Promise<string | null>;
  exportRun(runId: string, variantId: string): Promise<string | null>;
  saveSettings(settings: Settings): Promise<void>;
  checkConnection(): Promise<{ ok: boolean; message: string }>;
  onRun(callback: (run: Run) => void): () => void;
}
