import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Contracts } from '../src/shared/Contracts';
import {
  KnowledgeContracts,
  type KnowledgeAnalysis,
  type SourceKnowledge,
} from '../src/shared/KnowledgeContracts';
import { StyleContracts, type LibraryItem } from '../src/shared/StyleContracts';
import { StyleRuleContracts } from '../src/shared/StyleRuleContracts';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { CodexSourceContext } from '../src/infrastructure/style/CodexSourceContext';
import { CodexStylePreparation } from '../src/infrastructure/style/CodexStylePreparation';
import { ReferenceImagePacker } from '../src/infrastructure/ReferenceImagePacker';
import { PromptBuilder } from '../src/application/PromptBuilder';
import { GenerationRequestBuilder } from '../src/application/GenerationRequestBuilder';
import { PromptCatalog } from '../src/application/prompts/PromptCatalog';
import { ProductionRules } from '../src/domain/ProductionRules';

/** Offline capture only. No worker is started and no provider or network client exists here. */
class OfflineAuditRunner extends CodexRunner {
  private sequence = 0;
  readonly calls: Array<{ kind: string; attachmentCount: number }> = [];
  constructor(
    private readonly output: string,
    private readonly library: LibraryItem[],
    private readonly sources: SourceKnowledge,
    private readonly observations: Map<string, KnowledgeAnalysis>,
  ) {
    super('/offline-worker-forbidden', output, 'offline-audit');
  }
  override async run<T>(prompt: string, schema: z.ZodType<T>, images: string[] = [], generateImage = false) {
    if (generateImage) throw new Error('Image generation is forbidden in the offline audit.');
    let value: unknown, kind: string;
    if (prompt.startsWith('ROLE: Source collection')) {
      kind = 'archived-source-observation-replay';
      value = {
        entries: images.map((file) => {
          const source = this.sources.images.find(
            (image) => path.basename(image.filename) === path.basename(file),
          );
          const analysis = source ? this.observations.get(source.id) : undefined;
          if (!source || !analysis) throw new Error('Archived source observation missing.');
          return { id: source.id, analysis };
        }),
      };
    } else if (prompt.startsWith('ROLE: Set reference curator.')) {
      kind = 'deterministic-set-selection-fixture';
      const marker = 'Candidate analyses=';
      const raw = prompt.slice(prompt.indexOf(marker) + marker.length).split('. Only listed IDs')[0];
      if (!raw) throw new Error('Cannot decode curator candidates.');
      const candidates = z.array(z.object({ id: z.string() })).parse(JSON.parse(raw));
      const choices = candidates
        .filter((item) =>
          this.sources.cleanSets?.some((sheet) => sheet.sourceImageId === item.id && sheet.primaryEligible),
        )
        .slice(0, 2);
      if (choices.length !== 2) throw new Error('Two ordinary clean sources are required.');
      value = {
        selections: choices.map((item) => ({
          id: item.id,
          reason: 'Offline transport fixture; not an artistic selection verdict.',
        })),
        guidance: 'Offline capture using archived visual observations. No model quality judgment was made.',
      };
    } else if (prompt.startsWith('ROLE: Producer brief analyst.')) {
      kind = 'deterministic-brief-fixture';
      value = {
        direction: 'Detective cinema props, one coherent investigation.',
        retrievalTerms: ['detective', 'wood', 'glass', 'metal'],
        requirements: [],
      };
    } else if (prompt.startsWith('ROLE: Reference selector and art director.')) {
      kind = 'deterministic-visual-ranking-fixture';
      value = {
        selections: images.map((file) => {
          const item = this.library.find((item) => item.filename === path.basename(file));
          if (!item) throw new Error('Unknown visual candidate.');
          return {
            id: item.id,
            reason: 'Offline fixture preserves candidate order; no visual judgment.',
            role: 'rendering reference',
            take: 'Original painted rendering and material cues.',
            ignore: 'Subject identity, screenshot UI and exact arrangement.',
          };
        }),
        visualDirection: 'Use the canonical rendering rules and accepted card brief.',
        materialGuidance: 'Follow the planned simplified material treatment.',
        compositionGuidance: 'Follow only the assigned category and planned composition.',
        pitfalls: ['Do not copy original subjects or interface chrome.'],
      };
    } else throw new Error('Unexpected model task blocked by offline audit.');
    const decoded = schema.parse(value);
    this.calls.push({ kind, attachmentCount: images.length });
    await fs.writeFile(
      path.join(this.output, `${String(++this.sequence).padStart(2, '0')}-${kind}.json`),
      JSON.stringify(
        { mode: 'offline-fixture-or-archived-replay', prompt, attachments: images, result: decoded },
        null,
        2,
      ),
    );
    return { value: decoded, folder: this.output, usage: null, threadId: null };
  }
}

