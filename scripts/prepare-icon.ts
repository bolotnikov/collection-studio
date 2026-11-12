import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const folder = path.resolve('output/CollectionStudio.iconset');
await fs.mkdir(folder, { recursive: true });
for (const size of [16, 32, 128, 256, 512]) {
  await sharp('resources/icon.svg')
    .resize(size, size)
    .png()
    .toFile(path.join(folder, `icon_${size}x${size}.png`));
  await sharp('resources/icon.svg')
    .resize(size * 2, size * 2)
    .png()
    .toFile(path.join(folder, `icon_${size}x${size}@2x.png`));
}
await promisify(execFile)('iconutil', ['-c', 'icns', folder, '-o', path.resolve('resources/icon.icns')]);
console.log('Prepared resources/icon.icns');
