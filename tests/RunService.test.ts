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

let pixels: Buffer;
let profile: Profile;
const directories: string[] = [];
const settings: Settings = Contracts.settings.parse({
  provider: 'openai',
  imageModel: 'offline-test-image',
  textModel: 'offline-test-review',
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
          pilotIndex: 0,
          pilotRationale: 'Tests representative materials and silhouette',
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
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-studio-test-'));
  directories.push(root);
  const repository = new RunRepository(root),
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
  it('stops at the failed pilot without spending the remaining base image budget', async () => {
    const provider = new FixtureProvider();
    provider.badReviews = true;
    const h = await harness(provider),
      run = await h.service.start({ ...brief, maxImageCalls: 30, autoRepair: true }, settings);
    const result = await finished(h, run.id);
    expect(result.status).toBe('paused');
    expect(result.imageCalls).toBe(1);
    expect(result.variants.flatMap((v) => v.cards).filter((c) => c.attempts.length)).toHaveLength(1);
    expect(result.stage).toContain('Pilot needs revision');
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
    expect(result.imageCalls).toBe(3);
    expect(result.variants[0]?.cards[0]?.attempts).toHaveLength(3);
    expect(result.variants.flatMap((v) => v.cards).filter((c) => c.attempts.length)).toHaveLength(1);
    const variant = result.variants[0];
    if (!variant) throw new Error('Missing fixture');
    await expect(
      new ExportService(h.images).export(
        result,
        variant.id,
        h.repository.directory(result.id),
        path.join(h.root, 'rejected.zip'),
      ),
    ).rejects.toThrow('ten images');
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
      expect(received.rules).toEqual(expect.arrayContaining(originalRules));
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
    delete original.workflowVersion; // Explicit historical protocol fixture: no pilot migration.
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
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
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
    await vi.waitFor(() => expect(provider.calls).toBe(1));
    await h.service.pause(run.id);
    release();
    const paused = await finished(h, run.id);
    expect(paused.status).toBe('paused');
    expect(paused.imageCalls).toBe(1);
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
    expect(result.stage).toContain('Pilot needs revision');
    expect(result.imageCalls).toBe(1);
    expect(
      result.variants
        .flatMap((v) => v.cards)
        .filter((c) => c.attempts.length)
        .every((c) => c.attempts[0]?.reviewError === 'Review unavailable'),
    ).toBe(true);
  });
  it('stops on provider failure, counts attempted calls and does not claim completion', async () => {
    const provider = new FixtureProvider();
    provider.rejectImages = true;
    const h = await harness(provider),
      run = await h.service.start(brief, settings),
      result = await finished(h, run.id);
    expect(result.status).toBe('paused');
    expect(result.imageCalls).toBe(1);
    expect(result.variants.flatMap((v) => v.cards).filter((c) => c.status === 'failed')).toHaveLength(1);
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
    await vi.waitFor(() => expect(provider.calls).toBe(1));
    const interrupted = await h.repository.get(run.id);
    await h.service.pause(run.id);
    release();
    await finished(h, run.id);
    await h.repository.save(interrupted);
    await h.repository.recover();
    const recovered = await h.repository.get(run.id);
    expect(recovered.status).toBe('paused');
    expect(recovered.stage).toContain('may have consumed usage');
    expect(recovered.variants.flatMap((v) => v.cards).filter((c) => c.status === 'failed')).toHaveLength(1);
    expect(provider.calls).toBe(1);
  });
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
  expect(run.status).toBe('paused');
  expect(run.variants).toHaveLength(0);
  expect(run.planHistory).toHaveLength(2);
  expect(provider.planCalls).toBe(2);
  expect(provider.calls).toBe(0);
  h.snapshots.length = 0;
  await h.service.resume(run.id);
  await finished(h, run.id);
  expect(provider.planCalls).toBe(2);
  expect(provider.calls).toBe(0);
});

it('gates production on pilot verification, preserves the accepted attempt on resume, and binds the plan', async () => {
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
  await vi.waitFor(() => expect(provider.calls).toBe(1));
  await vi.waitFor(() => expect(h.snapshots.at(-1)?.variants[0]?.cards[0]?.status).toBe('reviewing'));
  expect(provider.calls).toBe(1);
  await h.service.pause(started.id);
  release();
  const paused = await finished(h, started.id);
  const pilot = paused.variants[0]?.cards[0]?.selectedAttemptId;
  h.snapshots.length = 0;
  await h.service.resume(started.id);
  const complete = await finished(h, started.id);
  expect(complete.status).toBe('completed');
  expect(provider.calls).toBe(10);
  const variant = complete.variants[0];
  if (!variant) throw new Error('Fixture missing');
  expect(variant.pilotAttemptId).toBe(pilot);
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

it('cannot generate a different card while the pilot is rejected, including manual retry', async () => {
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
  expect(blocked.status).toBe('failed');
  expect(provider.calls).toBe(1);
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

it('manual pilot selection invalidates approval and makes a completed run resumable', async () => {
  const h = await harness();
  const started = await h.service.start({ ...brief, variants: 1 }, settings);
  const run = await finished(h, started.id);
  const variant = run.variants[0],
    pilot = variant?.cards[0],
    attempt = pilot?.attempts[0];
  if (!variant || !pilot || !attempt) throw new Error('Fixture missing');
  const alternative = { ...attempt, id: 'alternative-verified-attempt' };
  pilot.attempts.push(alternative);
  await h.repository.save(run);
  await h.service.selectAttempt(run.id, pilot.id, alternative.id);
  const edited = await h.repository.get(run.id);
  expect(edited.status).toBe('paused');
  expect(edited.variants[0]?.review).toBeNull();
  expect(edited.variants[0]?.pilotAttemptId).toBeUndefined();
  h.snapshots.length = 0;
  await h.service.resume(run.id);
  const completed = await finished(h, run.id);
  expect(completed.status).toBe('completed');
  expect(completed.variants[0]?.pilotAttemptId).toBe(alternative.id);
  expect(h.provider.calls).toBe(10);
});

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
  expect((await h.repository.getProfile(first.id)).rules).toEqual(profile.rules);
  expect((await h.repository.getProfile(first.id)).analysisModel).toBe(settings.codexModel);
  expect((await h.repository.getProfile(first.id)).library?.[0]?.metadata?.category).toBe('1');
  h.snapshots.length = 0;
  const second = await h.service.start({ ...brief, variants: 1 }, settings);
  await finished(h, second.id);
  expect((await h.repository.getProfile(second.id)).rules).toEqual(revised.rules);
  expect((await h.repository.getProfile(second.id)).library?.[0]?.metadata?.category).toBe('3');
});

it('retries an unavailable pilot review without generating a replacement, even with zero repair allowance', async () => {
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
  expect(paused.imageCalls).toBe(1);
  provider.rejectReview = false;
  h.snapshots.length = 0;
  await h.service.resume(started.id);
  const completed = await finished(h, started.id);
  expect(completed.status).toBe('completed');
  expect(completed.imageCalls).toBe(10);
  expect(completed.variants[0]?.cards[0]?.selectedAttemptId).toBe(firstId);
  expect(completed.variants[0]?.cards.every((card) => card.attempts.length === 1)).toBe(true);
});
it('rechecks an unverified nonpilot without requiring more image budget', async () => {
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
