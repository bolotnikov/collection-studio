import fs from 'node:fs/promises';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import type { Card, Variant } from '../shared/Contracts';
import type { ImageStore } from '../application/ImageStore';

export class ImageFiles implements ImageStore {
  async save(folder: string, attemptId: string, bytes: Buffer): Promise<{ master: string; preview: string }> {
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 430 || metadata.height < 480)
      throw new Error('Invalid or undersized generated image.');
    if (!(await sharp(bytes).stats()).isOpaque)
      throw new Error('Generated card must have an opaque background.');
    await fs.mkdir(path.join(folder, 'images'), { recursive: true });
    const master = `images/${attemptId}-master.png`,
      preview = `images/${attemptId}.png`;
    await fs.writeFile(path.join(folder, master), bytes);
    await sharp(bytes)
      .resize(430, 480, { fit: 'cover', position: 'centre' })
      .toColourspace('srgb')
      .png()
      .toFile(path.join(folder, preview));
    return { master, preview };
  }
  selected(card: Card) {
    return card.attempts.find((a) => a.id === card.selectedAttemptId);
  }
  async sheet(folder: string, variant: Variant): Promise<string> {
    const tiles: OverlayOptions[] = [];
    for (const [index, card] of variant.cards.entries()) {
      const selected = this.selected(card);
      if (!selected) continue;
      tiles.push({
        input: await sharp(path.join(folder, selected.preview)).resize(215, 240).toBuffer(),
        left: (index % 5) * 231 + 16,
        top: Math.floor(index / 5) * 272 + 16,
      });
    }
    const file = path.join(folder, `${variant.id}-sheet.png`);
    await sharp({ create: { width: 1171, height: 560, channels: 3, background: '#eceae5' } })
      .composite(tiles)
      .png()
      .toFile(file);
    return file;
  }
}
