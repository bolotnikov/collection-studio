import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Contracts } from '../src/shared/Contracts';
import { CompositionPlanningContracts } from '../src/shared/CompositionPlanningContracts';
import { ContextOptimization } from '../src/shared/ContextOptimization';
import { StyleContracts } from '../src/shared/StyleContracts';
import { VisualCatalogContracts } from '../src/shared/VisualCatalogContracts';
import { KnowledgeContracts } from '../src/shared/KnowledgeContracts';
import { AggregateCompositionPlanner } from '../src/domain/AggregateCompositionPlanner';
import { CompositionPlanCompiler } from '../src/domain/CompositionPlanCompiler';
import { SetComposition } from '../src/domain/SetComposition';
import { GenerationContentPolicy } from '../src/application/GenerationContentPolicy';
import { GenerationRequestBuilder } from '../src/application/GenerationRequestBuilder';
import { SlotPlanningReferences } from '../src/application/SlotPlanningReferences';
import { PromptCatalog } from '../src/application/prompts/PromptCatalog';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { CodexStylePreparation } from '../src/infrastructure/style/CodexStylePreparation';
import { CodexSourceContext } from '../src/infrastructure/style/CodexSourceContext';

/** The audit must fail before any model process can be started. */
class OfflineRunner extends CodexRunner {
  calls = 0;
  override async run<T>(): Promise<{
    value: T;
    folder: string;
    usage: Record<string, unknown> | null;
    threadId: string | null;
  }> {
    this.calls++;
    throw new Error('Model calls are forbidden in the slot input audit.');
  }
}

