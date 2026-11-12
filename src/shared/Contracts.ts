import type { StyleRuleSettings, StyleRuleEdit } from './StyleRuleContracts';
import { RetrievalConfiguration } from './RetrievalConfiguration';
import { SetContract } from './SetContract';
import { KnowledgeContracts } from './KnowledgeContracts';
import { StyleContracts, type ProductionPolicy, type LibraryItem } from './StyleContracts';
import { z } from 'zod';

export class Contracts {
  static readonly inputManifest = z.array(
    z.object({
      image: z.number().int().positive(),
      role: z.string().min(1),
      id: z.string().optional(),
      category: z.string().nullable().optional(),
      take: z.string().optional(),
      ignore: z.string().optional(),
    }),
  );
  static readonly artDirectionRequest = z.object({
    theme: z.string().trim().min(2).max(180),
    wishes: z.string().max(3000),
  });
  static readonly artDirectionResult = z.object({ text: z.string().trim().min(10).max(600) });
  static readonly brief = z.object({
    theme: z.string().trim().min(2).max(180),
    wishes: z.string().max(3000),
    variants: z.number().int().min(1).max(5).default(1),
    quality: z.enum(['low', 'medium', 'high']),
    maxImageCalls: z.number().int().min(1).max(150),
    autoRepair: z.boolean(),
  });
  static readonly plannedCard = z.object({
    subject: z.string().min(2),
    description: z.string().min(10),
    category: z.enum(['1', '2', '3', '4']),
    role: z.string().min(3),
    visual: SetContract.visual.optional(),
  });
  static readonly plan = z.object({
    variants: z.array(
      z.object({
        title: z.string(),
        concept: z.string(),
        artContract: SetContract.art.optional(),
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
  static readonly attempt = z.object({
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
    reviewPrompt: z.string().optional(),
    reviewInputManifest: Contracts.inputManifest.optional(),
    reviewSourceEvidence: KnowledgeContracts.evidence.optional(),
    evidence: StyleContracts.evidence.optional(),
    sourceEvidence: KnowledgeContracts.evidence.optional(),
  });
  static readonly card = Contracts.plannedCard.extend({
    id: z.string(),
    status: z.enum(['pending', 'generating', 'reviewing', 'done', 'failed']),
    attempts: z.array(Contracts.attempt),
    selectedAttemptId: z.string().nullable(),
    locked: z.boolean(),
    error: z.string().nullable(),
  });
  static readonly variant = z.object({
    id: z.string(),
    title: z.string(),
    concept: z.string(),
    artContract: SetContract.art.optional(),
    planReview: SetContract.review.optional(),
    planSignature: z.string().optional(),
    pilotAttemptId: z.string().optional(),
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
    id: z.string().uuid(),
    createdAt: z.string(),
    updatedAt: z.string(),
    brief: Contracts.brief,
    status: z.enum(['planning', 'generating', 'reviewing', 'completed', 'paused', 'failed']),
    stage: z.string(),
    imageCalls: z.number(),
    variants: z.array(Contracts.variant),
    imageModel: z.string(),
    textModel: z.string(),
    provider: z.enum(['openai', 'codex']).default('openai'),
    events: z.array(z.object({ at: z.string(), message: z.string() })),
    selectedVariantId: z.string().nullable(),
    productionPolicy: StyleContracts.policy.optional(),
    sourceEvidence: KnowledgeContracts.evidence.optional(),
    workflowVersion: z.literal('planned-pilot-v1').optional(),
    planningPolicy: SetContract.planningPolicy.optional(),
    planHistory: z
      .array(
        z.object({
          at: z.string(),
          plan: Contracts.plan,
          reviews: z.array(SetContract.review),
          errors: z.array(z.string()),
        }),
      )
      .optional(),
    reviewProtocol: z.enum(['set-v2', 'set-v3']).optional(),
  });
  static readonly reference = z.object({
    id: z.string(),
    filename: z.string(),
    title: z.string(),
    category: z.enum(['1', '2', '3', '4']),
    sha256: z.string(),
    source: z.string(),
  });
  static readonly profile = z.object({
    id: z.string(),
    name: z.string(),
    rules: z.array(z.string()),
    categories: z.object({ '1': z.string(), '2': z.string(), '3': z.string(), '4': z.string() }),
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
  });
  static readonly id = z.string().uuid();
  static readonly settings = z.object({
    provider: z.enum(['openai', 'codex']).default('codex'),
    imageModel: z.string().min(2).max(100),
    textModel: z.string().min(2).max(100),
    codexPath: z.string().max(1000).default(''),
    codexModel: z.string().min(2).max(100).default('gpt-6.1-sol'),
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
  styleRules: StyleRuleSettings;
  runs: Run[];
  profile: Profile;
  settings: Settings;
  hasKey: boolean;
  codexReady: boolean;
  referenceCount: number;
  dataPath: string;
  productionPolicy: ProductionPolicy;
  library: LibraryItem[];
};
export interface StudioApi {
  importReference(): Promise<LibraryItem | null>;
  editReference(input: import('./StyleContracts').ReferenceEdit): Promise<void>;
  analyzeReference(id: string): Promise<import('./StyleContracts').ReferenceMetadata>;
  saveStyleRules(input: StyleRuleEdit): Promise<StyleRuleSettings>;
  suggestArtDirection(request: ArtDirectionRequest): Promise<ArtDirectionResult>;
  saveProductionPolicy(policy: ProductionPolicy): Promise<void>;
  approveReference(runId: string, cardId: string): Promise<void>;
  removeReference(id: string): Promise<void>;
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
  exportRun(runId: string, variantId: string): Promise<string | null>;
  saveSettings(settings: Settings, key: string): Promise<void>;
  checkConnection(): Promise<{ ok: boolean; message: string }>;
  onRun(callback: (run: Run) => void): () => void;
}
