import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ReferenceImagePacker } from '../src/infrastructure/ReferenceImagePacker';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});
async function fixtures(count: number) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'reference-packing-'));
  folders.push(folder);
  const inputs: string[] = [];
  for (let index = 0; index < count; index++) {
    const width = 11 + index,
      height = 17 + index;
    const pixels = Buffer.alloc(width * height * 3);
    for (let offset = 0; offset < pixels.length; offset++) pixels[offset] = (offset * 17 + index * 23) % 256;
    const file = path.join(folder, `input-${index + 1}.png`);
    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png()
      .toFile(file);
    inputs.push(file);
  }
  return { folder, inputs };
}

it.each([6, 7, 8, 9, 10, 11, 12, 13, 14, 15])(
  'packs %i complete references within five sheets, preserving every pixel and original order',
  async (count) => {
    const { folder, inputs } = await fixtures(count);
    const result = await new ReferenceImagePacker().pack(inputs, folder);
    expect(result.paths.length).toBeLessThanOrEqual(5);
    expect(result.manifest.originalCount).toBe(count);
    expect(
      result.manifest.attachments.flatMap((sheet) => sheet.cards.map((card) => card.originalIndex)),
    ).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    for (const sheet of result.manifest.attachments) {
      expect(sheet.cards.length).toBeGreaterThanOrEqual(2);
      expect(sheet.cards.length).toBeLessThanOrEqual(3);
      for (const card of sheet.cards) {
        const original = path.join(folder, card.filename);
        const bytes = await fs.readFile(original);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(card.sha256);
        const sourcePixels = await sharp(bytes).ensureAlpha().raw().toBuffer();
        const packedPixels = await sharp(path.join(folder, sheet.filename))
          .extract({ left: card.left, top: card.top, width: card.width, height: card.height })
          .ensureAlpha()
          .raw()
          .toBuffer();
        expect(packedPixels).toEqual(sourcePixels);
        expect(result.instruction).toContain(`${card.position} = ORIGINAL REFERENCE ${card.originalIndex}`);
      }
    }
    const firstManifest = await fs.readFile(path.join(folder, 'reference-packing.json'));
    const firstSheets = await Promise.all(result.paths.map((file) => fs.readFile(file)));
    await new ReferenceImagePacker().pack(inputs, folder);
    expect(await fs.readFile(path.join(folder, 'reference-packing.json'))).toEqual(firstManifest);
    expect(await Promise.all(result.paths.map((file) => fs.readFile(file)))).toEqual(firstSheets);
    expect(result.instruction).toContain('Never reproduce a sheet');
  },
);

it('passes five or fewer originals directly and fails explicitly above total capacity', async () => {
  const { folder, inputs } = await fixtures(5);
  const result = await new ReferenceImagePacker().pack(inputs, folder);
  expect(result.paths).toEqual(inputs);
  expect(result.manifest.mode).toBe('direct');
  await expect(new ReferenceImagePacker().pack(Array(16).fill('unused'), folder)).rejects.toThrow(
    'at most 15',
  );
});
