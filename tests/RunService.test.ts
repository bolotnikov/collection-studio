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
  styleScore = 5;
  calls = 0;
  planCalls = 0;
  rejectImages = false;
  rejectReview = false;
  badReviews = false;
  gate: Promise<void> = Promise.resolve();
  async plan(input: Brief): Promise<Plan> {
    this.planCalls++;
    return {
      variants: Array.from({ length: input.variants }, (_, v) => ({
        title: `Fixture ${v}`,
        concept: 'Offline integration fixtures',
        cards: Array.from({ length: 10 }, (_, i) => ({
          subject: `Subject ${v}/${i}`,
          description: 'A synthetic test fixture, not art',
          category: Contracts.plannedCard.shape.category.parse(String((i % 4) + 1)),
          role: 'Coverage fixture',
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
  async reviewSet(_variant: Variant, _sheet: string, receivedProfile: Profile) {
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

async function harness(provider = new FixtureProvider(), preparation?: StylePreparationPort) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-studio-test-'));
  directories.push(root);
  const repository = new RunRepository(root),
    images = new ImageFiles();
  const snapshots: Run[] = [];
  const service = new RunService(
    repository,
    images,
    profile,
    '/test-references',
    () => provider,
    (r) => snapshots.push(r),
    preparation ? () => preparation : undefined,
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
  it('reserves the base 30 images before spending the repair allowance', async () => {
    const provider = new FixtureProvider();
    provider.badReviews = true;
    const h = await harness(provider),
      run = await h.service.start({ ...brief, maxImageCalls: 30, autoRepair: true }, settings);
    const result = await finished(h, run.id);
    expect(result.status).toBe('paused');
    expect(result.imageCalls).toBe(30);
    expect(result.variants.flatMap((v) => v.cards).every((c) => c.attempts.length === 1)).toBe(true);
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
    expect(h.provider.receivedPrompts.every((p) => p === 'EVIDENCE PROMPT')).toBe(true);
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
    expect(result.variants.flatMap((v) => v.cards).every((c) => c.attempts.length === 3)).toBe(true);
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
    expect(
      result.variants
        .flatMap((v) => v.cards)
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
    expect(result.imageCalls).toBe(2);
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
