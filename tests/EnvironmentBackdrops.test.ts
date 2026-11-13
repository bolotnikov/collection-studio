import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EnvironmentBackdrops } from '../src/domain/EnvironmentBackdrops';
import { VisualPatterns } from '../src/domain/VisualPatterns';
import { CompositionRepairRules } from '../src/domain/CompositionRepairRules';
import { VisualCatalogStore } from '../src/infrastructure/VisualCatalogStore';
import { KnowledgeWorkspace } from '../src/infrastructure/KnowledgeWorkspace';
import { ReferenceLibrary } from '../src/infrastructure/ReferenceLibrary';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { CodexProvider } from '../src/infrastructure/CodexProvider';
import { Contracts } from '../src/shared/Contracts';
import { StyleContracts } from '../src/shared/StyleContracts';
import { PromptBuilder } from '../src/application/PromptBuilder';
import { GenerationRequestBuilder } from '../src/application/GenerationRequestBuilder';
import { CompositionVerificationService } from '../src/application/CompositionVerificationService';
import { ProductionContext } from '../src/application/ProductionContext';
import { CompositionPlanningPrompts } from '../src/application/prompts/CompositionPlanningPrompts';
import { PromptCatalog } from '../src/application/prompts/PromptCatalog';
import { CompositionFixture } from './fixtures/CompositionFixture';
import profileDefaults from '../resources/style-profile.json';
import promptDefaults from '../resources/prompts/production.json';
import requirements from '../resources/production-requirements.json';
import libraryDefaults from '../resources/library.json';

const folders: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});

it('covers all 160 immutable images and distinguishes environmental detail from original category and support', async () => {
  const original = await new VisualCatalogStore('resources/knowledge/visual-catalog.json').read();
  const catalog = structuredClone(original);
  expect(EnvironmentBackdrops.review.cards).toHaveLength(original.cards.length);
  await Promise.all(
    original.cards.map(async (card) => {
      expect(EnvironmentBackdrops.review.cards.find((entry) => entry.id === card.id)?.sha256).toBe(
        card.sha256,
      );
      const bytes = await fs.readFile(path.join('resources/references', card.filename));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(card.sha256);
    }),
  );
  EnvironmentBackdrops.apply(catalog);
  expect(catalog.cards.filter((card) => card.observation.environment)).toHaveLength(84);
  for (const [index, card] of catalog.cards.entries()) {
    const source = original.cards[index];
    expect(card.observation.facets).toMatchObject(source?.observation.facets ?? {});
    expect(card.observation.category).toBe(source?.observation.category);
    expect(card.analysisKey).toBe(source?.analysisKey);
    expect(source?.observation.environment).toBeUndefined();
  }
  const byNumber = (number: number) => {
    const item = libraryDefaults.find((item) => item.tags.includes(`card-number:${number}`));
    const card = catalog.cards.find((card) => card.id === item?.id);
    if (!card) throw new Error('Missing original');
    return card.observation;
  };
  expect(byNumber(32).facets).toMatchObject({ support: 'material-surface', backdrop: 'pattern' });
  expect(byNumber(32).environment).toBeUndefined();
  expect(byNumber(123).environment).toBeUndefined();
  expect(byNumber(13)).toMatchObject({
    category: '4',
    facets: { backdrop: 'surface-continuation', environmentKind: 'landscape' },
  });
  expect(byNumber(68).environment?.secondaryObjects).toEqual([]);
  expect(byNumber(41).environment?.secondaryObjects).toHaveLength(2);
  expect(byNumber(143).facets.backgroundDetail).toBe('repeated-detail');
  expect(VisualPatterns.tags(byNumber(68).facets)).toContain('backgroundProps:none');
});

