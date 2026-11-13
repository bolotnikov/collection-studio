import { CompositionPlanningContracts } from '../src/shared/CompositionPlanningContracts';
import type { CompositionBlueprint } from '../src/shared/CompositionPlanningContracts';
import type { PlanReview } from '../src/shared/SetContract';
import type { SourceContextPort } from '../src/application/style/SourceContextPort';
import { KnowledgeContracts } from '../src/shared/KnowledgeContracts';
import type { StylePreparationPort } from '../src/application/style/StylePreparationPort';
import { StyleContracts } from '../src/shared/StyleContracts';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import {
  Contracts,
  type Brief,
  type Card,
  type Variant,
  type Plan,
  type Profile,
  type Review,
  type Run,
  type Settings,
  type SetReview,
} from '../src/shared/Contracts';
import type { GenerationPort } from '../src/application/GenerationPort';
import { RunService } from '../src/application/RunService';
import { RunRepository } from '../src/infrastructure/RunRepository';
import { ImageFiles } from '../src/infrastructure/ImageFiles';
import { ExportService } from '../src/infrastructure/ExportService';
import { SetRules } from '../src/domain/SetRules';
import { SetContract } from '../src/shared/SetContract';
import { DeliveryReadiness } from '../src/domain/DeliveryReadiness';
import { CompositionFixture } from './fixtures/CompositionFixture';
import contentModes from '../resources/content-modes.json';
import { SetComposition } from '../src/domain/SetComposition';
import { SlotTagContracts } from '../src/shared/SlotTagContracts';
import sourceCatalog from '../resources/knowledge/visual-catalog.json';
import { VisualCatalogContracts } from '../src/shared/VisualCatalogContracts';
import { SetRhythmPlanner } from '../src/domain/SetRhythmPlanner';

let pixels: Buffer;
let profile: Profile;
const directories: string[] = [];
const settings: Settings = Contracts.settings.parse({
  maxCardRegenerations: 1,
  maxSetRegenerationRounds: 1,
});
const brief: Brief = {
  theme: 'Offline test fixtures',
  wishes: 'Not generated art.',
  variants: 3,
  quality: 'low',
  maxImageCalls: 36,
  autoRepair: false,
};
const pass: Review = {
  passed: true,
  style: 5,
  readability: 4,
  subjectMatch: 4,
  categoryMatch: true,
  findings: [],
  correction: '',
};

class FixtureProvider implements GenerationPort {
  async designSlotSet(
    _brief: Brief,
    _profile: Profile,
    slots: import('../src/shared/CompositionPlanningContracts').SlotPlan[],
  ) {
    return {
      variants: slots.map((plan, variantIndex) => ({
        variantIndex,
        title: 'Slot-first collection',
        concept: 'A coherent story through complementary objects',
        lighting: 'Broad soft upper-left light with readable fill and lower-right shadows',
        materialTreatment: 'Distinct painted wood and metal with restrained highlights',
        paletteRhythm: 'Varied complementary colors across the set',
        cards: plan.slots.map((slot) => ({
          index: slot.index,
          id: 'subject-' + slot.index,
          subject:
            _profile.subjectUniqueness === 'batch-unique-v1'
              ? `New object ${variantIndex} ${slot.index}`
              : 'New object ' + slot.index,
          subjectType:
            _profile.entityUniqueness || _profile.subjectUniqueness === 'batch-unique-v1'
              ? `object_${variantIndex}_${slot.index}`
              : undefined,
          depictedEntities: _profile.entityUniqueness
            ? slot.target.category === '5'
              ? Array.from({ length: slot.target.required.characterCount ?? 1 }, (_, actor) => ({
                  identity: `person_${variantIndex}_${slot.index}_${actor}`,
                  kind: 'character' as const,
                  appearance: `Distinct person ${variantIndex} ${slot.index} ${actor} with unique hair and clothes`,
                }))
              : [
                  {
                    identity: `object_${variantIndex}_${slot.index}`,
                    kind: 'object' as const,
                    appearance: `Distinct object ${variantIndex} ${slot.index} with readable form`,
                  },
                ]
            : undefined,
          role: 'Distinct story role ' + slot.index,
          materials: ['wood'],
          silhouette: 'Rounded large form',
          compatibleCategories: [slot.target.category],
          characterCount: slot.target.required.characterCount ?? 0,
          compatibleComposition: {
            support: [slot.target.required.support ?? 'none'],
            backdrop: [slot.target.required.backdrop ?? 'pattern'],
            pattern: [slot.target.required.pattern ?? 'none'],
            depth: [slot.target.required.depth ?? 'shallow'],
            contextDensity: [slot.target.required.contextDensity ?? 'minimal'],
          },
          description: 'A clearly recognizable new subject with readable materials',
          composition: 'Follow the assigned support and background',
          paletteRole: 'Varied contrasting color',
        })),
      })),
    };
  }
  async proposeSubjects(input: Brief, supplied: Profile, references: string[]) {
    const plan = await this.plan(input, supplied, references);
    return {
      variants: plan.variants.map((variant) => ({
        title: variant.title,
        concept: variant.concept,
        candidates: variant.cards.map((card, index) => ({
          id: `subject-${index}`,
          subject: card.subject,
          role: card.role,
          materials: card.visual?.materials ?? ['wood'],
          silhouette: card.visual?.silhouette ?? 'rounded form',
          compatibleCategories: [card.category],
          characterCount: card.category === '5' ? 1 : 0,
        })),
      })),
    };
  }
  async describeComposition(_brief: Brief, _profile: Profile, blueprints: CompositionBlueprint[]) {
    return {
      variants: blueprints.map((blueprint, variantIndex) => ({
        variantIndex,
        paletteRhythm: 'Complementary saturated colors',
        cards: blueprint.slots.map((slot) => ({
          index: slot.index,
          description: 'One clearly recognizable fixture object',
          paletteRole: 'blue and orange contrast',
          composition: 'Matches the assigned support and backdrop',
        })),
      })),
    };
  }
  rejectPlan = false;
  planReviewCalls = 0;
  async reviewPlan(): Promise<PlanReview> {
    this.planReviewCalls++;
    return {
      passed: !this.rejectPlan,
      thematicCohesion: 5,
      visualDiversity: 5,
      styleFaithfulness: 5,
      categoryAllocationValid: true,
      producerRequirementsMet: true,
      findings: this.rejectPlan ? ['Disconnected story'] : [],
      correction: this.rejectPlan ? 'Connect all subjects' : '',
    };
  }
  styleScore = 5;
  calls = 0;
  planCalls = 0;
  planReferences: string[][] = [];
  setReferences: string[][] = [];
  rejectImages = false;
  rejectReview = false;
  badReviews = false;
  gate: Promise<void> = Promise.resolve();
  async plan(input: Brief, _profile?: Profile, references: string[] = []): Promise<Plan> {
    this.planReferences.push(references);
    this.planCalls++;
    return {
      variants: Array.from({ length: input.variants }, (_, v) => ({
        title: `Fixture ${v}`,
        concept: 'Offline integration fixtures',
        artContract: {
          version: 'set-contract-v1',
          story: 'One coherent synthetic story',
          categoryAllocation: { '1': 3, '2': 3, '3': 2, '4': 2 },
          rendering: 'Broad painted rounded volumes',
          lighting: 'Soft consistent directional light',
          materialTreatment: 'Simplified distinct material response',
          paletteRhythm: 'Balanced complementary color accents',
          compositionRhythm: 'Varied silhouettes and readable environments',
          avoid: ['Photographic details'],
        },
        cards: Array.from({ length: 10 }, (_, i) => ({
          subject: `Subject ${v}/${i}`,
          description: 'A synthetic test fixture, not art',
          category: Contracts.plannedCard.shape.category.parse(String((i % 4) + 1)),
          role: 'Coverage fixture',
          visual: {
            materials: ['wood'],
            silhouette: 'rounded varied form',
            paletteRole: 'warm accent',
            composition: 'category appropriate object and environment',
          },
        })),
      })),
    };
  }
  reviewProfiles: Profile[] = [];
  setReviewProfiles: Profile[] = [];
  receivedPrompts: string[] = [];
  receivedReferences: string[][] = [];
  async image(prompt: string, references: string[]) {
    this.receivedPrompts.push(prompt);
    this.receivedReferences.push(references);
    this.calls++;
    await this.gate;
    if (this.rejectImages) throw new Error('Test quota failure');
    return { bytes: pixels, requestId: 'offline', usage: null };
  }
  async review(
    _card: Card,
    _image: string,
    _references: string[],
    receivedProfile: Profile,
  ): Promise<Review> {
    this.reviewProfiles.push(receivedProfile);
    if (this.rejectReview) throw new Error('Review unavailable');
    return this.badReviews
      ? { ...pass, passed: false, style: 2, findings: ['Test defect'], correction: 'Repair test defect' }
      : { ...pass, style: this.styleScore };
  }
  async reviewSet(
    _variant: Variant,
    _sheet: string,
    receivedProfile: Profile,
    references: string[] = [],
  ): Promise<SetReview> {
    this.setReferences.push(references);
    this.setReviewProfiles.push(receivedProfile);
    return { passed: true, coherence: 4, findings: [], outlierCardIds: [] };
  }
}

