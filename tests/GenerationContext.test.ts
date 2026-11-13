import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GenerationRequestBuilder } from '../src/application/GenerationRequestBuilder';
import { PromptBuilder } from '../src/application/PromptBuilder';
import { PromptCatalog } from '../src/application/prompts/PromptCatalog';
import { Contracts } from '../src/shared/Contracts';
import { KnowledgeContracts } from '../src/shared/KnowledgeContracts';
import { CodexProvider } from '../src/infrastructure/CodexProvider';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import defaults from '../resources/prompts/production.json';
import requirements from '../resources/production-requirements.json';
import baseProfile from '../resources/style-profile.json';
import { CardProductionService } from '../src/application/CardProductionService';
import { ProductionContext } from '../src/application/ProductionContext';
import type { GenerationPort } from '../src/application/GenerationPort';
import type { ActiveRun } from '../src/application/ActiveRun';
import { StyleContracts } from '../src/shared/StyleContracts';

const folders: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});
function fixture() {
  const profile = Contracts.profile.parse({ ...baseProfile, requirements, promptCatalog: defaults });
  const brief = Contracts.brief.parse({
    theme: 'Detective desk',
    wishes: 'Use frosted glass.',
    quality: 'high',
    maxImageCalls: 30,
    autoRepair: true,
  });
  const card = Contracts.card.parse({
    id: 'card',
    subject: 'Magnifier',
    description: 'A wooden magnifier with frosted glass.',
    role: 'Examine clues',
    category: '1',
    status: 'pending',
    attempts: [],
    selectedAttemptId: null,
    locked: false,
    error: null,
    visual: {
      materials: ['matte wood', 'frosted glass'],
      silhouette: 'Round lens and short handle',
      paletteRole: 'Amber wood against blue',
      composition: 'Three-quarter view, upper center, floating',
    },
  });
  const variant = Contracts.variant.parse({
    id: 'set',
    title: 'Detective desk',
    concept: 'Connected investigation tools',
    cards: [card],
    review: null,
    reviewError: null,
  });
  return { profile, brief, card, variant };
}
it('carries the canonical requirements without a knowledge corpus through planning, generation and reviews', () => {
  const f = fixture();
  const prompts = [
    { stage: 'planning', text: PromptBuilder.planning(f.brief, f.profile) },
    { stage: 'planning', text: PromptBuilder.planReview(f.brief, f.variant, f.profile) },
    { stage: 'card', text: PromptBuilder.build(f.card, f.variant, f.profile) },
    { stage: 'card', text: PromptBuilder.cardReview(f.card, f.profile, f.brief) },
    { stage: 'set-review', text: PromptBuilder.setReview(f.variant, f.profile, f.brief) },
  ];
  for (const prompt of prompts)
    for (const section of f.profile.requirements ?? [])
      if (!section.stages || section.stages.some((stage) => stage === prompt.stage))
        for (const rule of section.rules) expect(prompt.text).toContain(rule);
  const review = PromptBuilder.cardReview(f.card, f.profile, f.brief);
  expect(review).toContain(f.card.visual?.composition);
  expect(review).toContain('frosted glass');
});
it('numbers art, composition diagram and previous candidate in exactly the provider input order', () => {
  const f = fixture();
  const evidence = KnowledgeContracts.evidence.parse({
    version: 1,
    stage: 'card',
    model: 'fixture',
    createdAt: 'fixture',
    documents: [],
    guidance: '',
    images: [
      {
        id: 'diagram',
        filename: 'diagram.png',
        title: 'Floating diagram',
        source: 'fixture',
        sha256: 'a'.repeat(64),
        role: 'category-example',
        category: '1',
        attached: true,
        reason: 'category',
        analysis: {
          summary: 'Floating object',
          theme: '',
          semanticPrinciples: [],
          visualPrinciples: [],
          objectRoles: [],
          avoidTransferring: [],
          ordinarySetExample: false,
        },
      },
    ],
  });
  const originals = f.profile.references.slice(0, 2).map((ref) => `/art/${ref.filename}`);
  const request = new GenerationRequestBuilder().build({
    ...f,
    references: originals,
    instruction: 'Repair the handle only.',
    prompt: PromptBuilder.build(f.card, f.variant, f.profile),
    sourceContext: { profile: f.profile, evidence, referencePaths: ['/source/diagram.png'] },
    previous: { id: 'attempt-1', path: '/run/previous-master.png' },
  });
  expect(request.references).toEqual([...originals, '/source/diagram.png', '/run/previous-master.png']);
  expect(request.prompt).toContain('"image":3,"id":"diagram","role":"category-example"');
  expect(request.prompt).toContain('"image":4,"id":"attempt-1","role":"previous-candidate"');
  expect(request.generationManifest?.at(-1)).toMatchObject({
    image: 4,
    id: 'attempt-1',
    role: 'previous-candidate',
  });
  expect(request.prompt).toContain('Repair the handle only.');
  expect(request.prompt).toContain(f.brief.wishes);
});
it('uses the persisted legacy catalog without adding revision inputs or reinterpreting its templates', () => {
  const f = fixture();
  const { ['generation.context.v1']: extension, ...legacy } = defaults;
  expect(extension).toBeTruthy();
  const snapshot = { ...f.profile, promptCatalog: legacy };
  expect(() => new PromptCatalog(legacy)).not.toThrow();
  const request = new GenerationRequestBuilder().build({
    ...f,
    profile: snapshot,
    prompt: 'Historical prompt',
    references: ['/original.png'],
    instruction: 'Fix lighting',
    previous: { id: 'old', path: '/previous.png' },
  });
  expect(request).toEqual({ prompt: 'Historical prompt', references: ['/original.png'] });
  expect(() => new PromptCatalog({ ...defaults, 'generation.context.v1': '{{unknown}}' })).toThrow(
    'placeholders',
  );
});
it('does not add a previous candidate to a fresh generation without a correction', () => {
  const f = fixture();
  const request = new GenerationRequestBuilder().build({
    ...f,
    prompt: 'Approved brief',
    references: ['/original.png'],
    instruction: '',
    previous: { id: 'old', path: '/previous.png' },
  });
  expect(request.references).toEqual(['/original.png']);
  expect(request.prompt).toContain('"previousCandidate":null');
});
it.each([false, true])(
  'persists the final request and uses the selected master only for generation (prepared=%s)',
  async (usePreparation) => {
    const f = fixture();
    const references = f.profile.references.slice(0, 2).map((ref) => `/art/${ref.filename}`);
    const run = Contracts.run.parse({
      id: '00000000-0000-4000-8000-000000000001',
      createdAt: '',
      updatedAt: '',
      brief: { ...f.brief, autoRepair: false },
      status: 'generating',
      stage: '',
      imageCalls: 0,
      variants: [f.variant],
      imageModel: 'offline',
      textModel: 'offline',
      events: [],
      selectedVariantId: null,
    });
    const evidence = StyleContracts.evidence.parse({
      version: 'style-v2',
      query: 'fixture',
      policy: {},
      createdAt: '',
      model: 'offline',
      references: f.profile.references.slice(0, 2).map((ref) => ({
        ...ref,
        origin: 'anchor',
        reason: 'Rendering',
        role: 'style',
        take: 'Soft highlights',
        ignore: 'Subject identity',
      })),
      analysis: {
        selections: [],
        visualDirection: 'Rounded painted volume',
        materialGuidance: 'Matte wood',
        compositionGuidance: 'Floating magnifier',
        pitfalls: [],
      },
    });
    const active: ActiveRun = {
      run,
      stop: false,
      profile: f.profile,
      preparation: usePreparation
        ? {
            initialize: async () => {},
            prepare: async () => ({
              prompt: PromptBuilder.build(f.card, f.variant, f.profile),
              references,
              evidence,
            }),
          }
        : undefined,
    };
    const context = new ProductionContext(
      {
        directory: () => '/run',
        save: async () => {},
        get: async () => run,
        saveProfile: async () => {},
        getProfile: async () => f.profile,
        remove: async () => {},
      },
      {
        read: async () => Buffer.from('fixture'),
        save: async (_folder, id) => ({ master: `${id}-master.png`, preview: `${id}.png` }),
        selected: (card) => card.attempts.find((attempt) => attempt.id === card.selectedAttemptId),
        sheet: async () => '/sheet.png',
      },
      '/art',
      async () => {},
    );
    const image = vi.fn<GenerationPort['image']>(async () => ({
      bytes: Buffer.from('fixture'),
      requestId: null,
      usage: null,
    }));
    const review = vi.fn<GenerationPort['review']>(async (_card, _image, supplied, profile) => {
      expect(supplied.some((file) => file.endsWith('-master.png'))).toBe(false);
      expect(profile.inputManifest?.length).toBe(supplied.length + 1);
      expect(profile.inputManifest?.[0]?.role).toBe('candidate');
      expect(profile.inputManifest?.some((input) => input.role === 'previous-candidate')).toBe(false);
      return {
        passed: true,
        style: 5,
        readability: 5,
        subjectMatch: 5,
        categoryMatch: true,
        findings: [],
        correction: '',
      };
    });
    const provider: GenerationPort = {
      designSlotSet: async () => {
        throw new Error('Unexpected slot design');
      },
      proposeSubjects: async () => {
        throw new Error('Unexpected semantic planning');
      },
      describeComposition: async () => {
        throw new Error('Unexpected composition description');
      },
      image,
      review,
      plan: async () => {
        throw new Error('Unexpected plan');
      },
      reviewPlan: async () => {
        throw new Error('Unexpected plan review');
      },
      reviewSet: async () => {
        throw new Error('Unexpected set review');
      },
    };
    const service = new CardProductionService(context);
    await service.produce(active, provider, f.variant, f.card);
    const previous = f.card.attempts[0];
    if (!previous) throw new Error('Previous attempt missing');
    await service.produce(active, provider, f.variant, f.card, 'Repair only the handle');
    expect(image).toHaveBeenCalledTimes(2);
    const revisedCall = image.mock.calls[1];
    expect(revisedCall?.[1].at(-1)).toBe(`/run/${previous.master}`);
    expect(revisedCall?.[0]).toContain(previous.id);
    expect(f.card.attempts[1]?.prompt).toBe(revisedCall?.[0]);
    expect(revisedCall?.[2]).toBe(f.brief.quality);
    expect(review).toHaveBeenCalledTimes(2);
    expect(
      f.card.attempts[1]?.reviewInputManifest?.some((input) => input.role === 'previous-candidate'),
    ).toBe(false);
    expect(f.card.attempts[1]?.reviewPrompt).toContain('frosted glass');
  },
);
it('preserves the complete request and input bytes through Codex without network or a real worker', async () => {
  const f = fixture();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-generation-context-'));
  folders.push(root);
  const files = ['anchor.png', 'diagram.png', 'previous.png'].map((name) => path.join(root, name));
  for (const file of files) await fs.writeFile(file, path.basename(file));
  const request = new GenerationRequestBuilder().build({
    ...f,
    prompt: 'Approved visible requirements',
    references: files.slice(0, 2),
    instruction: 'Fix the handle',
    previous: { id: 'old', path: files[2] ?? '' },
  });
  const runner = new CodexRunner('/unused', root, 'offline');
  await fs.writeFile(path.join(root, 'image.png'), 'generated fixture');
  const run = vi.spyOn(runner, 'run').mockImplementation(async (prompt, schema, images) => {
    expect(prompt).toContain(request.prompt);
    expect(images).toEqual(request.references);
    return {
      value: schema.parse({ success: true, tool: 'image_gen', message: 'fixture' }),
      folder: root,
      usage: null,
      threadId: null,
    };
  });
  const codexResult = await new CodexProvider(runner).image(request.prompt, request.references, 'high');
  expect(run).toHaveBeenCalledOnce();
  expect(run.mock.calls[0]?.[0]).not.toContain('Requested quality intent:');
  expect(codexResult.usage).toMatchObject({ qualityControl: 'native' });
  expect(codexResult.usage).not.toHaveProperty('qualityRequested');
});