it('enriches the working database without model calls, preserves user edits and rejects changed source identity', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'background-workspace-'));
  folders.push(root);
  const catalog = await new VisualCatalogStore('resources/knowledge/visual-catalog.json').read();
  const library = new ReferenceLibrary(path.resolve('resources/references'), root);
  library.items = StyleContracts.libraryItem.array().parse(libraryDefaults);
  const runner = new CodexRunner('/unused', root, 'offline');
  const calls = vi.spyOn(runner, 'run');
  const create = () =>
    new KnowledgeWorkspace(
      path.join(root, 'edits.json'),
      path.resolve('resources/knowledge'),
      library,
      async () => catalog,
      () => runner,
      () => ({}),
    );
  const workspace = create();
  await workspace.init();
  const before = await workspace.generation();
  const lighthouse = before.library.find((item) => item.id === 'source-96c05c6983b6bb759d15f322');
  if (!lighthouse?.observation?.environment) throw new Error('Missing reviewed lighthouse');
  const observation = structuredClone(lighthouse.observation);
  observation.environment = {
    ...lighthouse.observation.environment,
    layout: 'Explicit user background placement retained.',
  };
  observation.facets.backgroundDetail = 'local-accents';
  await workspace.save({ kind: 'card', id: lighthouse.id, observation });
  const reopened = create();
  await reopened.init();
  const after = await reopened.generation();
  expect(after.library.find((item) => item.id === lighthouse.id)?.observation).toEqual(observation);
  expect(after.catalog.dependencyHash).not.toBe(before.catalog.dependencyHash);
  expect(lighthouse.observation.environment.layout).not.toBe(observation.environment.layout);
  expect(catalog.cards.find((card) => card.id === lighthouse.id)?.observation.environment).toBeUndefined();
  expect(calls).not.toHaveBeenCalled();
  const changed = structuredClone(catalog);
  const card = changed.cards.find((card) => card.id === lighthouse.id);
  if (!card) throw new Error('Missing source');
  card.sha256 = 'f'.repeat(64);
  EnvironmentBackdrops.apply(changed);
  expect(card.observation.environment).toBeUndefined();
});

it('binds observations to actual numbered inputs and propagates canonical policy through design and generation', async () => {
  const catalog = await new VisualCatalogStore('resources/knowledge/visual-catalog.json').read();
  EnvironmentBackdrops.apply(catalog);
  const library = StyleContracts.libraryItem
    .array()
    .parse(libraryDefaults)
    .map((item) => ({
      ...item,
      observation: catalog.cards.find((card) => card.id === item.id)?.observation,
    }));
  const profile = Contracts.profile.parse({
    ...profileDefaults,
    library,
    visualCatalog: catalog,
    requirements,
    promptCatalog: promptDefaults,
  });
  const { variant } = CompositionFixture.create();
  const card = variant.cards[8];
  if (!card) throw new Error('Missing fixture');
  const lighthouse = library.find((item) => item.id === 'source-96c05c6983b6bb759d15f322');
  const fan = library.find((item) => item.id === '3458764679576006389');
  if (!lighthouse || !fan) throw new Error('Missing originals');
  const refs = [fan, lighthouse].map((item) => `/art/${item.filename}`);
  const brief = Contracts.brief.parse({
    theme: 'Космос',
    wishes: '',
    quality: 'high',
    maxImageCalls: 15,
    autoRepair: true,
  });
  const planned = PromptBuilder.planningContext(profile, refs);
  expect(Contracts.profile.parse(planned).inputManifest?.[0]).toMatchObject({
    image: 1,
    id: fan.id,
    background: { facets: { environmentKind: 'interior' } },
  });
  const design = CompositionPlanningPrompts.design(brief, profile, [], '', refs);
  const prompt = PromptBuilder.build(card, variant, profile);
  const request = new GenerationRequestBuilder().build({
    profile,
    brief,
    card,
    prompt,
    references: refs,
    instruction: 'Убрать лишнее здание',
    previous: { id: 'previous', path: '/run/previous.png' },
  });
  const rules = requirements.find((section) => section.id === 'environment-background')?.rules ?? [];
  expect(rules.length).toBeGreaterThan(0);
  for (const rule of rules) {
    expect(design).toContain(rule);
    expect(request.prompt).toContain(rule);
  }
  const manifest = Contracts.inputManifest.parse(request.generationManifest);
  expect(manifest[1]).toMatchObject({
    image: 2,
    id: lighthouse.id,
    background: { facets: { environmentKind: 'waterside', backgroundProps: 'none' } },
  });
  expect(manifest[2]).toEqual({ image: 3, id: 'previous', role: 'previous-candidate' });
  expect(request.reviewManifest?.some((input) => input.id === 'previous')).toBe(false);
  expect(request.references).toEqual([...refs, '/run/previous.png']);
});