const storage = path.join(os.homedir(), 'Library/Application Support/collection-studio');
const runId = process.argv[2] ? Contracts.id.parse(process.argv[2]) : undefined;
const base = Contracts.profile.parse(
  JSON.parse(
    await fs.readFile(
      runId
        ? path.join(storage, 'runs', runId, 'style-profile.json')
        : path.resolve('resources/style-profile.json'),
      'utf8',
    ),
  ),
);
if (!runId) {
  base.visualCatalog = VisualCatalogContracts.catalog.parse(
    JSON.parse(await fs.readFile('resources/knowledge/visual-catalog.json', 'utf8')),
  );
  const bundled = StyleContracts.libraryItem
    .array()
    .parse(JSON.parse(await fs.readFile('resources/library.json', 'utf8')));
  base.library = bundled.map((item) => {
    const analyzed = base.visualCatalog?.cards.find(
      (card) => card.id === item.id && card.sha256 === item.sha256,
    );
    if (!analyzed) throw new Error('Bundled catalogue/library identity mismatch.');
    return { ...item, category: analyzed.observation.category, observation: analyzed.observation };
  });
  base.knowledge = KnowledgeContracts.corpus.parse(
    JSON.parse(await fs.readFile('resources/knowledge/catalog.json', 'utf8')),
  );
}
const catalog = base.visualCatalog;
const library = base.library;
const weights = CompositionPlanningContracts.defaults.aggregation;
if (!catalog || !library || !weights) throw new Error('A prepared visual catalogue is required.');
const output = path.resolve('output/slot-input-audit');
await fs.mkdir(output, { recursive: true });
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-slot-audit-'));
const runner = new OfflineRunner('/offline-worker-forbidden', temporary, 'offline-audit');
const referenceRoot = path.join(storage, 'reference-library');
const originals = library.filter((item) => item.origin === 'anchor' && item.approved).map((item) => item.id);
const records = [];
try {
  for (const includeGold of [false, true]) {
    const slots = new AggregateCompositionPlanner(weights, originals).planSlots(
      catalog,
      includeGold,
      `offline-input-audit/${includeGold}`,
    );
    const scoped = GenerationContentPolicy.apply(base, StyleContracts.policy.parse({}), includeGold);
    const profile = {
      ...scoped.profile,
      compositionPlanning: CompositionPlanningContracts.defaults,
      contextOptimization: ContextOptimization.defaults,
      referenceSelection: 'catalogue-v1' as const,
      promptCatalog: new PromptCatalog().values,
      allowQualityWarnings: true,
    };
    const blueprint = {
      title: 'OFFLINE INPUT AUDIT',
      concept: 'Synthetic slot-binding fixtures, not a generated artistic concept.',
      composition: slots.composition,
      slots: slots.slots.map((slot) => ({
        ...slot,
        subject: {
          id: `fixture-${slot.index}`,
          subject: `OFFLINE fixture ${slot.index}`,
          role: 'Synthetic audit role',
          materials:
            catalog.cards.find((item) => item.id === slot.sourceCardId)?.observation.facets.materials ?? [],
          silhouette: 'Synthetic audit shape',
          characterCount: slot.target.required.characterCount ?? 0,
          compatibleCategories: [slot.target.category],
        },
      })),
    };
    const plan = CompositionPlanCompiler.compile(
      [blueprint],
      {
        variants: [
          {
            variantIndex: 0,
            paletteRhythm: 'Synthetic audit colors; no art direction is being evaluated.',
            cards: blueprint.slots.map((slot) => ({
              index: slot.index,
              description: 'Synthetic offline input validation fixture.',
              composition: JSON.stringify(slot.target.required),
              paletteRole: 'Synthetic audit contrast',
            })),
          },
        ],
      },
      profile,
    );
    SetComposition.validate(plan, catalog, originals);
    const proposed = plan.variants[0];
    if (!proposed) throw new Error('Missing offline plan');
    const variant = Contracts.variant.parse({
      ...proposed,
      id: 'offline-variant',
      review: null,
      reviewError: null,
      cards: proposed.cards.map((card, index) => ({
        ...card,
        id: `fixture-${index}`,
        status: 'pending',
        attempts: [],
        selectedAttemptId: null,
        locked: false,
        error: null,
      })),
    });
    const brief = Contracts.brief.parse({
      theme: 'OFFLINE INPUT AUDIT',
      wishes: 'Synthetic fixtures only; no image generation.',
      variants: 1,
      quality: 'low',
      maxImageCalls: 10,
      autoRepair: true,
      includeGold,
    });
    const preparation = new CodexStylePreparation(
      runner,
      library,
      referenceRoot,
      temporary,
      'offline-audit',
      scoped.policy ?? StyleContracts.policy.parse({}),
      new PromptCatalog(),
      undefined,
      profile.categories,
    );
    const source = new CodexSourceContext(
      runner,
      runId ? path.join(storage, 'knowledge-assets') : path.resolve('resources/knowledge'),
      temporary,
      'offline-audit',
      new PromptCatalog(),
    );
    const planningInputs = SlotPlanningReferences.select(referenceRoot, profile, [slots], []);
    for (const card of variant.cards) {
      const target = SetComposition.target(variant, card);
      if (!target?.selectedReferenceIds) throw new Error('Missing frozen references');
      const context = await source.prepare('card', brief, profile, variant, card);
      const supplied = { ...context.profile, activeArtContract: variant.artContract };
      const prepared = await preparation.prepare(brief, card, variant, supplied);
      const actual = prepared.evidence.references.map((item) => item.id);
      if (JSON.stringify(actual) !== JSON.stringify(target.selectedReferenceIds))
        throw new Error('Frozen reference identity/order changed.');
      if (prepared.references.some((file) => !planningInputs.includes(file)))
        throw new Error('Generation added an unplanned card reference.');
      const request = new GenerationRequestBuilder().build({
        prompt: prepared.prompt,
        profile: supplied,
        brief,
        card,
        prepared,
        references: prepared.references,
        sourceContext: context,
        instruction: '',
      });
      if (
        context.evidence.images.some(
          (image) => image.attached && image.role === 'category-example' && image.category !== card.category,
        )
      )
        throw new Error('Unrelated category figure attached.');
      records.push({
        includeGold,
        index: target.index,
        category: card.category,
        required: target.required,
        candidates: target.referenceIds,
        selected: actual,
        manifest: request.generationManifest,
        attachments: request.references,
        prompt: request.prompt,
      });
    }
  }
  await fs.writeFile(path.join(output, 'requests.json'), JSON.stringify(records, null, 2));
  const report = {
    mode: 'offline-synthetic-input-audit',
    sourceSetCount: catalog.sets.length,
    libraryCards: library.length,
    checkedSlots: records.length,
    modelCalls: runner.calls,
    imageCalls: 0,
    checks: [
      'ordinary and gold mode',
      'joint category/facet constraints',
      'frozen exact reference IDs and order',
      'reference SHA-256 integrity',
      'no unplanned card reference',
      'only the applicable category figure',
      'numbered generation manifests',
    ],
    limits: ['Synthetic subjects; does not validate semantic subject quality or generated artwork.'],
  };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
