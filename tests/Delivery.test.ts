import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { Contracts } from '../src/shared/Contracts';
import { DeliveryContracts } from '../src/shared/DeliveryContracts';
import { DeliveryComposer } from '../src/infrastructure/DeliveryComposer';
import { DeliveryPreviewService } from '../src/infrastructure/DeliveryPreviewService';
import { ImageFiles } from '../src/infrastructure/ImageFiles';
import { ExportService } from '../src/infrastructure/ExportService';
import { DeliveryReadiness } from '../src/domain/DeliveryReadiness';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});
async function fixture() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-delivery-'));
  folders.push(folder);
  const images = new ImageFiles();
  const cards = [];
  for (let index = 0; index < 10; index++) {
    const bytes = await sharp({
      create: {
        width: 430,
        height: 480,
        channels: 3,
        background: { r: 20 + index * 20, g: 80, b: 160 },
      },
    })
      .png()
      .toBuffer();
    const id = `attempt-${index}`;
    const files = await images.save(folder, id, bytes);
    cards.push({
      id: `card-${index}`,
      subject: `Object ${index}`,
      description: 'Offline colored test rectangle',
      category: String((index % 4) + 1),
      role: 'Fixture',
      status: 'done',
      locked: false,
      error: null,
      selectedAttemptId: id,
      attempts: [
        {
          id,
          ...files,
          prompt: 'fixture',
          model: 'fixture',
          createdAt: '',
          elapsedMs: 0,
          requestId: null,
          usage: null,
          reviewError: null,
          review: {
            passed: true,
            style: 5,
            readability: 5,
            subjectMatch: 5,
            categoryMatch: true,
            findings: [],
            correction: '',
          },
        },
      ],
    });
  }
  const run = Contracts.run.parse({
    id: randomUUID(),
    createdAt: '',
    updatedAt: '',
    status: 'completed',
    stage: '',
    imageCalls: 10,
    brief: {
      theme: 'Offline test',
      wishes: '',
      variants: 1,
      quality: 'low',
      maxImageCalls: 10,
      autoRepair: false,
    },
    variants: [
      {
        id: 'variant',
        title: 'Fixture',
        concept: 'Synthetic rectangles',
        cards,
        reviewError: null,
        reviewedAttemptIds: cards.map((card) => card.selectedAttemptId),
        review: { passed: true, coherence: 5, findings: [], outlierCardIds: [] },
      },
    ],
    imageModel: 'fixture',
    textModel: 'fixture',
    events: [],
    selectedVariantId: 'variant',
  });
  await fs.writeFile(path.join(folder, 'style-profile.json'), '{}');
  return { folder, images, run };
}

it('fills all ten slots in order in all four transparent original templates and includes them in export', async () => {
  const { folder, images, run } = await fixture();
  const delivery = new DeliveryPreviewService(images, path.resolve('resources/knowledge'));
  const zipPath = path.join(folder, 'result.zip');
  await new ExportService(images, delivery).export(run, 'variant', folder, zipPath);
  const zip = new AdmZip(zipPath);
  const layout = DeliveryContracts.defaults();
  for (const template of layout.templates) {
    const bytes = zip.readFile(`delivery/${template.id}.png`);
    expect(bytes).not.toBeNull();
    if (!bytes) throw new Error('Delivery missing');
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([layout.viewport.width, layout.viewport.height]);
    expect(data[3]).toBe(0);
    for (const [index, slot] of layout.slots.entries()) {
      const x = slot.left - layout.viewport.left + Math.floor(slot.width / 2);
      const y = slot.top - layout.viewport.top + Math.floor(slot.height / 2);
      const offset = (y * info.width + x) * 4;
      expect([...data.subarray(offset, offset + 4)]).toEqual([20 + index * 20, 80, 160, 255]);
    }
    const source = await fs.readFile(`resources/knowledge/images/delivery/${template.sha256}.png`);
    expect(createHash('sha256').update(source).digest('hex')).toBe(template.sha256);
  }
  expect(zip.getEntry('delivery/manifest.json')).not.toBeNull();
  expect(zip.getEntry('cards/01.png')).not.toBeNull();
  expect(zip.getEntry('contact-sheet.png')).not.toBeNull();
}, 30000);

it('blocks rejected, stale and mutated selected images before producing delivery previews', async () => {
  const { folder, images, run } = await fixture();
  const delivery = new DeliveryPreviewService(images, path.resolve('resources/knowledge'));
  const variant = run.variants[0];
  if (!variant?.review) throw new Error('Fixture missing');
  variant.review.passed = false;
  expect(DeliveryReadiness.accepts(run, variant)).toBe(false);
  await expect(delivery.create(run, variant.id, folder)).rejects.toThrow('passed card and set reviews');
  variant.review.passed = true;
  variant.reviewedAttemptIds = ['stale'];
  expect(DeliveryReadiness.accepts(run, variant)).toBe(false);
  variant.reviewedAttemptIds = variant.cards.map((card) => card.selectedAttemptId ?? '');
  expect(DeliveryReadiness.accepts(run, variant)).toBe(true);
  const attempt = variant.cards[0]?.attempts[0];
  if (!attempt) throw new Error('Fixture attempt missing');
  await fs.writeFile(path.join(folder, attempt.preview), 'modified');
  await expect(delivery.create(run, variant.id, folder)).rejects.toThrow('bytes have changed');
  await expect(fs.access(path.join(folder, 'delivery'))).rejects.toThrow();
});

it('fails fast for incomplete card arrays or mismatched template dimensions', async () => {
  const composer = new DeliveryComposer(),
    layout = DeliveryContracts.defaults();
  await expect(composer.compose([], Buffer.alloc(0), layout)).rejects.toThrow('ten cards');
  const tiny = await sharp({ create: { width: 10, height: 10, channels: 4, background: '#00000000' } })
    .png()
    .toBuffer();
  await expect(
    composer.compose(
      Array.from({ length: 10 }, () => tiny),
      tiny,
      layout,
    ),
  ).rejects.toThrow('dimensions');
});
