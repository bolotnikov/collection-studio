import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { ImageFiles } from '../src/infrastructure/ImageFiles';
import { Contracts } from '../src/shared/Contracts';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});
async function fixture() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-image-integrity-'));
  folders.push(folder);
  const images = new ImageFiles();
  const jpeg = await sharp({ create: { width: 800, height: 900, channels: 3, background: '#5588aa' } })
    .jpeg()
    .toBuffer();
  const files = await images.save(folder, 'attempt', jpeg);
  const attempt = Contracts.attempt.parse({
    id: 'attempt',
    ...files,
    prompt: 'fixture',
    model: 'fixture',
    createdAt: 'fixture',
    elapsedMs: 0,
    requestId: null,
    usage: null,
    review: null,
    reviewError: null,
  });
  return { folder, images, files, attempt };
}
it('writes real PNG masters and exact-size previews with verifiable content identities', async () => {
  const f = await fixture();
  expect(await sharp(await f.images.read(f.folder, f.attempt, 'master')).metadata()).toMatchObject({
    format: 'png',
    width: 800,
    height: 900,
  });
  expect(await sharp(await f.images.read(f.folder, f.attempt, 'preview')).metadata()).toMatchObject({
    format: 'png',
    width: 430,
    height: 480,
  });
  expect(f.attempt.hashes?.master).toHaveLength(64);
  expect(f.attempt.hashes?.preview).toHaveLength(64);
});
it('rejects mutated reviewed pixels, invalid legacy preview dimensions and paths outside a run', async () => {
  const f = await fixture();
  const changed = await sharp({ create: { width: 430, height: 480, channels: 3, background: '#ee5511' } })
    .png()
    .toBuffer();
  await fs.writeFile(path.join(f.folder, f.files.preview), changed);
  await expect(f.images.read(f.folder, f.attempt, 'preview')).rejects.toThrow('bytes have changed');
  await expect(
    f.images.read(f.folder, { ...f.attempt, preview: '../outside.png' }, 'preview'),
  ).rejects.toThrow('escapes');
  const invalid = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#5588aa' } })
    .png()
    .toBuffer();
  await fs.writeFile(path.join(f.folder, f.files.preview), invalid);
  await expect(f.images.read(f.folder, { ...f.attempt, hashes: undefined }, 'preview')).rejects.toThrow(
    'dimensions',
  );
});