const resources = path.resolve('resources');
const storage = path.join(os.homedir(), 'Library/Application Support/collection-studio');
const outputRoot = path.resolve('output/pipeline-audit');
const output = path.join(outputRoot, `capture-${Date.now()}`);
await fs.mkdir(output, { recursive: true });
const read = async (file: string, fallback?: unknown): Promise<unknown> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (fallback !== undefined && error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return fallback;
    throw error;
  }
};
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const model = Contracts.settings.parse(await read(path.join(storage, 'settings.json'))).codexModel;
const profile = Contracts.profile.parse(await read(path.join(resources, 'style-profile.json')));
const style = StyleRuleContracts.settings.parse(
  await read(path.join(storage, 'style-rules.json'), {
    version: 1,
    rendering: profile.rules,
    categories: profile.categories,
  }),
);
const policy = StyleContracts.policy.parse(await read(path.join(storage, 'production-policy.json'), {}));
const corpus = KnowledgeContracts.corpus.parse(await read(path.join(resources, 'knowledge/catalog.json')));
const bundled = StyleContracts.libraryItem.array().parse(await read(path.join(resources, 'library.json')));
const users = StyleContracts.libraryItem
  .array()
  .parse(await read(path.join(storage, 'user-library.json'), []));
const metadata = z
  .record(z.string(), StyleContracts.referenceMetadata)
  .parse(await read(path.join(storage, 'reference-metadata.json'), {}));
const library = [...bundled, ...users.filter((item) => item.approved)].map((item) => ({
  ...item,
  metadata: metadata[item.id] ?? item.metadata,
}));
const referenceRoot = path.join(storage, 'reference-library');
const knowledgeRoot = path.join(resources, 'knowledge');
for (const item of library)
  if (hash(await fs.readFile(path.join(referenceRoot, item.filename))) !== item.sha256)
    throw new Error('Reference hash mismatch.');
for (const item of corpus.images)
  if (hash(await fs.readFile(path.join(knowledgeRoot, item.filename))) !== item.sha256)
    throw new Error('Context image hash mismatch.');
for (const sheet of corpus.cleanSets ?? []) {
  if (hash(await fs.readFile(path.join(knowledgeRoot, sheet.filename))) !== sheet.sha256)
    throw new Error('Clean reference hash mismatch.');
  for (const card of sheet.cards) {
    const original = library.find((item) => item.id === card.id);
    if (!original || original.sha256 !== card.sha256 || original.filename !== card.filename)
      throw new Error('Clean reference membership does not match the original library.');
  }
}
const snapshots = [];
for (const name of await fs.readdir(path.join(storage, 'runs'))) {
  if (!Contracts.id.safeParse(name).success) continue;
  snapshots.push(Contracts.run.parse(await read(path.join(storage, 'runs', name, 'run.json'))));
}
const requestedRun = process.argv.find((value) => value.startsWith('--run='))?.slice('--run='.length);
if (requestedRun && !Contracts.id.safeParse(requestedRun).success) throw new Error('Invalid audit run ID.');
const latest = snapshots
  .filter((run) => (!requestedRun || run.id === requestedRun) && run.variants[0]?.cards.length === 10)
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
const previousSet = latest?.variants[0];
if (!latest || !previousSet || previousSet.cards.length !== 10)
  throw new Error('A historical ten-card plan is required for the offline capture.');
