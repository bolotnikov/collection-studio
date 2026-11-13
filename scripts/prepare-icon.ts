import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

/** Prepare every consumer from the immutable generated master, without upscaling. */
class IconPreparation {
  async run(): Promise<void> {
    const master = 'resources/branding/collection-studio-master.png';
    const metadata = await sharp(master).metadata();
    if (!metadata.width || metadata.width !== metadata.height || metadata.width < 1024 || !metadata.hasAlpha)
      throw new Error('The icon master must be a square RGBA image of at least 1024 pixels.');
    const artwork = await sharp(master)
      .trim()
      .resize(896, 896, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const icon = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } })
      .composite([{ input: artwork, gravity: 'centre' }])
      .png()
      .toBuffer();
    const folder = path.resolve('output/CollectionStudio.iconset');
    await fs.mkdir(folder, { recursive: true });
    for (const size of [16, 32, 128, 256, 512]) {
      await sharp(icon)
        .resize(size, size)
        .png()
        .toFile(path.join(folder, `icon_${size}x${size}.png`));
      await sharp(icon)
        .resize(size * 2, size * 2)
        .png()
        .toFile(path.join(folder, `icon_${size}x${size}@2x.png`));
    }
    await promisify(execFile)('iconutil', ['-c', 'icns', folder, '-o', path.resolve('resources/icon.icns')]);
    const logo = 'resources/branding/collection-studio-logo.png';
    await sharp(icon).resize(256, 256).png().toFile(logo);
    await fs.copyFile(logo, 'website/public/logo.png');
    await sharp(icon).resize(64, 64).png().toFile('website/public/favicon.png');
    await sharp(icon).resize(180, 180).png().toFile('website/public/apple-touch-icon.png');
    console.log('Prepared macOS icon, application logo and website icons.');
  }
}

await new IconPreparation().run();