beforeAll(async () => {
  pixels = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#a6b49a' } })
    .png()
    .toBuffer();
  profile = Contracts.profile.parse(JSON.parse(await fs.readFile('resources/style-profile.json', 'utf8')));
});
afterEach(async () => {
  await Promise.all(directories.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function harness(
  provider = new FixtureProvider(),
  preparation?: StylePreparationPort,
  sourceContext?: SourceContextPort,
  sourceProfile?: Profile,
  qualityMode: 'strict-v1' | 'best-effort-v1' = 'strict-v1',
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-studio-test-'));
  directories.push(root);
  const repository = new RunRepository(root, (directory) => fs.rename(directory, directory + '.trashed')),
    images = new ImageFiles();
  const snapshots: Run[] = [];
  const service = new RunService(
    repository,
    images,
    sourceProfile ?? profile,
    '/test-references',
    () => provider,
    (r) => snapshots.push(r),
    preparation ? () => preparation : undefined,
    sourceContext ? () => sourceContext : undefined,
    SetContract.planningPolicy.parse({
      maxPlanRepairs: 1,
      minimumPlanScore: 4,
      productionConcurrency: 2,
      qualityMode,
    }),
  );
  return { root, repository, images, service, provider, snapshots };
}
async function finished(h: Awaited<ReturnType<typeof harness>>, id: string) {
  await vi.waitFor(() => expect(h.snapshots.at(-1)?.status).toMatch(/completed|paused|failed/), {
    timeout: 15000,
    interval: 20,
  });
  return h.repository.get(id);
}

function evidenceFixture() {
  return StyleContracts.evidence.parse({
    version: 'style-v2',
    query: 'fixture',
    policy: {},
    references: [
      {
        id: 'anchor',
        sha256: 'fixturehash',
        source: 'fixture',
        origin: 'anchor',
        reason: 'material',
        role: 'style',
        take: 'rounded volumes',
        ignore: 'subject',
      },
    ],
    analysis: {
      selections: [],
      visualDirection: 'test',
      materialGuidance: 'test',
      compositionGuidance: 'test',
      pitfalls: [],
    },
    createdAt: new Date().toISOString(),
    model: 'offline',
  });
}

describe('production invariants and durable execution', () => {
  it('defaults new production policy to exact-style acceptance while retaining an explicit relaxed option', () => {
    const review = { ...pass, style: 4 };
    expect(StyleContracts.policy.parse({}).styleThreshold).toBe(5);
    expect(SetRules.acceptsReview(review, StyleContracts.policy.parse({}).styleThreshold)).toBe(false);
    expect(
      SetRules.acceptsReview(review, StyleContracts.policy.parse({ styleThreshold: 4 }).styleThreshold),
    ).toBe(true);
  });
  it('rejects undersized or transparent output before treating it as a deliverable', async () => {
    const h = await harness();
    const small = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const transparent = await sharp({
      create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    await expect(h.images.save(h.root, 'small', small)).rejects.toThrow('undersized');
    await expect(h.images.save(h.root, 'transparent', transparent)).rejects.toThrow('opaque');
  });
  it('rejects missing categories and duplicate subjects before any image call', async () => {
    const provider = new FixtureProvider(),
      plan = await provider.plan(brief);
    const first = plan.variants[0];
    if (!first) throw new Error('Fixture missing');
    first.cards.forEach((c) => {
      c.category = '1';
    });
    expect(() => SetRules.validatePlan(plan, 3)).toThrow('four categories');
    const valid = await provider.plan(brief),
      v = valid.variants[0];
    if (!v) throw new Error('Fixture missing');
    v.cards.forEach((c) => {
      c.subject = 'Duplicate';
    });
    expect(() => SetRules.validatePlan(valid, 3)).toThrow('Duplicate subjects');
    expect(() => SetRules.validateBrief({ ...brief, maxImageCalls: 29 })).toThrow();
    expect(provider.calls).toBe(0);
  });
  it('creates 30 durable cards and exports exactly ten selected cards plus original masters', async () => {
    const h = await harness(),
      started = await h.service.start(brief, settings),
      run = await finished(h, started.id);
    expect(run.status).toBe('completed');
    expect(h.provider.calls).toBe(30);
    expect(
      run.variants.every((v) => v.cards.length === 10 && v.cards.every((c) => c.status === 'done')),
    ).toBe(true);
    const variant = run.variants[0],
      attempt = variant?.cards[0]?.attempts[0];
    if (!variant || !attempt) throw new Error('Fixture result missing');
    expect(await fs.readFile(path.join(h.repository.directory(run.id), attempt.master))).toEqual(pixels);
    expect(await sharp(path.join(h.repository.directory(run.id), attempt.preview)).metadata()).toMatchObject({
      width: 430,
      height: 480,
    });
    const zipPath = path.join(h.root, 'set.zip');
    await new ExportService(h.images).export(run, variant.id, h.repository.directory(run.id), zipPath);
    const zip = new AdmZip(zipPath),
      names = zip.getEntries().map((e) => e.entryName);
    expect(names.filter((n) => n.startsWith('cards/'))).toHaveLength(10);
    expect(names.filter((n) => n.startsWith('masters/'))).toHaveLength(10);
    expect(names).toContain('report.md');
    expect(names.some((n) => n.includes('.env'))).toBe(false);
  });
  it('generates every card even when an earlier card fails artistic review', async () => {
    const provider = new FixtureProvider();
    provider.badReviews = true;
    const h = await harness(provider),
      run = await h.service.start({ ...brief, maxImageCalls: 30, autoRepair: true }, settings);
    const result = await finished(h, run.id);
    expect(result.status).toBe('paused');
    expect(result.imageCalls).toBe(30);
    expect(result.variants.flatMap((v) => v.cards).filter((c) => c.attempts.length)).toHaveLength(30);
    expect(result.stage).toContain('needs art review');
  });
  it('uses prepared attachment packs and persists provenance for every image', async () => {
    const evidence = evidenceFixture();
    const prepare = vi.fn(async () => ({
      prompt: 'EVIDENCE PROMPT',
      references: ['/selected-reference.png'],
      evidence,
    }));
    const initialize = vi.fn(async () => {});
    const h = await harness(new FixtureProvider(), { prepare, initialize });
    const started = await h.service.start(brief, settings, StyleContracts.policy.parse({}));
    const run = await finished(h, started.id);
    expect(initialize).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledTimes(30);
    expect(h.provider.receivedPrompts.every((p) => p.includes('EVIDENCE PROMPT'))).toBe(true);
    expect(h.provider.receivedReferences.every((r) => r[0] === '/selected-reference.png')).toBe(true);
    expect(
      run.variants
        .flatMap((v) => v.cards)
        .every((c) => c.attempts[0]?.evidence?.references[0]?.sha256 === 'fixturehash'),
    ).toBe(true);
  });
  it('requires bounded repairs under production policy and blocks failed-review export', async () => {
    const provider = new FixtureProvider();
    provider.badReviews = true;
    const h = await harness(provider);
    const run = await h.service.start(
      { ...brief, maxImageCalls: 90, autoRepair: false },
      settings,
      StyleContracts.policy.parse({ maxRepairsPerCard: 2 }),
    );
    const result = await finished(h, run.id);
    expect(result.status).toBe('paused');
    expect(result.imageCalls).toBe(90);
    expect(result.variants[0]?.cards[0]?.attempts).toHaveLength(3);
    expect(result.variants.flatMap((v) => v.cards).filter((c) => c.attempts.length)).toHaveLength(30);
    const variant = result.variants[0];
    if (!variant) throw new Error('Missing fixture');
    await expect(
      new ExportService(h.images).export(
        result,
        variant.id,
        h.repository.directory(result.id),
        path.join(h.root, 'rejected.zip'),
      ),
    ).rejects.toThrow('passed card and set reviews');
  });
  it('passes mandatory configured rules to both card and set verifiers without mutating anchors', async () => {
    const rule = 'Every detective prop must have a clear readable silhouette against its background.';
    const originalRules = [...profile.rules];
    const h = await harness();
    const started = await h.service.start(brief, settings, StyleContracts.policy.parse({ rules: [rule] }));
    await finished(h, started.id);
    expect(h.provider.reviewProfiles).toHaveLength(30);
    expect(h.provider.setReviewProfiles).toHaveLength(3);
    for (const received of [...h.provider.reviewProfiles, ...h.provider.setReviewProfiles]) {
      expect(received.rules).toContain(rule);
      expect(received.rules).toEqual(
        expect.arrayContaining(originalRules.filter((rule) => !contentModes.ordinaryClauses.includes(rule))),
      );
      expect(received.rules).toContain(contentModes.scopedClause);
    }
    expect(profile.rules).toEqual(originalRules);
  });
  it('revalidates legacy approvals against a stricter migrated style threshold and fails export closed', async () => {
    const provider = new FixtureProvider();
    provider.styleScore = 4;
    const h = await harness(provider);
    const started = await h.service.start({ ...brief, maxImageCalls: 60 }, settings);
    const original = await finished(h, started.id);
    original.status = 'paused';
    delete original.workflowVersion; // Explicit historical protocol fixture: no automatic protocol migration.
    original.productionPolicy = StyleContracts.policy.parse({ styleThreshold: 5, maxRepairsPerCard: 1 });
    const variant = original.variants[0];
    if (!variant) throw new Error('Fixture missing');
    await expect(
      new ExportService(h.images).export(
        original,
        variant.id,
        h.repository.directory(original.id),
        path.join(h.root, 'threshold.zip'),
      ),
    ).rejects.toThrow('passed card and set reviews');
    original.productionPolicy = undefined;
    await h.repository.save(original);
    h.snapshots.length = 0;
    await h.service.resume(
      original.id,
      StyleContracts.policy.parse({ styleThreshold: 5, maxRepairsPerCard: 1 }),
    );
    const result = await finished(h, original.id);
    expect(result.status).toBe('paused');
    expect(result.imageCalls).toBe(60);
    expect(result.variants.flatMap((v) => v.cards).every((card) => card.attempts.length === 2)).toBe(true);
    expect(result.stage).toContain('needs art review');
  });
  it('does not spend an image request when paused during reference preparation', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prepare = vi.fn(async () => {
      await gate;
      return { prompt: 'Prepared prompt', references: ['/reference.png'], evidence: evidenceFixture() };
    });
    const h = await harness(new FixtureProvider(), { initialize: async () => {}, prepare });
    const started = await h.service.start(brief, settings, StyleContracts.policy.parse({}));
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
    await h.service.pause(started.id);
    release();
    const paused = await finished(h, started.id);
    expect(paused.status).toBe('paused');
    expect(paused.imageCalls).toBe(0);
    expect(h.provider.calls).toBe(0);
    expect(paused.variants.flatMap((v) => v.cards).every((card) => card.attempts.length === 0)).toBe(true);
  });
  it('pauses after in-flight requests, then resumes without redrawing finished cards', async () => {
    const provider = new FixtureProvider();
    let release = () => {};
    provider.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = await harness(provider),
      run = await h.service.start(brief, settings);
    await vi.waitFor(() => expect(provider.calls).toBe(2));
    await h.service.pause(run.id);
    release();
    const paused = await finished(h, run.id);
    expect(paused.status).toBe('paused');
    expect(paused.imageCalls).toBe(2);
    h.snapshots.length = 0;
    await h.service.resume(run.id);
    const result = await finished(h, run.id);
    expect(result.status).toBe('completed');
    expect(provider.calls).toBe(30);
    expect(provider.planCalls).toBe(1);
  });
  it('retains images when review is unavailable and reports them as needing review', async () => {
    const provider = new FixtureProvider();
    provider.rejectReview = true;
    const h = await harness(provider),
      run = await h.service.start(brief, settings),
      result = await finished(h, run.id);
    expect(result.status).toBe('paused');
    expect(result.stage).toContain('needs art review');
    expect(result.imageCalls).toBe(30);
    expect(
      result.variants
        .flatMap((v) => v.cards)
        .filter((c) => c.attempts.length)
        .every((c) => c.attempts[0]?.reviewError === 'Review unavailable'),
    ).toBe(true);
  });
  it('retries provider failures until the request budget is exhausted and does not claim completion', async () => {
    const provider = new FixtureProvider();
    provider.rejectImages = true;
    const h = await harness(provider),
      run = await h.service.start(brief, settings),
      result = await finished(h, run.id);
    expect(result.status).toBe('failed');
    expect(result.imageCalls).toBe(brief.maxImageCalls);
    expect(provider.calls).toBe(brief.maxImageCalls);
    const failures = result.variants.flatMap((v) => v.cards).flatMap((c) => c.generationFailures ?? []);
    expect(failures).toHaveLength(brief.maxImageCalls);
    expect(failures.every((failure) => failure.error === 'Test quota failure')).toBe(true);
    expect(result.variants.flatMap((v) => v.cards).filter((c) => c.status === 'failed')).toHaveLength(2);
    const variant = result.variants[0];
    if (!variant) throw new Error('Fixture missing');
    await expect(
      new ExportService(h.images).export(
        result,
        variant.id,
        h.repository.directory(result.id),
        path.join(h.root, 'bad.zip'),
      ),
    ).rejects.toThrow('ten');
  });
  it('serializes concurrent starts and recovers interrupted requests without automatic retries', async () => {
    const provider = new FixtureProvider();
    let release = () => {};
    provider.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = await harness(provider),
      first = h.service.start(brief, settings);
    await expect(h.service.start(brief, settings)).rejects.toThrow('Wait until');
    const run = await first;
    await vi.waitFor(() => expect(provider.calls).toBe(2));
    const interrupted = await h.repository.get(run.id);
    await h.service.pause(run.id);
    release();
    await finished(h, run.id);
    await h.repository.save(interrupted);
    await h.repository.recover();
    const recovered = await h.repository.get(run.id);
    expect(recovered.status).toBe('paused');
    expect(recovered.stage).toContain('may have consumed usage');
    expect(recovered.variants.flatMap((v) => v.cards).filter((c) => c.status === 'failed')).toHaveLength(2);
    expect(provider.calls).toBe(2);
  });
});

it.each(['provider', 'invalid-image'] as const)(
  'completes all ten cards after technical %s failures with both verification limits disabled',
  async (mode) => {
    const verifyComposition = vi.fn(async () => {
      throw new Error('Verification is disabled');
    });
    const provider = Object.assign(new FixtureProvider(), { verifyComposition });
    const original = provider.image.bind(provider);
    let failedPrompt: string | undefined;
    let failures = 0;
    const image = vi.spyOn(provider, 'image').mockImplementation(async (prompt, references) => {
      const result = await original(prompt, references);
      failedPrompt ??= prompt;
      if (prompt === failedPrompt && failures < 2) {
        failures++;
        if (mode === 'provider')
          throw new Error('Generated image could not be saved: Argument list too long');
        return { ...result, bytes: Buffer.from('corrupt image payload') };
      }
      return result;
    });
    const h = await harness(provider);
    const started = await h.service.start(
      { ...brief, variants: 1, maxImageCalls: 12, autoRepair: false },
      { ...settings, maxCardRegenerations: 0, maxSetRegenerationRounds: 0 },
    );
    const result = await finished(h, started.id);
    expect(result.status).toBe('completed');
    expect(result.imageCalls).toBe(12);
    expect(provider.calls).toBe(12);
    expect(verifyComposition).not.toHaveBeenCalled();
    const cards = result.variants.flatMap((variant) => variant.cards);
    expect(cards).toHaveLength(10);
    expect(cards.every((card) => card.status === 'done' && card.attempts.length === 1 && !card.error)).toBe(
      true,
    );
    expect(cards.flatMap((card) => card.repairRequests ?? [])).toEqual([]);
    const diagnostics = cards.flatMap((card) => card.generationFailures ?? []);
    expect(diagnostics).toHaveLength(2);
    expect(
      diagnostics.every((failure) => failure.phase === (mode === 'provider' ? 'provider' : 'image-storage')),
    ).toBe(true);
    expect(new Set(diagnostics.map((failure) => failure.imageCall)).size).toBe(2);
    const retries = image.mock.calls.filter(([prompt]) => prompt === failedPrompt);
    expect(retries).toHaveLength(3);
    expect(retries[1]).toEqual(retries[0]);
    expect(retries[2]).toEqual(retries[0]);
    const variant = result.variants[0];
    if (!variant) throw new Error('Missing variant');
    await new ExportService(h.images).export(
      result,
      variant.id,
      h.repository.directory(result.id),
      path.join(h.root, 'recovered.zip'),
    );
    expect(h.snapshots.some((snapshot) => snapshot.status === 'failed')).toBe(false);
  },
);

it('honors an explicit pause after a provider failure without issuing another request', async () => {
  const provider = new FixtureProvider();
  provider.rejectImages = true;
  let release = () => {};
  provider.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const h = await harness(provider);
  const started = await h.service.start({ ...brief, variants: 1 }, settings);
  await vi.waitFor(() => expect(provider.calls).toBe(2));
  await h.service.pause(started.id);
  release();
  const result = await finished(h, started.id);
  expect(result.status).toBe('paused');
  expect(provider.calls).toBe(2);
  expect(result.imageCalls).toBe(2);
  expect(
    result.variants.flatMap((variant) => variant.cards).flatMap((card) => card.generationFailures ?? []),
  ).toHaveLength(2);
});

it('generates exactly one ten-card set when count is omitted, without spending on hidden extra variants', async () => {
  const input = Contracts.brief.parse({
    theme: 'One economical set',
    wishes: '',
    quality: 'low',
    autoRepair: true,
    maxImageCalls: 30,
  });
  expect(input.variants).toBe(1);
  const h = await harness();
  const started = await h.service.start(input, settings, StyleContracts.policy.parse({}));
  const result = await finished(h, started.id);
  expect(result.status).toBe('completed');
  expect(result.variants).toHaveLength(1);
  expect(result.variants[0]?.cards).toHaveLength(10);
  expect(h.provider.calls).toBe(10);
  expect(Contracts.brief.safeParse({ ...input, variants: 0 }).success).toBe(false);
  expect(Contracts.brief.safeParse({ ...input, variants: 1.5 }).success).toBe(false);
});

it('carries source context through all production stages, records targeted set repairs and blocks stale approval', async () => {
  class DetailedProvider extends FixtureProvider {
    setCalls = 0;
    override async reviewSet(
      variant: Variant,
      sheet: string,
      receivedProfile: Profile,
      references: string[] = [],
    ) {
      await super.reviewSet(variant, sheet, receivedProfile, references);
      this.setCalls++;
      const first = variant.cards[0];
      if (!first) throw new Error('Fixture card missing');
      const bad = this.setCalls === 1;
      return Contracts.detailedSetReview.parse({
        passed: !bad,
        coherence: bad ? 3 : 5,
        findings: bad ? ['One card has conflicting material rendering.'] : [],
        outlierCardIds: bad ? [first.id] : [],
        assessment: {
          styleCompatibility: bad ? 3 : 5,
          thematicCohesion: 5,
          silhouetteDiversity: 5,
          materialDiversity: 5,
          paletteBalance: 5,
          compositionBalance: 5,
          categoryCoverage: true,
          redundantSubjects: false,
        },
        corrections: bad
          ? [{ cardId: first.id, instruction: 'TARGETED: use broad soft metal highlights.' }]
          : [],
      });
    }
  }
  const stages: string[] = [];
  const context: SourceContextPort = {
    async prepare(stage, _brief, receivedProfile) {
      stages.push(stage);
      const evidence = KnowledgeContracts.evidence.parse({
        version: 1,
        stage,
        model: 'fixture',
        documents: [],
        images: [],
        guidance: 'Fixture source context',
        createdAt: new Date().toISOString(),
      });
      return {
        profile: { ...receivedProfile, knowledgeContext: evidence },
        referencePaths: [`/source/${stage}.png`],
        evidence,
      };
    },
  };
  const provider = new DetailedProvider();
  const sourceProfile = {
    ...profile,
    knowledge: KnowledgeContracts.corpus.parse({ version: 1, documents: [], images: [] }),
  };
  const h = await harness(provider, undefined, context, sourceProfile);
  const started = await h.service.start(
    { ...brief, variants: 1, maxImageCalls: 30 },
    settings,
    StyleContracts.policy.parse({}),
  );
  const result = await finished(h, started.id);
  expect(result.status).toBe('completed');
  expect(result.reviewProtocol).toBe('set-v2');
  expect(result.sourceEvidence?.stage).toBe('planning');
  expect(provider.planReferences[0]).toContain('/source/planning.png');
  expect(provider.setReferences.every((paths) => paths.includes('/source/set-review.png'))).toBe(true);
  expect(provider.receivedReferences.every((paths) => paths.includes('/source/card.png'))).toBe(true);
  expect(provider.receivedPrompts.some((prompt) => prompt.includes('TARGETED:'))).toBe(true);
  expect(provider.reviewProfiles.every((p) => p.knowledgeContext?.stage === 'card')).toBe(true);
  expect(stages.filter((s) => s === 'set-review')).toHaveLength(2);
  const variant = result.variants[0],
    card = variant?.cards[0];
  if (!variant || !card) throw new Error('Fixture variant missing');
  expect(variant.reviewHistory).toHaveLength(2);
  expect(card.attempts).toHaveLength(2);
  expect(card.attempts.every((a) => a.sourceEvidence?.stage === 'card')).toBe(true);
  expect(SetRules.reviewMatchesSelection(variant, true)).toBe(true);
  await new ExportService(h.images).export(
    result,
    variant.id,
    h.repository.directory(result.id),
    path.join(h.root, 'accepted.zip'),
  );
  card.selectedAttemptId = card.attempts[0]?.id ?? null;
  await expect(
    new ExportService(h.images).export(
      result,
      variant.id,
      h.repository.directory(result.id),
      path.join(h.root, 'stale.zip'),
    ),
  ).rejects.toThrow('passed card and set reviews');
});

it('rejects a disconnected plan twice within the bound and makes zero image calls', async () => {
  const provider = new FixtureProvider();
  provider.rejectPlan = true;
  const h = await harness(provider);
  const started = await h.service.start({ ...brief, variants: 1 }, settings);
  const run = await finished(h, started.id);
  expect(run.status).toBe('failed');
  expect(run.variants).toHaveLength(0);
  expect(run.planHistory).toHaveLength(2);
  expect(provider.planCalls).toBe(2);
  expect(provider.calls).toBe(0);
  h.snapshots.length = 0;
  await h.service.resume(run.id);
  await finished(h, run.id);
  expect(provider.planCalls).toBe(4);
  expect(provider.calls).toBe(0);
});

it('starts two ordinary cards without a pilot gate, preserves verified images on resume, and binds the plan', async () => {
  const provider = new FixtureProvider();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const review = provider.review.bind(provider);
  vi.spyOn(provider, 'review').mockImplementation(async (...args) => {
    await gate;
    return review(...args);
  });
  const h = await harness(provider);
  const started = await h.service.start({ ...brief, variants: 1 }, settings);
  await vi.waitFor(() => expect(provider.calls).toBe(2));
  await vi.waitFor(() => expect(h.snapshots.at(-1)?.variants[0]?.cards[0]?.status).toBe('reviewing'));
  expect(provider.calls).toBe(2);
  await h.service.pause(started.id);
  release();
  const paused = await finished(h, started.id);
  const firstAttempt = paused.variants[0]?.cards[0]?.selectedAttemptId;
  h.snapshots.length = 0;
  await h.service.resume(started.id);
  const complete = await finished(h, started.id);
  expect(complete.status).toBe('completed');
  expect(provider.calls).toBe(10);
  const variant = complete.variants[0];
  if (!variant) throw new Error('Fixture missing');
  expect(variant.cards[0]?.selectedAttemptId).toBe(firstAttempt);
  expect(variant.cards[0]?.attempts).toHaveLength(1);
  variant.concept = 'A different unrelated set plan';
  await expect(
    new ExportService(h.images).export(
      complete,
      variant.id,
      h.repository.directory(complete.id),
      path.join(h.root, 'invalid-plan.zip'),
    ),
  ).rejects.toThrow('passed');
});

it('rejects an invalid category allocation before plan review or image production', async () => {
  const provider = new FixtureProvider();
  const plan = provider.plan.bind(provider);
  vi.spyOn(provider, 'plan').mockImplementation(async (...args) => {
    const result = await plan(...args);
    for (const v of result.variants) if (v.artContract) v.artContract.categoryAllocation['1'] = 7;
    return result;
  });
  const h = await harness(provider);
  const started = await h.service.start({ ...brief, variants: 1 }, settings);
  const run = await finished(h, started.id);
  expect(provider.calls).toBe(0);
  expect(provider.planReviewCalls).toBe(0);
  expect(run.planHistory?.every((entry) => entry.errors.length > 0)).toBe(true);
});

it('allows retrying a different card when an earlier card is rejected', async () => {
  const provider = new FixtureProvider();
  provider.badReviews = true;
  const h = await harness(provider);
  const started = await h.service.start(
    { ...brief, variants: 1, maxImageCalls: 30 },
    settings,
    StyleContracts.policy.parse({ maxRepairsPerCard: 0 }),
  );
  const run = await finished(h, started.id);
  const card = run.variants[0]?.cards[1];
  if (!card) throw new Error('Fixture missing');
  h.snapshots.length = 0;
  await h.service.retry(run.id, card.id, 'Try another card');
  const blocked = await finished(h, run.id);
  expect(blocked.status).toBe('paused');
  expect(provider.calls).toBe(11);
});

it('resumes a paused plan review without drafting another plan or spending an image', async () => {
  const provider = new FixtureProvider();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const originalReview = provider.reviewPlan.bind(provider);
  vi.spyOn(provider, 'reviewPlan').mockImplementation(async () => {
    const review = await originalReview();
    await gate;
    return review;
  });
  const h = await harness(provider);
  const started = await h.service.start(brief, settings);
  await vi.waitFor(() => expect(provider.planReviewCalls).toBe(1));
  await h.service.pause(started.id);
  release();
  const paused = await finished(h, started.id);
  expect(paused.imageCalls).toBe(0);
  expect(paused.planHistory?.[0]?.reviews).toHaveLength(1);
  h.snapshots.length = 0;
  await h.service.resume(started.id);
  const completed = await finished(h, started.id);
  expect(provider.planCalls).toBe(1);
  expect(provider.planReviewCalls).toBe(3);
  expect(completed.status).toBe('completed');
});

it('blocks stage-specific image numbers in new art contracts before generating any images', async () => {
  const provider = new FixtureProvider();
  const original = provider.plan.bind(provider);
  vi.spyOn(provider, 'plan').mockImplementation(async (brief) => {
    const plan = await original(brief);
    for (const variant of plan.variants)
      if (variant.artContract) variant.artContract.rendering = 'Images 8 and 9 define the painted rendering';
    return plan;
  });
  const h = await harness(provider);
  const started = await h.service.start({ ...brief, variants: 1 }, settings);
  const paused = await finished(h, started.id);
  expect(paused.status).toBe('failed');
  expect(provider.calls).toBe(0);
  expect(
    paused.planHistory?.every((entry) =>
      entry.errors.some((error) => error.includes('stable reference IDs')),
    ),
  ).toBe(true);
});

it('manual version selection invalidates set approval and makes a completed run resumable', async () => {
  const h = await harness();
  const started = await h.service.start({ ...brief, variants: 1 }, settings);
  const run = await finished(h, started.id);
  const variant = run.variants[0],
    card = variant?.cards[0],
    attempt = card?.attempts[0];
  if (!variant || !card || !attempt) throw new Error('Fixture missing');
  const alternative = { ...attempt, id: 'alternative-verified-attempt' };
  card.attempts.push(alternative);
  await h.repository.save(run);
  await h.service.selectAttempt(run.id, card.id, alternative.id);
  const edited = await h.repository.get(run.id);
  expect(edited.status).toBe('paused');
  expect(edited.variants[0]?.review).toBeNull();
  h.snapshots.length = 0;
  await h.service.resume(run.id);
  const completed = await finished(h, run.id);
  expect(completed.status).toBe('completed');
  expect(completed.variants[0]?.cards[0]?.selectedAttemptId).toBe(alternative.id);
  expect(h.provider.calls).toBe(10);
});

it.each([
  [true, true],
  [false, true],
  [true, false],
])('propagates gold mode end to end (enabled=%s, planHasGold=%s)', async (enabled, hasGold) => {
  const f = CompositionFixture.create();
  const variant = f.plan.variants[0];
  if (!variant?.artContract?.composition) throw new Error('Missing fixture');
  if (hasGold) {
    variant.artContract.categoryAllocation['3'] = 2;
    variant.artContract.categoryAllocation['5'] = 2;
    for (const index of [6, 7]) {
      const card = variant.cards[index],
        source = f.catalog.cards[index],
        target = variant.artContract.composition.targets[index];
      if (!card || !source || !target) throw new Error('Missing fixture card');
      card.category = '5';
      source.observation.category = '5';
      source.observation.facets = {
        ...source.observation.facets,
        support: 'environment',
        backdrop: 'environment',
        pattern: 'none',
        characterCount: 1,
      };
      target.category = '5';
      target.required = {
        support: 'environment',
        backdrop: 'environment',
        pattern: 'none',
        depth: 'spatial',
        characterCount: 1,
      };
    }
  }
  const provider = new FixtureProvider();
  vi.spyOn(provider, 'plan').mockResolvedValue(f.plan);
  vi.spyOn(provider, 'review').mockImplementation(async (card) => {
    const source = f.catalog.cards[Number(card.subject.split(' ')[1])];
    if (!source) throw new Error('Missing observation');
    return { ...pass, observedComposition: source.observation.facets };
  });
  const h = await harness(provider, undefined, undefined, {
    ...profile,
    visualCatalog: f.catalog,
    compositionPlanning: { ...CompositionPlanningContracts.defaults, version: 'source-prototype-v1' },
  });
  const started = await h.service.start(
    { ...brief, variants: 1, maxImageCalls: 10, includeGold: enabled },
    settings,
  );
  const result = await finished(h, started.id);
  expect(result.brief.includeGold).toBe(enabled);
  if (enabled && hasGold) {
    expect(result.status).toBe('completed');
    expect(provider.calls).toBe(10);
    expect(result.variants[0]?.cards.filter((card) => card.category === '5')).toHaveLength(2);
    const frozen = await h.repository.getProfile(started.id);
    expect(frozen.categories['5']).toBeDefined();
    expect(frozen.rules).not.toContain(profile.rules[6]);
  } else {
    expect(result.status).toBe('failed');
    expect(provider.calls).toBe(0);
    expect(provider.planCalls).toBe(0);
  }
});

it.each(['wrong', 'missing'] as const)(
  'enforces observed composition for every card (%s evidence)',
  async (mode) => {
    const f = CompositionFixture.create();
    const provider = new FixtureProvider();
    vi.spyOn(provider, 'plan').mockResolvedValue(f.plan);
    let first = true;
    vi.spyOn(provider, 'review').mockImplementation(async (card) => {
      const index = Number(card.subject.split(' ')[1]);
      const source = f.catalog.cards[index];
      if (!source) throw new Error('Missing observation fixture');
      if (first) {
        first = false;
        return mode === 'missing'
          ? pass
          : {
              ...pass,
              observedComposition: { ...source.observation.facets, backdrop: 'plain', pattern: 'none' },
            };
      }
      return { ...pass, observedComposition: source.observation.facets };
    });
    const h = await harness(provider, undefined, undefined, {
      ...profile,
      visualCatalog: f.catalog,
      compositionPlanning: { ...CompositionPlanningContracts.defaults, version: 'source-prototype-v1' },
    });
    const started = await h.service.start(
      { ...brief, variants: 1, maxImageCalls: 11 },
      settings,
      StyleContracts.policy.parse({ maxRepairsPerCard: 1 }),
    );
    let run = await finished(h, started.id);
    if (mode === 'missing') {
      expect(run.status).toBe('paused');
      expect(provider.calls).toBe(10);
      expect(
        run.variants[0]?.cards.flatMap((card) => card.attempts).find((attempt) => attempt.reviewError)
          ?.reviewError,
      ).toContain('observed composition');
      h.snapshots.length = 0;
      await h.service.resume(run.id);
      run = await finished(h, run.id);
      expect(provider.calls).toBe(10);
    } else {
      expect(provider.calls).toBe(11);
      expect(provider.receivedPrompts.some((prompt) => prompt.includes('expectedComposition'))).toBe(true);
      expect(provider.receivedReferences.some((refs) => refs.at(-1)?.includes('master'))).toBe(true);
    }
    expect(run.status).toBe('completed');
    expect(
      run.variants[0]?.cards.every(
        (card) =>
          card.attempts.find((attempt) => attempt.id === card.selectedAttemptId)?.review?.compositionMatch ===
          true,
      ),
    ).toBe(true);
  },
);

it('resumes a partially reviewed plan after repeated verifier outages without consuming plan repairs', async () => {
  const provider = new FixtureProvider();
  const originalReview = provider.reviewPlan.bind(provider);
  let unavailable = true;
  const review = vi.spyOn(provider, 'reviewPlan').mockImplementation(async () => {
    if (provider.planReviewCalls > 0 && unavailable) throw new Error('Temporary plan verifier outage');
    return originalReview();
  });
  const h = await harness(provider);
  const started = await h.service.start(brief, settings);
  const interrupted = await finished(h, started.id);
  expect(interrupted.status).toBe('failed');
  expect(interrupted.planHistory?.[0]?.reviews).toHaveLength(1);
  expect(interrupted.planHistory?.[0]?.errors).toEqual([]);
  expect(interrupted.planHistory?.[0]?.reviewError).toBe('Temporary plan verifier outage');
  if (!interrupted.planningPolicy) throw new Error('Missing planning policy');
  interrupted.planningPolicy.maxPlanRepairs = 0;
  await h.repository.save(interrupted);
  h.snapshots.length = 0;
  await h.service.resume(started.id);
  const stillInterrupted = await finished(h, started.id);
  expect(stillInterrupted.planHistory).toHaveLength(1);
  expect(stillInterrupted.planHistory?.[0]?.reviews).toHaveLength(1);
  expect(provider.calls).toBe(0);
  expect(provider.planCalls).toBe(1);
  unavailable = false;
  h.snapshots.length = 0;
  await h.service.resume(started.id);
  const completed = await finished(h, started.id);
  expect(completed.status).toBe('completed');
  expect(completed.planHistory).toHaveLength(1);
  expect(completed.planHistory?.[0]?.reviews).toHaveLength(3);
  expect(completed.planHistory?.[0]?.reviewError).toBeUndefined();
  expect(review).toHaveBeenCalledTimes(5);
  expect(provider.planCalls).toBe(1);
});

it.each([0, 7])(
  'resumes a rejected card with its saved correction and previous image (card %s)',
  async (index) => {
    const h = await harness();
    const started = await h.service.start(
      { ...brief, variants: 1, maxImageCalls: 11 },
      settings,
      StyleContracts.policy.parse({ maxRepairsPerCard: 1 }),
    );
    const run = await finished(h, started.id);
    const variant = run.variants[0];
    const card = variant?.cards[index];
    const previous = card?.attempts[0];
    if (!variant || !card || !previous) throw new Error('Missing card fixture');
    const correction = 'Restore the broad painted highlights on the saved candidate';
    previous.review = { ...pass, passed: false, style: 2, correction };
    variant.review = null;
    run.status = 'paused';
    await h.repository.save(run);
    h.snapshots.length = 0;
    await h.service.resume(run.id);
    const completed = await finished(h, run.id);
    expect(completed.status).toBe('completed');
    expect(h.provider.calls).toBe(11);
    expect(h.provider.receivedPrompts.at(-1)).toContain(correction);
    expect(h.provider.receivedReferences.at(-1)).toContain(
      path.join(h.repository.directory(run.id), previous.master),
    );
    expect(completed.variants[0]?.cards[index]?.attempts).toHaveLength(2);
  },
);

it.each([false, true])(
  'requires clean-sheet evidence for v3 and passes primary references first (missing=%s)',
  async (missing) => {
    class CleanProvider extends FixtureProvider {
      dimensions: Array<number | undefined> = [];
      override async reviewSet(variant: Variant, sheet: string, profile: Profile, references: string[] = []) {
        const size = await sharp(sheet).metadata();
        this.dimensions = [size.width, size.height];
        await super.reviewSet(variant, sheet, profile, references);
        return Contracts.detailedSetReview.parse({
          passed: true,
          coherence: 5,
          findings: [],
          outlierCardIds: [],
          assessment: {
            styleCompatibility: 5,
            thematicCohesion: 5,
            silhouetteDiversity: 5,
            materialDiversity: 5,
            paletteBalance: 5,
            compositionBalance: 5,
            categoryCoverage: true,
            redundantSubjects: false,
          },
          corrections: [],
        });
      }
    }
    const corpus = KnowledgeContracts.corpus.parse({
      version: 1,
      documents: [],
      images: ['a', 'b'].map((id) => ({
        id,
        title: id,
        source: 'fixture',
        filename: `images/sets/${id}.png`,
        sha256: '1'.repeat(64),
        role: 'collection-example',
        category: null,
      })),
      cleanSets: ['a', 'b'].map((id) => ({
        sourceImageId: id,
        sourceSha256: '1'.repeat(64),
        filename: `images/clean-sets/${id}.png`,
        sha256: '2'.repeat(64),
        layout: {
          columns: 5,
          rows: 2,
          cardWidth: 430,
          cardHeight: 480,
          gap: 16,
          margin: 16,
          background: '#eceae5',
        },
        method: 'original-card-assembly-v1',
        primaryEligible: true,
        cards: Array.from({ length: 10 }, (_, i) => ({
          slot: i + 1,
          id: `${id}-${i}`,
          filename: `${id}-${i}.png`,
          sha256: '3'.repeat(64),
          source: 'fixture',
          use: 'ordinary',
          match: { error: 0, runnerUpError: 100 },
        })),
      })),
    });
    const context: SourceContextPort = {
      async prepare(stage, _brief, receivedProfile) {
        const evidence = KnowledgeContracts.evidence.parse({
          version: 1,
          stage,
          model: 'fixture',
          createdAt: new Date().toISOString(),
          documents: [],
          guidance: 'fixture',
          images: corpus.images.map((image) => ({
            ...image,
            attached: false,
            reason: 'secondary source',
            analysis: {
              summary: 'Original set',
              theme: 'Fixture',
              semanticPrinciples: [],
              visualPrinciples: [],
              objectRoles: [],
              avoidTransferring: [],
              ordinarySetExample: true,
            },
          })),
          cleanSets:
            stage === 'set-review' && !missing
              ? corpus.cleanSets?.map((sheet) => ({
                  ...sheet,
                  reason: 'primary clean reference',
                  attached: true,
                }))
              : undefined,
        });
        return {
          profile: { ...receivedProfile, knowledgeContext: evidence },
          referencePaths: stage === 'set-review' ? ['/clean/a.png', '/clean/b.png'] : [],
          evidence,
        };
      },
    };
    const provider = new CleanProvider(),
      h = await harness(provider, undefined, context, { ...profile, knowledge: corpus });
    const started = await h.service.start(
      { ...brief, variants: 1, maxImageCalls: 10 },
      settings,
      StyleContracts.policy.parse({}),
    );
    const result = await finished(h, started.id);
    expect(result.reviewProtocol).toBe('set-v3');
    expect(provider.calls).toBe(10);
    if (missing) {
      expect(result.status).toBe('paused');
      expect(provider.setReferences).toHaveLength(0);
    } else {
      expect(result.status).toBe('completed');
      expect(provider.dimensions).toEqual([2246, 1008]);
      expect(provider.setReferences[0]?.slice(0, 2)).toEqual(['/clean/a.png', '/clean/b.png']);
      const variant = result.variants[0];
      if (!variant) throw new Error('Fixture missing');
      expect(SetRules.hasCleanSetEvidence(variant)).toBe(true);
      expect(variant.reviewHistory?.[0]?.sheet).toBe(variant.reviewSheet);
      expect(variant.reviewHistory?.[0]?.prompt).toBe(variant.reviewPrompt);
      await expect(
        fs.access(path.join(h.repository.directory(result.id), variant.reviewSheet ?? '')),
      ).resolves.toBeUndefined();
      const first = variant.cards[0]?.attempts[0];
      if (!first) throw new Error('Fixture missing');
      const preview = path.join(h.repository.directory(result.id), first.preview);
      const original = await fs.readFile(preview);
      const changed = await sharp({ create: { width: 430, height: 480, channels: 3, background: '#334455' } })
        .png()
        .toBuffer();
      const receipt = first.hashes;
      delete first.hashes;
      await fs.writeFile(preview, changed);
      await expect(
        new ExportService(h.images).export(
          result,
          variant.id,
          h.repository.directory(result.id),
          path.join(h.root, 'changed-legacy.zip'),
        ),
      ).rejects.toThrow('no longer matches');
      await fs.writeFile(preview, original);
      first.hashes = receipt;
      variant.sourceEvidence = undefined;
      await expect(
        new ExportService(h.images).export(
          result,
          variant.id,
          h.repository.directory(result.id),
          path.join(h.root, 'no-evidence.zip'),
        ),
      ).rejects.toThrow('passed');
    }
  },
);

it('snapshots active rules and reference metadata before asynchronous startup and applies edits only to later runs', async () => {
  const h = await harness();
  const originalReference = StyleContracts.libraryItem.parse({
    id: 'curated',
    filename: 'curated.png',
    title: 'A source object.',
    category: '1',
    sha256: 'fixture',
    source: 'fixture',
    metadata: { category: '1', description: 'A floating brass magnifier.' },
  });
  h.service.updateProfile({ ...profile, library: [originalReference] });
  const pending = h.service.start({ ...brief, variants: 1 }, settings);
  const revised = {
    ...profile,
    rules: ['Use the revised English art direction consistently.'],
    library: [
      {
        ...originalReference,
        metadata: { category: '3' as const, description: 'A brass magnifier on a wooden desk.' },
      },
    ],
    categories: { ...profile.categories, '1': 'A floating object with a sparse patterned background.' },
  };
  h.service.updateProfile(revised);
  const first = await pending;
  await finished(h, first.id);
  const frozenRules = (await h.repository.getProfile(first.id)).rules;
  expect(frozenRules).toHaveLength(profile.rules.length);
  expect(frozenRules).toEqual(
    expect.arrayContaining(profile.rules.filter((rule) => !contentModes.ordinaryClauses.includes(rule))),
  );
  expect(frozenRules).toContain(contentModes.scopedClause);
  expect((await h.repository.getProfile(first.id)).analysisModel).toBe(settings.codexModel);
  expect((await h.repository.getProfile(first.id)).library?.[0]?.metadata?.category).toBe('1');
  h.snapshots.length = 0;
  const second = await h.service.start({ ...brief, variants: 1 }, settings);
  await finished(h, second.id);
  expect((await h.repository.getProfile(second.id)).rules).toEqual(revised.rules);
  expect((await h.repository.getProfile(second.id)).library?.[0]?.metadata?.category).toBe('3');
});

it('retries unavailable reviews without generating replacements, even with zero repair allowance', async () => {
  const provider = new FixtureProvider();
  provider.rejectReview = true;
  const h = await harness(provider);
  const started = await h.service.start(
    { ...brief, variants: 1, maxImageCalls: 10 },
    settings,
    StyleContracts.policy.parse({ maxRepairsPerCard: 0 }),
  );
  const paused = await finished(h, started.id);
  const firstId = paused.variants[0]?.cards[0]?.selectedAttemptId;
  expect(paused.imageCalls).toBe(10);
  provider.rejectReview = false;
  h.snapshots.length = 0;
  await h.service.resume(started.id);
  const completed = await finished(h, started.id);
  expect(completed.status).toBe('completed');
  expect(completed.imageCalls).toBe(10);
  expect(completed.variants[0]?.cards[0]?.selectedAttemptId).toBe(firstId);
  expect(completed.variants[0]?.cards.every((card) => card.attempts.length === 1)).toBe(true);
});
it('rechecks an unverified card without requiring more image budget', async () => {
  class ReviewFailureProvider extends FixtureProvider {
    fail = true;
    override async review(
      card: Card,
      image: string,
      references: string[],
      profile: Profile,
    ): Promise<Review> {
      if (this.fail && card.subject.endsWith('/7')) throw new Error('Temporary verifier failure');
      return super.review(card, image, references, profile);
    }
  }
  const provider = new ReviewFailureProvider();
  const h = await harness(provider);
  const started = await h.service.start(
    { ...brief, variants: 1, maxImageCalls: 10 },
    settings,
    StyleContracts.policy.parse({ maxRepairsPerCard: 0 }),
  );
  expect((await finished(h, started.id)).status).toBe('paused');
  expect(provider.calls).toBe(10);
  provider.fail = false;
  h.snapshots.length = 0;
  await h.service.resume(started.id);
  expect((await finished(h, started.id)).status).toBe('completed');
  expect(provider.calls).toBe(10);
});
it('refuses export after selected image bytes change without changing the attempt ID', async () => {
  const h = await harness();
  const started = await h.service.start({ ...brief, variants: 1 }, settings);
  const completed = await finished(h, started.id);
  const variant = completed.variants[0],
    attempt = variant?.cards[0]?.attempts[0];
  if (!variant || !attempt) throw new Error('Missing fixture');
  const changed = await sharp({ create: { width: 430, height: 480, channels: 3, background: '#aa2277' } })
    .png()
    .toBuffer();
  await fs.writeFile(path.join(h.repository.directory(started.id), attempt.preview), changed);
  const destination = path.join(h.root, 'unreviewed.zip');
  await expect(
    new ExportService(h.images).export(
      completed,
      variant.id,
      h.repository.directory(started.id),
      destination,
    ),
  ).rejects.toThrow('bytes have changed');
  await expect(fs.access(destination)).rejects.toThrow();
});

it('publishes only the saved pause state while the workflow is still saving its final state', async () => {
  let releasePreparation = () => {};
  const preparationGate = new Promise<void>((resolve) => {
    releasePreparation = resolve;
  });
  let finalSaveStarted = () => {};
  const finalSavePending = new Promise<void>((resolve) => {
    finalSaveStarted = resolve;
  });
  let releaseFinalSave = () => {};
  const finalSaveGate = new Promise<void>((resolve) => {
    releaseFinalSave = resolve;
  });
  const initialize = vi.fn(() => preparationGate);
  const h = await harness(new FixtureProvider(), {
    initialize,
    prepare: async () => {
      throw new Error('Paused preparation must not generate cards');
    },
  });
  const save = h.repository.save.bind(h.repository);
  vi.spyOn(h.repository, 'save').mockImplementation(async (run) => {
    if (run.status === 'paused') {
      finalSaveStarted();
      await finalSaveGate;
    }
    await save(run);
    if (run.stage === 'Pausing the queue. Waiting for in-flight requests to finish.') {
      releasePreparation();
      await finalSavePending;
    }
  });
  const run = await h.service.start({ ...brief, variants: 1 }, settings);
  await vi.waitFor(() => expect(initialize).toHaveBeenCalledOnce());
  let published: Run | undefined;
  let persisted: Run | undefined;
  try {
    await h.service.pause(run.id);
    published = h.snapshots.at(-1);
    persisted = await h.repository.get(run.id);
    await expect(h.service.remove(run.id)).rejects.toThrow('active run');
  } finally {
    releaseFinalSave();
    await finished(h, run.id);
  }
  expect(published?.status).toBe('planning');
  expect(published).toEqual(persisted);
  expect((await h.repository.get(run.id)).status).toBe('paused');
  expect(h.provider.calls).toBe(0);
  await h.service.remove(run.id);
  expect(await h.repository.list()).toEqual([]);
});

it('blocks deleting in-flight work and moves the entire paused project out of history', async () => {
  const provider = new FixtureProvider();
  let release = () => {};
  provider.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const h = await harness(provider);
  const run = await h.service.start({ ...brief, variants: 1 }, settings);
  await expect(h.service.remove(run.id)).rejects.toThrow('active run');
  await vi.waitFor(() => expect(provider.calls).toBeGreaterThan(0));
  await h.service.pause(run.id);
  await expect(h.service.remove(run.id)).rejects.toThrow('active run');
  release();
  await finished(h, run.id);
  await fs.writeFile(path.join(h.repository.directory(run.id), 'keep-with-project.txt'), 'fixture');
  await fs.writeFile(path.join(h.root, 'exported.zip'), 'independent export');
  await vi.waitFor(() => h.service.remove(run.id));
  expect(await h.repository.list()).toEqual([]);
  expect(
    await fs.readFile(
      path.join(h.repository.directory(run.id) + '.trashed', 'keep-with-project.txt'),
      'utf8',
    ),
  ).toBe('fixture');
  expect(await fs.readFile(path.join(h.root, 'exported.zip'), 'utf8')).toBe('independent export');
  await expect(h.service.resume(run.id)).rejects.toThrow();
});

it('preserves the project if Trash fails and rejects invalid deletion paths', async () => {
  const h = await harness();
  const run = await h.service.start({ ...brief, variants: 1 }, settings);
  await finished(h, run.id);
  const trash = vi.fn(async () => {
    throw new Error('Trash unavailable');
  });
  const repository = new RunRepository(h.root, trash);
  await expect(repository.remove('../outside')).rejects.toThrow();
  expect(trash).not.toHaveBeenCalled();
  await expect(repository.remove(run.id)).rejects.toThrow('Trash unavailable');
  expect((await repository.get(run.id)).id).toBe(run.id);
  const stillUsable = await repository.get(run.id);
  await repository.save(stillUsable);
  expect(await repository.list()).toHaveLength(1);
});

it('automatically delivers all ten cards with visible warnings after rejected plans, cards and set checks', async () => {
  const provider = new FixtureProvider();
  provider.rejectPlan = true;
  provider.badReviews = true;
  provider.rejectReview = true;
  const h = await harness(provider, undefined, undefined, undefined, 'best-effort-v1');
  const started = await h.service.start(
    { ...brief, variants: 1, maxImageCalls: 20 },
    settings,
    StyleContracts.policy.parse({ maxRepairsPerCard: 1 }),
  );
  const result = await finished(h, started.id);
  expect(result.status).toBe('completed');
  expect(result.variants[0]?.cards).toHaveLength(10);
  expect(result.variants[0]?.cards.every((card) => Boolean(card.selectedAttemptId))).toBe(true);
  expect(result.variants[0]?.planReview?.passed).toBe(false);
  expect(provider.planCalls).toBe(2);
  expect(provider.calls).toBeGreaterThanOrEqual(10);
  expect(provider.calls).toBeLessThanOrEqual(20);
  expect(result.qualityWarnings?.length).toBeGreaterThan(10);
  expect(DeliveryReadiness.accepts(result, result.variants[0])).toBe(true);
  const variant = result.variants[0];
  if (!variant) throw new Error('Missing fixture variant');
  const file = path.join(h.root, 'with-warnings.zip');
  await new ExportService(h.images).export(result, variant.id, h.repository.directory(result.id), file);
  const zip = new AdmZip(await fs.readFile(file));
  expect(zip.readAsText('quality-warnings.json')).toContain('Disconnected story');
  expect(result.planHistory?.every((entry) => entry.reviews[0]?.passed === false)).toBe(true);
});

it('continues generation when independent checks are unavailable without fabricating passed reviews', async () => {
  const provider = new FixtureProvider();
  vi.spyOn(provider, 'reviewPlan').mockRejectedValue(new Error('Plan verification unavailable'));
  vi.spyOn(provider, 'review').mockRejectedValue(new Error('Card verification unavailable'));
  vi.spyOn(provider, 'reviewSet').mockRejectedValue(new Error('Set verification unavailable'));
  const h = await harness(provider, undefined, undefined, undefined, 'best-effort-v1');
  const started = await h.service.start({ ...brief, variants: 1, maxImageCalls: 10 }, settings);
  const result = await finished(h, started.id);
  expect(result.status).toBe('completed');
  expect(provider.calls).toBe(10);
  expect(result.planHistory?.[0]?.reviewError).toContain('Plan verification unavailable');
  expect(result.variants[0]?.planReview).toBeUndefined();
  expect(result.variants[0]?.review).toBeNull();
  expect(
    result.variants[0]?.cards.every((card) => card.attempts.every((attempt) => attempt.review === null)),
  ).toBe(true);
  expect(result.qualityWarnings?.join(' ')).toContain('verification unavailable');
  expect(DeliveryReadiness.accepts(result, result.variants[0])).toBe(true);
});

function slotFirstProfile(catalog = CompositionFixture.create().catalog): Profile {
  const library = catalog.cards.map((card) =>
    StyleContracts.libraryItem.parse({
      ...card,
      title: card.observation.subject,
      category: card.observation.category,
      source: 'fixture',
    }),
  );
  return Contracts.profile.parse({
    ...profile,
    visualCatalog: catalog,
    library,
    references: library,
    compositionPlanning: CompositionPlanningContracts.defaults,
  });
}

it('excludes earlier runs and other variants from new color-family layouts', async () => {
  const h = await harness(
    new FixtureProvider(),
    undefined,
    undefined,
    slotFirstProfile(VisualCatalogContracts.catalog.parse(sourceCatalog)),
    'best-effort-v1',
  );
  const keys: string[] = [];
  for (let request = 0; request < 2; request++) {
    const started = await h.service.start({ ...brief, variants: 2, maxImageCalls: 20 }, settings);
    const run = await finished(h, started.id);
    expect(run.status).toBe('completed');
    expect((await h.repository.getProfile(run.id)).previousRhythmLayouts).toEqual(keys);
    for (const variant of run.variants) {
      const composition = variant.artContract?.composition;
      if (!composition) throw new Error('Missing composition');
      const key = SetRhythmPlanner.layoutKey(composition);
      expect(keys).not.toContain(key);
      keys.push(key);
    }
  }
  expect(new Set(keys).size).toBe(4);
});

it.each([false, true])(
  'blocks a recurring gold hero before images and respects bounded plan repair (persistent=%s)',
  async (persistent) => {
    const provider = new FixtureProvider();
    const h = await harness(
      provider,
      undefined,
      undefined,
      slotFirstProfile(VisualCatalogContracts.catalog.parse(sourceCatalog)),
      'best-effort-v1',
    );
    const original = provider.designSlotSet.bind(provider);
    let calls = 0;
    const port: GenerationPort = provider;
    const design = vi.spyOn(port, 'designSlotSet').mockImplementation(async (...args) => {
      expect(provider.calls).toBe(0);
      const result = await original(args[0], args[1], args[2]);
      const gold = result.variants[0]?.cards.filter((card) => card.compatibleCategories.includes('5'));
      const first = gold?.[0]?.depictedEntities?.[0];
      const second = gold?.[1]?.depictedEntities;
      if (!first || !second) throw new Error('Missing gold actors');
      if (++calls === 1 || persistent) second[0] = first;
      return result;
    });
    const started = await h.service.start(
      { ...brief, variants: 1, includeGold: true, maxImageCalls: 10 },
      settings,
    );
    const result = await finished(h, started.id);
    expect(design).toHaveBeenCalledTimes(2);
    expect(result.planHistory?.[0]?.errors.join(' ')).toContain('Duplicate depicted entity');
    expect(design.mock.calls[1]?.[2]).toEqual(design.mock.calls[0]?.[2]);
    expect(design.mock.calls[1]?.[4]).toContain('previousDesign');
    expect(result.status).toBe(persistent ? 'failed' : 'completed');
    expect(provider.calls).toBe(persistent ? 0 : 10);
    const saved = await h.repository.getProfile(started.id);
    expect(saved.entityUniqueness).toBe('depicted-entities-v1');
  },
);

it.each(['subject', 'subjectType', 'missing-type'] as const)(
  'repairs multi-set %s conflicts before images while preserving slots and supplying the rejected design',
  async (mode) => {
    const provider = new FixtureProvider();
    const h = await harness(provider, undefined, undefined, slotFirstProfile(), 'best-effort-v1');
    const port: GenerationPort = provider;
    const original = provider.designSlotSet.bind(provider);
    let attempts = 0;
    const design = vi.spyOn(port, 'designSlotSet').mockImplementation(async (input, supplied, slots) => {
      expect(supplied.subjectUniqueness).toBe('batch-unique-v1');
      expect(provider.calls).toBe(0);
      const response = await original(input, supplied, slots);
      if (++attempts === 1) {
        const first = response.variants[0]?.cards[0];
        const second = response.variants[1]?.cards[3];
        if (!first || !second) throw new Error('Missing fixture subjects');
        if (mode === 'subject') second.subject = first.subject;
        else if (mode === 'subjectType') second.subjectType = first.subjectType;
        else
          return CompositionPlanningContracts.assignedSubjects.parse({
            variants: response.variants.map((variant) => ({
              ...variant,
              cards: variant.cards.map((card) => ({ ...card, subjectType: undefined })),
            })),
          });
      }
      return response;
    });
    const started = await h.service.start({ ...brief, variants: 2, maxImageCalls: 20 }, settings);
    const result = await finished(h, started.id);
    expect(result.status).toBe('completed');
    expect(design).toHaveBeenCalledTimes(2);
    expect(design.mock.calls[1]?.[2]).toEqual(design.mock.calls[0]?.[2]);
    expect(result.planHistory?.[0]?.errors.length).toBeGreaterThan(0);
    if (mode !== 'missing-type') {
      const feedback: unknown = JSON.parse(design.mock.calls[1]?.[4] ?? '{}');
      expect(feedback).toMatchObject({
        previousDesign: result.planHistory?.[0]?.compositionDraft?.assignedSubjects,
      });
      expect(design.mock.calls[1]?.[4]).toContain('set 2, slot 4');
    }
    const cards = result.variants.flatMap((variant) => variant.cards);
    expect(new Set(cards.map((card) => card.subjectType)).size).toBe(20);
    expect(provider.calls).toBe(20);
    expect(provider.planReviewCalls).toBe(0);
    expect((await h.repository.getProfile(result.id)).subjectUniqueness).toBe('batch-unique-v1');
    const variant = result.variants[0];
    if (!variant) throw new Error('Missing generated set');
    const file = path.join(h.root, 'batch-unique.zip');
    await new ExportService(h.images).export(result, variant.id, h.repository.directory(result.id), file);
    const zip = new AdmZip(await fs.readFile(file));
    expect(zip.readAsText('run.json')).toContain('"subjectType"');
    expect(zip.readAsText('style-profile.json')).toContain('batch-unique-v1');
  },
);

it('never falls back to a duplicate multi-set plan after the correction budget is exhausted', async () => {
  const provider = new FixtureProvider();
  const h = await harness(provider, undefined, undefined, slotFirstProfile(), 'best-effort-v1');
  const port: GenerationPort = provider;
  const original = provider.designSlotSet.bind(provider);
  const design = vi.spyOn(port, 'designSlotSet').mockImplementation(async (input, supplied, slots) => {
    const response = await original(input, supplied, slots);
    const first = response.variants[0]?.cards[0];
    const second = response.variants[1]?.cards[0];
    if (!first || !second) throw new Error('Missing fixture subjects');
    second.subjectType = first.subjectType;
    return response;
  });
  const started = await h.service.start({ ...brief, variants: 2, maxImageCalls: 20 }, settings);
  const result = await finished(h, started.id);
  expect(result.status).toBe('failed');
  expect(result.variants).toEqual([]);
  expect(result.planHistory).toHaveLength(2);
  expect(
    result.planHistory?.every((entry) => entry.errors.some((error) => error.includes('Duplicate subjects'))),
  ).toBe(true);
  expect(design).toHaveBeenCalledTimes(2);
  expect(provider.calls).toBe(0);
});

it('freezes slots and reference candidates before one design call, skips redundant planning LLMs and still checks all images', async () => {
  const { catalog } = CompositionFixture.create();
  const provider = new FixtureProvider();
  const library = catalog.cards.map((card) =>
    StyleContracts.libraryItem.parse({
      ...card,
      title: card.observation.subject,
      category: card.observation.category,
      source: 'fixture',
    }),
  );
  const source = Contracts.profile.parse({
    ...profile,
    visualCatalog: catalog,
    library,
    references: library,
    compositionPlanning: CompositionPlanningContracts.defaults,
  });
  const h = await harness(provider, undefined, undefined, source, 'best-effort-v1');
  const original = provider.designSlotSet.bind(provider);
  const design = vi.spyOn(provider, 'designSlotSet').mockImplementation(async (...args) => {
    const snapshot = h.snapshots.at(-1);
    expect(snapshot?.compositionDraft?.slotPlans?.[0]?.slots).toHaveLength(10);
    expect(snapshot?.imageCalls).toBe(0);
    expect(args[2][0]?.slots.every((slot) => (slot.target.referenceIds?.length ?? 0) >= 2)).toBe(true);
    return original(...args);
  });
  const describe = vi.spyOn(provider, 'describeComposition');
  const subjects = vi.spyOn(provider, 'proposeSubjects');
  vi.spyOn(provider, 'review').mockImplementation(async (card, _image, _refs, supplied) => {
    const index = Number(card.subject.split(' ').at(-1));
    const target = supplied.activeArtContract?.composition?.targets.find((target) => target.index === index);
    if (!target) throw new Error('Missing assigned target');
    return {
      ...pass,
      observedComposition: {
        support: 'none',
        backdrop: 'pattern',
        pattern: 'stripes',
        depth: 'flat',
        contextDensity: 'none',
        camera: 'front',
        subjectScale: 'large',
        characterCount: 0,
        ...target.preferred,
        ...target.required,
      },
    };
  });
  const started = await h.service.start({ ...brief, variants: 1, maxImageCalls: 10 }, settings);
  const result = await finished(h, started.id);
  expect(result.status).toBe('completed');
  expect(design).toHaveBeenCalledOnce();
  expect(describe).not.toHaveBeenCalled();
  expect(subjects).not.toHaveBeenCalled();
  expect(provider.planCalls).toBe(0);
  expect(provider.planReviewCalls).toBe(0);
  expect(provider.calls).toBe(10);
  expect(provider.setReviewProfiles).toHaveLength(1);
  expect(result.variants[0]?.cards.every((card) => card.attempts[0]?.review?.compositionMatch === true)).toBe(
    true,
  );
  expect(result.variants[0]?.planValidation).toBe('deterministic-slots-first-v1');
  expect(Object.hasOwn(result.variants[0]?.artContract ?? {}, 'pilotIndex')).toBe(false);
  expect(result.qualityWarnings).toEqual([]);
  expect((await h.repository.getProfile(result.id)).referenceSelection).toBe('catalogue-v1');
  expect((await h.repository.getProfile(result.id)).subjectUniqueness).toBeUndefined();
  expect((await h.repository.getProfile(result.id)).entityUniqueness).toBe('depicted-entities-v1');
  expect(result.variants[0]?.cards.every((card) => card.subjectType && card.depictedEntities?.length)).toBe(
    true,
  );
});

it('freezes shuffled per-variant references across pause/resume and sends their saved order to image generation', async () => {
  const { catalog } = CompositionFixture.create();
  const library = catalog.cards.map((card) =>
    StyleContracts.libraryItem.parse({
      ...card,
      title: card.observation.subject,
      category: card.observation.category,
      source: 'fixture',
    }),
  );
  const provider = new FixtureProvider();
  const h = await harness(
    provider,
    undefined,
    undefined,
    Contracts.profile.parse({
      ...profile,
      visualCatalog: catalog,
      library,
      references: library,
      compositionPlanning: CompositionPlanningContracts.defaults,
    }),
    'best-effort-v1',
  );
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = provider.designSlotSet.bind(provider);
  const design = vi.spyOn(provider, 'designSlotSet').mockImplementation(async (...args) => {
    await gate;
    return original(...args);
  });
  const started = await h.service.start({ ...brief, variants: 2, maxImageCalls: 21 }, settings);
  await vi.waitFor(() => expect(design).toHaveBeenCalledOnce());
  await h.service.pause(started.id);
  release();
  const paused = await finished(h, started.id);
  const plans = paused.compositionDraft?.slotPlans;
  if (!plans || plans.length !== 2) throw new Error('Missing frozen variants');
  const selections = plans.map((plan) => plan.slots.map((slot) => slot.target.selectedReferenceIds));
  h.snapshots.length = 0;
  await h.service.resume(started.id);
  const result = await finished(h, started.id);
  expect(result.status).toBe('completed');
  expect(design).toHaveBeenCalledOnce();
  expect(result.compositionDraft?.slotPlans).toEqual(plans);
  expect((await h.repository.getProfile(result.id)).subjectUniqueness).toBe('batch-unique-v1');
  expect(
    new Set(result.variants.flatMap((variant) => variant.cards.map((card) => card.subjectType))).size,
  ).toBe(20);
  for (const [index, variant] of result.variants.entries()) {
    expect(variant.artContract?.composition?.targets.map((target) => target.selectedReferenceIds)).toEqual(
      selections[index],
    );
    for (const target of variant.artContract?.composition?.targets ?? []) {
      const files = target.selectedReferenceIds?.map((id) => {
        const reference = library.find((item) => item.id === id);
        if (!reference) throw new Error('Missing selected original');
        return path.join('/test-references', reference.filename);
      });
      expect(provider.receivedReferences).toContainEqual(files);
    }
  }
  const card = result.variants[0]?.cards[0];
  const firstIds = selections[0]?.[0];
  if (!card || !firstIds) throw new Error('Missing regeneration fixture');
  h.snapshots.length = 0;
  await h.service.retry(started.id, card.id, '');
  const regenerated = await finished(h, started.id);
  expect(regenerated.compositionDraft?.slotPlans).toEqual(plans);
  expect(provider.receivedReferences.at(-1)).toEqual(
    firstIds.map((id) => {
      const reference = library.find((item) => item.id === id);
      if (!reference) throw new Error('Missing selected original');
      return path.join('/test-references', reference.filename);
    }),
  );
});

it('resumes historical multi-set drafts without adding the new policy or requiring subject types', async () => {
  const provider = new FixtureProvider();
  const h = await harness(provider, undefined, undefined, slotFirstProfile(), 'best-effort-v1');
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = provider.designSlotSet.bind(provider);
  const design = vi.spyOn(provider, 'designSlotSet').mockImplementation(async (...args) => {
    await gate;
    return original(...args);
  });
  const started = await h.service.start({ ...brief, variants: 2, maxImageCalls: 20 }, settings);
  await vi.waitFor(() => expect(design).toHaveBeenCalledOnce());
  await h.service.pause(started.id);
  release();
  const paused = await finished(h, started.id);
  const saved = await h.repository.getProfile(started.id);
  delete saved.subjectUniqueness;
  delete saved.entityUniqueness;
  await h.repository.saveProfile(started.id, saved);
  const assigned = paused.compositionDraft?.assignedSubjects;
  if (!assigned) throw new Error('Missing historical slot design');
  for (const variant of assigned.variants)
    for (const card of variant.cards) {
      delete card.subjectType;
      delete card.depictedEntities;
      card.subject = `Legacy object ${card.index}`;
    }
  await h.repository.save(paused);
  h.snapshots.length = 0;
  await h.service.resume(started.id);
  const result = await finished(h, started.id);
  expect(result.status).toBe('completed');
  expect(design).toHaveBeenCalledOnce();
  expect(provider.calls).toBe(20);
  expect((await h.repository.getProfile(started.id)).subjectUniqueness).toBeUndefined();
  expect(
    result.variants.every((variant) => variant.cards.every((card) => card.subjectType === undefined)),
  ).toBe(true);
  expect(result.variants[0]?.cards.map((card) => card.subject)).toEqual(
    result.variants[1]?.cards.map((card) => card.subject),
  );
});

it.each(['compatibility', 'invalid-schema'] as const)(
  'repairs %s errors without changing frozen slots or references',
  async (mode) => {
    const { catalog } = CompositionFixture.create();
    const provider = new FixtureProvider();
    const library = catalog.cards.map((card) =>
      StyleContracts.libraryItem.parse({
        ...card,
        title: card.observation.subject,
        category: card.observation.category,
        source: 'fixture',
      }),
    );
    const h = await harness(
      provider,
      undefined,
      undefined,
      Contracts.profile.parse({
        ...profile,
        visualCatalog: catalog,
        library,
        references: library,
        compositionPlanning: CompositionPlanningContracts.defaults,
      }),
      'best-effort-v1',
    );
    const original = provider.designSlotSet.bind(provider);
    let attempts = 0;
    const design = vi.spyOn(provider, 'designSlotSet').mockImplementation(async (...args) => {
      const result = await original(...args);
      attempts++;
      if (mode === 'invalid-schema') return attempts === 1 ? { variants: [] } : result;
      const card = result.variants[0]?.cards[0];
      const target = args[2][0]?.slots[0]?.target;
      if (!card || !target) throw new Error('Missing assigned slot');
      card.compatibleComposition.support = [target.required.support === 'none' ? 'simple-plane' : 'none'];
      return result;
    });
    const started = await h.service.start({ ...brief, variants: 1, maxImageCalls: 10 }, settings);
    const result = await finished(h, started.id);
    const initial = design.mock.calls[0]?.[2][0]?.composition.targets;
    expect(design).toHaveBeenCalledTimes(2);
    expect(design.mock.calls[1]?.[2][0]?.composition.targets).toEqual(initial);
    expect(result.variants[0]?.artContract?.composition?.targets).toEqual(initial);
    expect(initial?.every((target) => target.selectedReferenceIds?.length === 2)).toBe(true);
    if (mode === 'compatibility')
      expect(result.variants[0]?.artContract?.warnings?.join(' ')).toContain(
        'Original slot patterns and references are unchanged',
      );
    else expect(result.variants[0]?.artContract?.warnings).toEqual([]);
    expect(result.status).toBe('completed');
    expect(provider.calls).toBe(10);
  },
);

it('creates ten images with composition-only observations, no artistic scoring or automatic repairs, and supports blank manual regeneration', async () => {
  class CompositionOnlyProvider extends FixtureProvider {
    observations = 0;
    async verifyComposition() {
      this.observations++;
      return Contracts.compositionObservation.parse({
        subjectPresent: false,
        completeSilhouette: true,
        compositionDescriptionMatch: false,
        observedCategory: '1',
        findings: ['Фон не соответствует слоту'],
        observedComposition: {
          support: 'none',
          backdrop: 'pattern',
          pattern: 'rays',
          depth: 'shallow',
          contextDensity: 'none',
          camera: 'front',
          subjectScale: 'large',
          characterCount: 0,
          backgroundColor: 'blue',
          subjectPosition: 'center',
        },
      });
    }
    override async review(): Promise<Review> {
      throw new Error('Artistic scoring must not run');
    }
    override async reviewSet(): Promise<SetReview> {
      throw new Error('Whole-set scoring must not run');
    }
  }
  const provider = new CompositionOnlyProvider();
  const h = await harness(provider);
  const started = await h.service.start(
    { ...brief, variants: 1, autoRepair: true, maxImageCalls: 30 },
    { ...settings, planningModel: 'gpt-6.1-terra' },
    StyleContracts.policy.parse({ maxRepairsPerCard: 4 }),
  );
  let run = await finished(h, started.id);
  expect(run.status).toBe('completed');
  expect(run.reviewProtocol).toBe('composition-v1');
  expect(run.planningModel).toBe('gpt-6.1-terra');
  expect(run.brief.autoRepair).toBe(false);
  expect(run.productionPolicy?.maxRepairsPerCard).toBe(0);
  expect(run.imageCalls).toBe(10);
  expect(provider.observations).toBe(10);
  expect(run.qualityWarnings).toBeUndefined();
  const variant = run.variants[0],
    card = variant?.cards[0];
  if (!variant || !card) throw new Error('Missing fixture');
  expect(card.attempts[0]?.review).toBeNull();
  expect(card.attempts[0]?.compositionCheck?.matches).toBe(false);
  expect(DeliveryReadiness.accepts(run, variant)).toBe(true);
  h.snapshots.length = 0;
  await h.service.retry(run.id, card.id, '');
  run = await finished(h, run.id);
  expect(run.imageCalls).toBe(11);
  const revised = run.variants[0]?.cards[0];
  expect(revised?.attempts).toHaveLength(2);
  expect(revised?.selectedAttemptId).toBe(revised?.attempts[1]?.id);
  expect(provider.observations).toBe(11);
  const original = revised?.attempts[0];
  if (!original) throw new Error('Missing first version');
  await h.service.selectAttempt(run.id, card.id, original.id);
  run = await h.repository.get(run.id);
  expect(run.status).toBe('completed');
  expect(DeliveryReadiness.accepts(run, run.variants[0])).toBe(true);
  await new ExportService(h.images).export(
    run,
    variant.id,
    h.repository.directory(run.id),
    path.join(h.root, 'composition.zip'),
  );
  const zip = new AdmZip(path.join(h.root, 'composition.zip'));
  expect(zip.readAsText('report.md')).not.toContain('/5');
});

it('records an explicit protocol transition for a manual revision of an archived run and retains its prior scores', async () => {
  class UpgradableProvider extends FixtureProvider {
    enabled = false;
    observations = 0;
    get verifyComposition() {
      return this.enabled
        ? async () => {
            this.observations++;
            return Contracts.compositionObservation.parse({
              subjectPresent: true,
              completeSilhouette: true,
              compositionDescriptionMatch: true,
              observedCategory: '1',
              findings: [],
              observedComposition: {
                support: 'none',
                backdrop: 'pattern',
                pattern: 'rays',
                depth: 'shallow',
                contextDensity: 'none',
                camera: 'front',
                subjectScale: 'large',
                characterCount: 0,
                backgroundColor: 'blue',
                subjectPosition: 'center',
              },
            });
          }
        : undefined;
    }
  }
  const provider = new UpgradableProvider();
  const h = await harness(provider);
  const initial = await h.service.start({ ...brief, variants: 1, maxImageCalls: 20 }, settings);
  const archived = await finished(h, initial.id);
  expect(archived.reviewProtocol).toBeUndefined();
  const card = archived.variants[0]?.cards[0];
  if (!card) throw new Error('Missing card');
  const oldAttempt = structuredClone(card.attempts[0]);
  provider.enabled = true;
  h.snapshots.length = 0;
  await h.service.retry(archived.id, card.id, '', undefined, settings);
  const updated = await finished(h, archived.id);
  expect(updated.reviewProtocol).toBe('composition-v1');
  expect(updated.reviewProtocolHistory).toMatchObject([
    { to: 'composition-v1', reason: 'user-requested-regeneration' },
  ]);
  expect(updated.variants[0]?.cards[0]?.attempts[0]).toEqual(oldAttempt);
  expect(updated.imageCalls).toBe(11);
  expect(provider.observations).toBe(1);
  expect(updated.status).toBe('completed');
});

class BoundedCompositionProvider extends FixtureProvider {
  badCards = new Set<number>();
  confirmDefects = true;
  observationFailures = false;
  observations = new Map<number, number>();
  setChecks = 0;
  setTargets: number[] = [];
  invalidSetTarget = false;
  cardGate: Promise<void> = Promise.resolve();
  setRepairGate: Promise<void> = Promise.resolve();
  setRepairsStarted = 0;
  override async plan(): Promise<Plan> {
    return CompositionFixture.create().plan;
  }
  override async image(prompt: string, references: string[]) {
    if (prompt.includes('Адресно исправь карточку после общей проверки сетки')) {
      this.setRepairsStarted++;
      await this.setRepairGate;
    }
    return super.image(prompt, references);
  }
  async verifyComposition(prompt: string) {
    const match = /"subject":"Subject (\d+)"/.exec(prompt);
    if (!match?.[1]) throw new Error('Missing fixture subject');
    const index = Number(match[1]);
    this.observations.set(index, (this.observations.get(index) ?? 0) + 1);
    if (index === 0) await this.cardGate;
    if (this.observationFailures) throw new Error('Composition observation unavailable');
    const target = CompositionFixture.create().plan.variants[0]?.artContract?.composition?.targets[index];
    if (!target) throw new Error('Missing fixture target');
    return Contracts.compositionObservation.parse({
      subjectPresent: !this.badCards.has(index),
      completeSilhouette: true,
      compositionDescriptionMatch: !this.badCards.has(index),
      observedCategory: target.category,
      findings: this.badCards.has(index) ? ['Неверный предмет'] : [],
      confirmedViolations:
        this.badCards.has(index) && this.confirmDefects
          ? [{ kind: 'wrong-subject', evidence: 'Изображён другой предмет' }]
          : [],
      observedComposition: {
        ...target.required,
        contextDensity: 'minimal',
        camera: 'front',
        subjectScale: 'large',
        characterCount: 0,
        subjectPosition: 'center',
        backgroundColor: 'blue',
      },
    });
  }
  async verifySetComposition(prompt: string) {
    this.setChecks++;
    const ids = [...prompt.matchAll(/"cardId":"([^"]+)"/g)].map((match) => match[1]);
    return {
      findings: this.setTargets.length ? ['Дублирование силуэтов'] : [],
      corrections: this.setTargets.map((index) => ({
        cardId: this.invalidSetTarget ? 'missing-card' : (ids[index] ?? ''),
        kind: 'duplicate-silhouette' as const,
        evidence: 'Силуэты двух карточек совпадают',
        instruction: 'Измени поворот предмета, сохранив предмет, категорию и обязательный фон',
      })),
    };
  }
}

it.each(['normal', 'pause', 'repair'] as const)(
  'preserves manual blue tags through generation, verification and export in %s mode',
  async (mode) => {
    const pause = mode === 'pause';
    const extraRepair = mode === 'repair' ? 1 : 0;
    const provider = new BoundedCompositionProvider();
    const originalPlan = provider.plan.bind(provider);
    vi.spyOn(provider, 'plan').mockImplementation(async () => {
      const plan = await originalPlan();
      const target = plan.variants[0]?.artContract?.composition?.targets[8];
      if (!target) throw new Error('Missing editable slot');
      target.appearance = { backgroundColor: 'green', subjectScale: 'large' };
      return Contracts.preparedProductionPlan.parse(plan);
    });
    const originalVerify = provider.verifyComposition.bind(provider);
    vi.spyOn(provider, 'verifyComposition').mockImplementation(async (prompt) => {
      const observation = await originalVerify(prompt);
      if (prompt.includes('"subject":"Subject 8"'))
        observation.observedComposition.backgroundColor = prompt.includes('USER-APPROVED SLOT TAG OVERRIDES')
          ? 'blue'
          : 'green';
      if (
        mode === 'repair' &&
        prompt.includes('USER-APPROVED SLOT TAG OVERRIDES') &&
        provider.observations.get(8) === 2
      ) {
        observation.subjectPresent = false;
        observation.confirmedViolations = [
          { kind: 'wrong-subject', evidence: 'A wrong subject needs one bounded repair' },
        ];
      }
      return observation;
    });
    const library = CompositionFixture.create().catalog.cards.map((item) =>
      StyleContracts.libraryItem.parse({
        ...item,
        title: item.observation.subject,
        category: item.observation.category,
        source: 'fixture',
      }),
    );
    const h = await harness(provider, undefined, undefined, Contracts.profile.parse({ ...profile, library }));
    const inputSettings = { ...settings, maxCardRegenerations: 1, maxSetRegenerationRounds: 1 };
    const started = await h.service.start({ ...brief, variants: 1, maxImageCalls: 25 }, inputSettings);
    const initial = await finished(h, started.id);
    const variant = initial.variants[0],
      card = variant?.cards[8];
    if (!variant || !card) throw new Error('Missing generated card');
    const oldAttempt = structuredClone(card.attempts[0]);
    const contract = structuredClone(variant.artContract);
    const target = SetComposition.target(variant, card);
    if (!target) throw new Error('Missing planned target');
    const facets = SlotTagContracts.facets.parse(
      Object.fromEntries(
        Object.entries({ ...target.required, ...target.appearance, backgroundColor: 'blue' }).filter(
          ([key]) => key !== 'characterCount',
        ),
      ),
    );
    await h.service.setSlotTags(initial.id, card.id, { expectedRevision: 0, facets });
    const edited = await h.repository.get(initial.id);
    expect(edited.imageCalls).toBe(10);
    expect(edited.variants[0]?.artContract).toEqual(contract);
    expect(edited.variants[0]?.cards[8]?.attempts[0]).toEqual(oldAttempt);
    const port: GenerationPort = provider;
    vi.spyOn(port, 'verifySetComposition').mockResolvedValue({
      findings: ['Obsolete green requirement'],
      corrections: [
        {
          cardId: card.id,
          kind: 'color-pattern-rhythm',
          evidence: 'Original plan assigned green',
          instruction: 'Restore the green background',
        },
      ],
    });
    let release = () => {};
    if (pause)
      provider.gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    h.snapshots.length = 0;
    await h.service.retry(initial.id, card.id, 'Перерисуй на лунной поверхности', undefined, inputSettings);
    if (pause) {
      await vi.waitFor(() => expect(provider.calls).toBe(11));
      await h.service.pause(initial.id);
      release();
      const paused = await finished(h, initial.id);
      expect(paused.status).toBe('paused');
      h.snapshots.length = 0;
      await h.service.resume(initial.id, undefined, inputSettings);
    }
    const result = await finished(h, initial.id);
    const updated = result.variants[0],
      latestCard = updated?.cards[8],
      attempt = latestCard?.attempts.at(-1);
    if (!updated || !latestCard || !attempt) throw new Error('Missing manual revision');
    expect(result.status, result.stage).toBe('completed');
    expect(result.imageCalls).toBe(11 + extraRepair);
    expect(latestCard.attempts).toHaveLength(2 + extraRepair);
    expect(latestCard.attempts[0]).toEqual(oldAttempt);
    expect(updated.artContract).toEqual(contract);
    expect(attempt.slotTagRevision).toBe(1);
    expect(attempt.slotTargetSnapshot?.appearance?.backgroundColor).toBe('blue');
    expect(attempt.prompt).toContain('USER-APPROVED SLOT TAG OVERRIDES');
    expect(attempt.prompt).toContain('Перерисуй на лунной поверхности');
    expect(attempt.reviewPrompt).toContain('Перерисуй на лунной поверхности');
    expect(attempt.compositionCheck?.matches).toBe(true);
    expect(updated.gridReviewHistory?.at(-1)?.slotTagRevisions?.[8]).toBe(1);
    expect(updated.gridRepairRounds ?? []).toHaveLength(0);
    for (const [index, other] of updated.cards.entries())
      if (index !== 8) expect(other.attempts).toHaveLength(1);
    const archive = path.join(h.root, 'manual-tags.zip');
    await new ExportService(h.images).export(result, updated.id, h.repository.directory(result.id), archive);
    expect(new AdmZip(archive).readAsText('run.json')).toContain('manual-slot-tags-v1');
  },
);

it.each([0, 1, 2])(
  'caps explicit mandatory card corrections at %i, preserves versions and rechecks every output',
  async (limit) => {
    const provider = new BoundedCompositionProvider();
    provider.badCards.add(0);
    const h = await harness(provider);
    const started = await h.service.start(
      { ...brief, variants: 1, maxImageCalls: 30 },
      { ...settings, maxCardRegenerations: limit, maxSetRegenerationRounds: 0 },
    );
    const result = await finished(h, started.id);
    const card = result.variants[0]?.cards[0];
    expect(result.status).toBe('completed');
    expect(result.imageCalls).toBe(10 + limit);
    expect(card?.attempts).toHaveLength(1 + limit);
    expect(card?.repairRequests ?? []).toHaveLength(limit);
    expect(provider.observations.get(0) ?? 0).toBe(limit === 0 ? 0 : 1 + limit);
    expect(provider.setChecks).toBe(0);
    if (!card) throw new Error('Missing card');
    for (const attempt of card.attempts)
      await h.images.read(h.repository.directory(result.id), attempt, 'master');
    for (const repair of card.repairRequests ?? []) {
      const attempt = card.attempts.find((attempt) => attempt.id === repair.resultAttemptId);
      expect(attempt?.revisionOf).toBe(repair.sourceAttemptId);
      expect(attempt?.generationInputManifest?.at(-1)).toMatchObject({
        role: 'previous-candidate',
        id: repair.sourceAttemptId,
      });
    }
  },
);

it.each(['uncertain', 'unavailable', 'budget'] as const)(
  'does not spend repair requests for %s observations or an exhausted base-image budget',
  async (mode) => {
    const provider = new BoundedCompositionProvider();
    provider.badCards.add(0);
    provider.confirmDefects = mode !== 'uncertain';
    provider.observationFailures = mode === 'unavailable';
    const h = await harness(provider);
    const started = await h.service.start(
      { ...brief, variants: 1, maxImageCalls: mode === 'budget' ? 10 : 30 },
      settings,
    );
    const result = await finished(h, started.id);
    expect(result.status).toBe('completed');
    expect(result.imageCalls).toBe(10);
    expect(result.variants[0]?.cards.every((card) => card.attempts.length === 1)).toBe(true);
  },
);

it.each([0, 1, 2])(
  'caps complete-set correction rounds at %i and corrects every identified card without nested card retries',
  async (limit) => {
    const provider = new BoundedCompositionProvider();
    provider.badCards.add(0);
    provider.setTargets = [0, 2];
    const h = await harness(provider);
    const started = await h.service.start(
      { ...brief, variants: 1, maxImageCalls: 30 },
      { ...settings, maxCardRegenerations: 1, maxSetRegenerationRounds: limit },
    );
    const result = await finished(h, started.id);
    const variant = result.variants[0];
    expect(result.status).toBe('completed');
    expect(result.imageCalls).toBe(11 + 2 * limit);
    expect(provider.setChecks).toBe(limit === 0 ? 0 : 1 + limit);
    expect(variant?.gridRepairRounds ?? []).toHaveLength(limit);
    expect(variant?.cards[0]?.attempts).toHaveLength(2 + limit);
    expect(variant?.cards[2]?.attempts).toHaveLength(1 + limit);
    expect(variant?.cards[1]?.attempts).toHaveLength(1);
    if (limit > 0) {
      expect(variant?.gridReviewHistory?.at(-1)?.attemptIds).toEqual(
        variant?.cards.map((card) => card.selectedAttemptId),
      );
      expect(variant?.gridReviewHistory?.every((review) => !review.error)).toBe(true);
    }
  },
);

it.each([
  { limit: 0, cardLimit: 1, persistent: true },
  { limit: 1, cardLimit: 0, persistent: false },
  { limit: 1, cardLimit: 1, persistent: true },
  { limit: 2, cardLimit: 1, persistent: true },
])(
  'repairs observed close silhouettes with independent limits $limit/$cardLimit (persistent=$persistent)',
  async ({ limit, cardLimit, persistent }) => {
    const provider = new BoundedCompositionProvider();
    const instruction =
      'Измени прямоугольный деревянный тайник на округлую нишу с поднятой панелью, сохранив предмет и обязательный слот.';
    const verify = vi.spyOn(provider, 'verifySetComposition').mockImplementation(async (prompt) => {
      provider.setChecks++;
      const ids = [...prompt.matchAll(/"cardId":"([^"]+)"/g)].map((match) => match[1]);
      if (!ids[8] || !ids[9]) throw new Error('Missing silhouette pair');
      return {
        findings: ['Сейф и деревянный тайник имеют близкие силуэты открытой пустой ниши со створкой.'],
        corrections: [],
        silhouetteConflicts:
          persistent || provider.setChecks === 1
            ? [
                {
                  cardId: ids[9],
                  similarToCardId: ids[8],
                  evidence:
                    'Разные материалы и сторона открывания сохраняют одинаковую конструкцию и постановку.',
                  instruction,
                },
              ]
            : [],
      };
    });
    const h = await harness(provider);
    const started = await h.service.start(
      { ...brief, variants: 1, maxImageCalls: 30 },
      { ...settings, maxCardRegenerations: cardLimit, maxSetRegenerationRounds: limit },
    );
    const result = await finished(h, started.id);
    const variant = result.variants[0],
      card = variant?.cards[9];
    if (!variant || !card) throw new Error('Missing repaired card');
    expect(result.status).toBe('completed');
    expect(result.imageCalls).toBe(10 + limit);
    expect(card.attempts).toHaveLength(1 + limit);
    expect(verify).toHaveBeenCalledTimes(limit === 0 ? 0 : limit + 1);
    expect(variant.gridRepairRounds ?? []).toHaveLength(limit);
    expect(variant.cards.slice(0, 9).every((card) => card.attempts.length === 1)).toBe(true);
    expect((card.repairRequests ?? []).every((request) => request.scope === 'set')).toBe(true);
    for (const [index, attempt] of card.attempts.entries()) {
      await h.images.read(h.repository.directory(result.id), attempt, 'master');
      if (index === 0) continue;
      expect(attempt.prompt).toContain(instruction);
      expect(attempt.revisionOf).toBe(card.attempts[index - 1]?.id);
      expect(attempt.generationInputManifest?.at(-1)).toMatchObject({
        role: 'previous-candidate',
        id: attempt.revisionOf,
      });
    }
    if (limit > 0) {
      expect(variant.gridReviewHistory?.[0]?.observation?.corrections).toEqual([]);
      expect(variant.gridReviewHistory?.[0]?.observation?.silhouetteConflicts).toHaveLength(1);
      expect(variant.gridReviewHistory?.at(-1)?.attemptIds).toEqual(
        variant.cards.map((card) => card.selectedAttemptId),
      );
      expect(card.attempts.at(-1)?.compositionCheckSkipped).toBe(
        cardLimit === 0 ? 'disabled-by-policy' : undefined,
      );
    }
  },
);

it.each(['unknown-peer', 'same-card'] as const)(
  'does not spend image requests on an invalid silhouette pair: %s',
  async (mode) => {
    const provider = new BoundedCompositionProvider();
    vi.spyOn(provider, 'verifySetComposition').mockImplementation(async (prompt) => {
      provider.setChecks++;
      const ids = [...prompt.matchAll(/"cardId":"([^"]+)"/g)].map((match) => match[1]);
      if (!ids[8] || !ids[9]) throw new Error('Missing silhouette pair');
      const conflict = {
        cardId: ids[9],
        similarToCardId: mode === 'unknown-peer' ? 'missing' : mode === 'same-card' ? ids[9] : ids[8],
        evidence: 'Близкие силуэты',
        instruction: 'Измени силуэт',
      };
      return {
        findings: [],
        corrections: [],
        silhouetteConflicts: [conflict],
      };
    });
    const h = await harness(provider);
    const started = await h.service.start({ ...brief, variants: 1 }, settings);
    const result = await finished(h, started.id);
    expect(result.imageCalls).toBe(10);
    expect(result.variants[0]?.gridRepairRounds).toEqual([]);
    expect(result.variants[0]?.gridReviewHistory?.[0]?.error).toContain('distinct existing cards');
  },
);

it('rejects unknown whole-set correction targets without generating any replacement', async () => {
  const provider = new BoundedCompositionProvider();
  provider.setTargets = [0];
  provider.invalidSetTarget = true;
  const h = await harness(provider);
  const started = await h.service.start({ ...brief, variants: 1 }, settings);
  const result = await finished(h, started.id);
  expect(result.imageCalls).toBe(10);
  expect(result.variants[0]?.gridReviewHistory?.[0]?.error).toContain('distinct existing cards');
  expect(result.variants[0]?.gridRepairRounds).toEqual([]);
});

it('resumes an interrupted mandatory-card correction without redrawing the original or resetting its limit', async () => {
  const provider = new BoundedCompositionProvider();
  provider.badCards.add(0);
  let release = () => {};
  provider.cardGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const h = await harness(provider);
  const started = await h.service.start({ ...brief, variants: 1, maxImageCalls: 30 }, settings);
  await vi.waitFor(() => expect(provider.observations.get(0)).toBe(1));
  await h.service.pause(started.id);
  release();
  const paused = await finished(h, started.id);
  const original = paused.variants[0]?.cards[0]?.selectedAttemptId;
  h.snapshots.length = 0;
  await h.service.resume(started.id);
  const result = await finished(h, started.id);
  expect(result.imageCalls).toBe(11);
  expect(result.variants[0]?.cards[0]?.attempts[0]?.id).toBe(original);
  expect(result.variants[0]?.cards[0]?.repairRequests).toHaveLength(1);
  expect(provider.observations.get(0)).toBe(2);
});

it('resumes a partially completed whole-set batch without repeating its in-flight corrections or spending extra rounds', async () => {
  const provider = new BoundedCompositionProvider();
  provider.setTargets = [0, 1, 2];
  let release = () => {};
  provider.setRepairGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const h = await harness(provider);
  const started = await h.service.start({ ...brief, variants: 1, maxImageCalls: 30 }, settings);
  await vi.waitFor(() => expect(provider.setRepairsStarted).toBe(2), { timeout: 5000 });
  await h.service.pause(started.id);
  release();
  const paused = await finished(h, started.id);
  expect(paused.imageCalls).toBe(12);
  expect(paused.variants[0]?.gridRepairRounds?.[0]?.completedAt).toBeUndefined();
  h.snapshots.length = 0;
  await h.service.resume(started.id);
  const result = await finished(h, started.id);
  expect(result.status).toBe('completed');
  expect(result.imageCalls).toBe(13);
  expect(provider.setChecks).toBe(2);
  expect(result.variants[0]?.gridRepairRounds).toHaveLength(1);
  expect(result.variants[0]?.cards.slice(0, 3).map((card) => card.attempts.length)).toEqual([2, 2, 2]);
});

it('skips both model verifiers by default and freezes zero limits across manual regeneration', async () => {
  const provider = new BoundedCompositionProvider();
  provider.badCards.add(0);
  provider.setTargets = [0, 1];
  const h = await harness(provider);
  const started = await h.service.start(
    { ...brief, variants: 1, maxImageCalls: 30 },
    Contracts.settings.parse({}),
  );
  let result = await finished(h, started.id);
  expect(result.repairPolicy).toMatchObject({ maxCardRegenerations: 0, maxSetRegenerationRounds: 0 });
  expect(result.textModel).toBe('gpt-6.1-terra');
  expect(provider.observations.size).toBe(0);
  expect(provider.setChecks).toBe(0);
  expect(result.imageCalls).toBe(10);
  expect(
    result.variants[0]?.cards.every(
      (card) => card.attempts[0]?.compositionCheckSkipped === 'disabled-by-policy',
    ),
  ).toBe(true);
  const card = result.variants[0]?.cards[0];
  if (!card) throw new Error('Missing card');
  h.snapshots.length = 0;
  await h.service.retry(result.id, card.id, '', undefined, {
    ...settings,
    maxCardRegenerations: 3,
    maxSetRegenerationRounds: 3,
  });
  result = await finished(h, result.id);
  expect(result.imageCalls).toBe(11);
  expect(result.repairPolicy).toMatchObject({ maxCardRegenerations: 0, maxSetRegenerationRounds: 0 });
  expect(provider.observations.size).toBe(0);
  expect(provider.setChecks).toBe(0);
});

it('retains API-era history and explicitly continues only through Codex', async () => {
  const provider = new BoundedCompositionProvider();
  const h = await harness(provider);
  const started = await h.service.start(
    { ...brief, variants: 1, maxImageCalls: 30 },
    Contracts.settings.parse({}),
  );
  const archived = await finished(h, started.id);
  archived.provider = 'openai';
  archived.imageModel = 'historical-api-image';
  archived.textModel = 'historical-api-text';
  const card = archived.variants[0]?.cards[0];
  if (!card) throw new Error('Missing card');
  const original = structuredClone(card.attempts[0]);
  await h.repository.save(archived);
  h.snapshots.length = 0;
  await h.service.retry(archived.id, card.id, '', undefined, Contracts.settings.parse({}));
  const result = await finished(h, archived.id);
  expect(result.provider).toBe('codex');
  expect(result.textModel).toBe('gpt-6.1-terra');
  expect(result.providerHistory).toMatchObject([
    { from: 'openai', to: 'codex', imageModel: 'historical-api-image', textModel: 'historical-api-text' },
  ]);
  expect(result.variants[0]?.cards[0]?.attempts[0]).toEqual(original);
});

it('does not exceed the shared image budget while correcting multiple whole-set targets', async () => {
  const provider = new BoundedCompositionProvider();
  provider.setTargets = [0, 1, 2];
  const h = await harness(provider);
  const started = await h.service.start(
    { ...brief, variants: 1, maxImageCalls: 11 },
    { ...settings, maxCardRegenerations: 0, maxSetRegenerationRounds: 2 },
  );
  const result = await finished(h, started.id);
  expect(result.status).toBe('completed');
  expect(result.imageCalls).toBe(11);
  expect(result.variants[0]?.cards.reduce((total, card) => total + card.attempts.length, 0)).toBe(11);
  expect(provider.setChecks).toBe(2);
});