const variant = structuredClone(previousSet);
const allocation = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
for (const card of variant.cards) allocation[card.category]++;
// The contract is an explicit audit fixture, never represented as an accepted model plan.
variant.artContract ??= {
  version: 'set-contract-v1',
  story: variant.concept,
  categoryAllocation: allocation,
  rendering: style.rendering.join(' '),
  lighting: 'Soft directional light and broad highlights consistent with the originals.',
  materialTreatment: 'Readable simplified wood, metal, glass and fabric.',
  paletteRhythm: 'Varied saturated complementary accents with readable subject contrast.',
  compositionRhythm: 'Use all four categories with varied silhouettes and environmental depth.',
  avoid: ['People, text and interface chrome.'],
  pilotIndex: 0,
  pilotRationale: 'Offline fixture only; no pilot was generated or approved.',
};
for (const card of variant.cards)
  card.visual ??= {
    materials: ['Follow the illustrated subject material.'],
    silhouette: 'Preserve the full recognizable subject silhouette.',
    paletteRole: 'Separate subject and background with controlled contrast.',
    composition:
      card.category === '5' ? 'Character narrative in environment' : style.categories[card.category],
  };
ProductionRules.validatePlan({ variants: [variant] }, 1);
const prompts = new PromptCatalog(await read(path.join(resources, 'prompts/production.json')));
const active = Contracts.profile.parse({
  ...profile,
  categories: style.categories,
  rules: [...new Set([...style.rendering, ...policy.rules])],
  library,
  requirements: await read(path.join(resources, 'production-requirements.json')),
  knowledge: corpus,
  promptCatalog: prompts.values,
  reviewStyleThreshold: policy.styleThreshold,
  analysisModel: model,
});
const brief = { ...latest.brief, variants: 1 };
const isolatedCache = path.join(output, 'isolated-cache');
await fs.mkdir(isolatedCache, { recursive: true });
await fs.cp(path.join(storage, 'reference-analysis'), path.join(isolatedCache, 'references'), {
  recursive: true,
});
const observations = new Map<string, KnowledgeAnalysis>();
const ruleHashes = corpus.documents
  .filter((document) => ['composition-rules', 'collection-structure'].includes(document.role))
  .map((document) => document.sha256)
  .join(':');
