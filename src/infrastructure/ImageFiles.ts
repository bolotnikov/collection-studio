import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { SetSheetComposer } from './SetSheetComposer';
import { SetSheetLayout, type SheetLayout } from '../shared/SetSheetLayout';
import type { Attempt, Card, Variant } from '../shared/Contracts';
import type { ImageStore } from '../application/ImageStore';

export class ImageFiles implements ImageStore {
  async save(folder: string, attemptId: string, bytes: Buffer) {
    const masterBytes = await sharp(bytes).rotate().toColourspace('srgb').png().toBuffer();
    const metadata = await sharp(masterBytes).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 430 || metadata.height < 480)
      throw new Error('Invalid or undersized generated image.');
    if (!(await sharp(masterBytes).stats()).isOpaque)
      throw new Error('Generated card must have an opaque background.');
    await fs.mkdir(path.join(folder, 'images'), { recursive: true });
    const master = `images/${attemptId}-master.png`,
      preview = `images/${attemptId}.png`;
    const previewBytes = await sharp(masterBytes)
      .resize(430, 480, { fit: 'cover', position: 'centre' })
      .toColourspace('srgb')
      .png()
      .toBuffer();
    await fs.writeFile(path.join(folder, master), masterBytes);
    await fs.writeFile(path.join(folder, preview), previewBytes);
    return {
      master,
      preview,
      hashes: {
        master: createHash('sha256').update(masterBytes).digest('hex'),
        preview: createHash('sha256').update(previewBytes).digest('hex'),
      },
    };
  }
  async read(folder: string, attempt: Attempt, kind: 'master' | 'preview'): Promise<Buffer> {
    const root = path.resolve(folder),
      file = path.resolve(root, attempt[kind]);
    if (!file.startsWith(root + path.sep)) throw new Error('Image path escapes the run folder.');
    const bytes = await fs.readFile(file);
    if (attempt.hashes && createHash('sha256').update(bytes).digest('hex') !== attempt.hashes[kind])
      throw new Error('Reviewed image bytes have changed.');
    const metadata = await sharp(bytes).metadata();
    if (
      metadata.format !== 'png' ||
      !metadata.width ||
      !metadata.height ||
      (kind === 'preview' && (metadata.width !== 430 || metadata.height !== 480))
    )
      throw new Error('Invalid production PNG format or dimensions.');
    return bytes;
  }
  selected(card: Card) {
    return card.attempts.find((a) => a.id === card.selectedAttemptId);
  }
  async sheet(
    folder: string,
    variant: Variant,
    layout: SheetLayout = SetSheetLayout.defaults(),
  ): Promise<string> {
    const cards = await Promise.all(
      variant.cards.map(async (card) => {
        const selected = this.selected(card);
        if (!selected) throw new Error('Clean set review requires ten selected cards.');
        return this.read(folder, selected, 'preview');
      }),
    );
    const bytes = await new SetSheetComposer().compose(cards, layout);
    const identity = createHash('sha256').update(bytes).digest('hex');
    const file = path.join(folder, `${variant.id}-${identity.slice(0, 24)}-sheet.png`);
    await fs.writeFile(file, bytes);
    return file;
  }
}