it.each(['disabled', 'current', 'historical'] as const)(
  'respects %s review snapshots and requires corroborated evidence before spending a correction',
  async (mode) => {
    const { variant } = CompositionFixture.create();
    const card = variant.cards[8];
    const target = variant.artContract?.composition?.targets[8];
    if (!card || !target) throw new Error('Missing fixture');
    const { ['review.environment.v1']: extension, ...historical } = promptDefaults;
    expect(extension).toBeTruthy();
    expect(() => new PromptCatalog(historical)).not.toThrow();
    const profile = Contracts.profile.parse({
      ...profileDefaults,
      requirements,
      promptCatalog: mode === 'historical' ? historical : promptDefaults,
    });
    const attempt = Contracts.attempt.parse({
      id: 'candidate',
      master: 'master.png',
      preview: 'preview.png',
      prompt: 'fixture',
      model: 'fixture',
      createdAt: '',
      elapsedMs: 0,
      requestId: null,
      usage: null,
      review: null,
      reviewError: null,
    });
    card.attempts.push(attempt);
    card.selectedAttemptId = attempt.id;
    const run = Contracts.run.parse({
      id: '00000000-0000-4000-8000-000000000001',
      createdAt: '',
      updatedAt: '',
      brief: { theme: 'Rocket launch', wishes: '', quality: 'high', autoRepair: true, maxImageCalls: 15 },
      status: 'generating',
      stage: '',
      variants: [variant],
      events: [],
      imageCalls: 10,
      imageModel: 'offline',
      textModel: 'offline',
      selectedVariantId: null,
      repairPolicy: {
        version: 'bounded-composition-v1',
        enabledAt: '',
        reason: 'new-run',
        maxCardRegenerations: mode === 'disabled' ? 0 : 1,
        maxSetRegenerationRounds: 0,
      },
    });
    const context = new ProductionContext(
      {
        directory: () => '/run',
        save: async () => {},
        get: async () => run,
        saveProfile: async () => {},
        getProfile: async () => profile,
        remove: async () => {},
      },
      {
        read: async () => Buffer.from('fixture'),
        save: async () => ({ master: 'master.png', preview: 'preview.png' }),
        selected: () => attempt,
        sheet: async () => '/sheet.png',
      },
      '/art',
      async () => {},
    );
    const provider = new CodexProvider(new CodexRunner('/unused', '/unused', 'offline'));
    const verify = vi
      .spyOn(provider, 'verifyComposition')
      .mockResolvedValue(
        Contracts.repairableCompositionObservation.parse({
          subjectPresent: true,
          completeSilhouette: true,
          compositionDescriptionMatch: false,
          observedCategory: card.category,
          observedComposition: {
            ...target.required,
            contextDensity: 'contextual',
            camera: 'front',
            subjectScale: 'large',
            characterCount: 0,
            subjectPosition: 'center',
            backgroundColor: 'cyan',
          },
          unexpectedBackgroundObjects: [{ object: 'Ангар', position: 'справа за ракетой' }],
          confirmedViolations: [
            { kind: 'wrong-background', evidence: 'Неописанный ангар справа за ракетой' },
          ],
          findings: [],
        }),
      );
    await new CompositionVerificationService(context).verify(
      { run, profile, stop: false },
      provider,
      variant,
      card,
      attempt,
      [],
    );
    if (mode === 'disabled') {
      expect(verify).not.toHaveBeenCalled();
      expect(attempt.compositionCheckSkipped).toBe('disabled-by-policy');
      return;
    }
    expect(verify).toHaveBeenCalledOnce();
    expect(CompositionRepairRules.violations(variant, card, attempt)).toHaveLength(
      mode === 'current' ? 1 : 0,
    );
    if (mode === 'historical') {
      expect(attempt.backgroundReviewVersion).toBeUndefined();
      expect(attempt.reviewPrompt).not.toContain('unexpectedBackgroundObjects');
      return;
    }
    expect(attempt.backgroundReviewVersion).toBe('environment-background-v1');
    expect(attempt.reviewPrompt).toContain('unexpectedBackgroundObjects');
    expect(CompositionRepairRules.needsCardRepair(run, variant, card)).toBe(true);
    if (!attempt.compositionCheck) throw new Error('Missing review');
    attempt.compositionCheck.unexpectedBackgroundObjects = [];
    expect(CompositionRepairRules.needsCardRepair(run, variant, card)).toBe(false);
    attempt.compositionCheck.unexpectedBackgroundObjects = [{ object: 'Ангар', position: 'справа' }];
    attempt.compositionCheck.confirmedViolations = [];
    expect(CompositionRepairRules.needsCardRepair(run, variant, card)).toBe(false);
  },
);