for (const image of corpus.images.filter((image) => image.role !== 'delivery-template')) {
  const file = path.join(
    storage,
    'source-analysis',
    hash(`sets-v1:${model}:${ruleHashes}:${image.sha256}`) + '.json',
  );
  observations.set(image.id, KnowledgeContracts.analysis.parse(await read(file)));
}
const runner = new OfflineAuditRunner(output, library, corpus, observations);
const source = new CodexSourceContext(
  runner,
  knowledgeRoot,
  path.join(isolatedCache, 'source-replay'),
  model,
  prompts,
);
const preparation = new CodexStylePreparation(
  runner,
  library,
  referenceRoot,
  path.join(isolatedCache, 'references'),
  model,
  policy,
  prompts,
  active.retrievalConfig,
  active.categories,
);
const planning = await source.prepare('planning', brief, active);
await fs.writeFile(path.join(output, 'planning.txt'), PromptBuilder.planning(brief, planning.profile));
await fs.writeFile(
  path.join(output, 'plan-review.txt'),
  PromptBuilder.planReview(brief, variant, planning.profile),
);
const packets = [];
for (const [index, card] of variant.cards.entries()) {
  const context = await source.prepare('card', brief, active, variant, card);
  const prepared = await preparation.prepare(brief, card, variant, context.profile);
  const request = new GenerationRequestBuilder().build({
    prompt: prepared.prompt,
    profile: context.profile,
    brief,
    card,
    references: prepared.references,
    prepared,
    sourceContext: context,
    instruction: '',
  });
  if (
    context.referencePaths.length !== 1 ||
    context.evidence.images
      .filter((image) => image.attached)
      .some((image) => image.category !== card.category)
  )
    throw new Error('Unrelated composition attachment.');
  if (
    prepared.evidence.references.filter(
      (reference) => reference.origin === 'anchor' && reference.category === card.category,
    ).length < 2
  )
    throw new Error('Category reference coverage missing.');
  for (const category of ['1', '2', '3', '4'] as const)
    if (category !== card.category && request.prompt.includes(active.categories[category]))
      throw new Error('Unrelated category definition in generation prompt.');
  for (const marker of ['Тип блока:', 'СОДЕРЖИМОЕ БЛОКА', 'Название на доске:', 'https://miro.com/'])
    if (request.prompt.includes(marker))
      throw new Error('Export/provenance metadata leaked into generation prompt.');
  const folder = path.join(output, `card-${String(index + 1).padStart(2, '0')}`);
  await fs.mkdir(folder, { recursive: true });
  const packing = await new ReferenceImagePacker(prompts).pack(request.references, folder);
  const worker = prompts.render('CodexRunner.run', {
    taskMode: prompts.render('worker.image', { outputPath: path.join(folder, 'NOT-GENERATED.png') }),
    prompt: prompts.render('CodexProvider.image', { prompt: request.prompt, quality: brief.quality }),
    referenceMapping: packing.instruction,
    attachmentPaths: JSON.stringify(packing.paths),
    attachmentInstructions: prompts.render('worker.imageAttachments'),
  });
  await fs.writeFile(path.join(folder, 'generation-worker.txt'), worker);
  await fs.writeFile(
    path.join(folder, 'card-review.txt'),
    PromptBuilder.cardReview(
      card,
      { ...context.profile, activeArtContract: variant.artContract, inputManifest: request.reviewManifest },
      brief,
    ),
  );
  const packet = {
    subject: card.subject,
    category: card.category,
    promptChars: request.prompt.length,
    originalInputs: request.references.length,
    packedInputs: packing.paths.length,
    originalReferences: prepared.evidence.references.length,
    reviewInputCount: (request.reviewManifest ?? []).length,
    hashes: await Promise.all(
      request.references.map(async (file) => ({
        filename: path.basename(file),
        sha256: hash(await fs.readFile(file)),
      })),
    ),
  };
  await fs.writeFile(
    path.join(folder, 'packet.json'),
    JSON.stringify(
      { ...packet, mode: 'offline-fixture', artisticValidation: false, evidence: prepared.evidence },
      null,
      2,
    ),
  );
  packets.push(packet);
}
const finalContext = await source.prepare('set-review', brief, active, variant);
await fs.writeFile(
  path.join(output, 'set-review.txt'),
  PromptBuilder.setReview(
    variant,
    { ...finalContext.profile, activeArtContract: variant.artContract },
    brief,
  ),
);
const catalog = await preparation.catalog();
const report = {
  artifactDirectory: output,
  eligibleReferences: catalog.filter((item) => !item.tags.includes('exclude:ordinary-card-generation'))
    .length,
  manualMetadataRecords: Object.keys(metadata).length,
  mode: 'offline-no-generation-no-model-calls',
  sourceCards: library.length,
  contextualImages: corpus.images.length,
  cleanSets: corpus.cleanSets?.length,
  primarySets: corpus.cleanSets?.filter((sheet) => sheet.primaryEligible).length,
  archivedSourceObservations: observations.size,
  categories: allocation,
  packets,
  finalReview: {
    primaryCleanSheets: finalContext.evidence.cleanSets?.length,
    contextInputs: finalContext.referencePaths.length,
    candidateGenerated: false,
  },
  localReplays: runner.calls,
  modelCalls: 0,
  generatedImages: 0,
  limits: [
    'Archived observations are replayed into an isolated audit cache.',
    'Brief interpretation, set selection and visual reranking are deterministic fixtures, not model quality judgments.',
    'The shared contract is an offline fixture around a historical subject plan.',
    'No new pilot or complete set was generated or artistically accepted.',
  ],
};
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
await fs.writeFile(path.join(outputRoot, 'report.json'), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    mode: report.mode,
    sourceCards: report.sourceCards,
    contextualImages: report.contextualImages,
    cleanSets: report.cleanSets,
    packets: packets.length,
    modelCalls: 0,
    generatedImages: 0,
    report: path.join(outputRoot, 'report.json'),
  }),
);
