import { PromptCatalog } from '../application/prompts/PromptCatalog';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp, { type OverlayOptions } from 'sharp';

type PackedCard = {
  originalIndex: number;
  filename: string;
  sha256: string;
  position: string;
  left: number;
  top: number;
  width: number;
  height: number;
};
type PackedAttachment = { attachmentIndex: number; filename: string; cards: PackedCard[] };
export type ReferencePackingManifest = {
  version: 1;
  mode: 'direct' | 'contact-sheets';
  originalCount: number;
  attachmentCount: number;
  attachments: PackedAttachment[];
};

/** Adapts complete references to the native image tool's five-path limit without dropping art. */
export class ReferenceImagePacker {
  constructor(private readonly prompts = new PromptCatalog()) {}
  async pack(
    inputs: string[],
    folder: string,
  ): Promise<{
    paths: string[];
    instruction: string;
    manifest: ReferencePackingManifest;
  }> {
    if (inputs.length > 15)
      throw new Error('Image generation supports at most 15 complete references in five packed sheets.');
    const packed = inputs.length > 5;
    const attachmentCount = packed ? Math.ceil(inputs.length / 3) : inputs.length;
    const manifest: ReferencePackingManifest = {
      version: 1,
      mode: packed ? 'contact-sheets' : 'direct',
      originalCount: inputs.length,
      attachmentCount,
      attachments: [],
    };
    const paths: string[] = [];
    let offset = 0;
    for (let sheet = 0; sheet < attachmentCount; sheet++) {
      const count = packed ? Math.ceil((inputs.length - offset) / (attachmentCount - sheet)) : 1;
      const group = inputs.slice(offset, offset + count);
      const cards: PackedCard[] = [];
      const overlays: OverlayOptions[] = [];
      let left = 0;
      let height = 0;
      for (const [index, filename] of group.entries()) {
        const bytes = await fs.readFile(filename);
        const metadata = await sharp(bytes).metadata();
        if (!metadata.width || !metadata.height) throw new Error(`Invalid reference dimensions: ${filename}`);
        cards.push({
          originalIndex: offset + index + 1,
          filename: path.basename(filename),
          sha256: createHash('sha256').update(bytes).digest('hex'),
          position:
            count === 1 ? 'whole image' : index === 0 ? 'left' : index === count - 1 ? 'right' : 'middle',
          left,
          top: 0,
          width: metadata.width,
          height: metadata.height,
        });
        overlays.push({ input: bytes, left, top: 0 });
        left += metadata.width + 16;
        height = Math.max(height, metadata.height);
      }
      const original = group[0];
      if (!original) throw new Error('Empty reference group.');
      const output = packed ? path.join(folder, `reference-sheet-${sheet + 1}.png`) : original;
      if (packed) {
        await sharp({ create: { width: left - 16, height, channels: 4, background: '#00000000' } })
          .composite(overlays)
          .png()
          .toFile(output);
      }
      paths.push(output);
      manifest.attachments.push({ attachmentIndex: sheet + 1, filename: path.basename(output), cards });
      offset += count;
    }
    await fs.writeFile(path.join(folder, 'reference-packing.json'), JSON.stringify(manifest, null, 2) + '\n');
    const mapping = manifest.attachments
      .map((attachment) =>
        this.prompts.render('ReferenceImagePacker.pack', {
          attachmentType: packed ? 'Sheet' : 'Attachment',
          attachmentIndex: attachment.attachmentIndex,
          filename: attachment.filename,
          positions: attachment.cards
            .map((card) =>
              this.prompts.render('references.position', {
                position: card.position,
                index: card.originalIndex,
              }),
            )
            .join('; '),
        }),
      )
      .join('\n');
    return {
      paths,
      manifest,
      instruction: this.prompts.render('ReferenceImagePacker.pack.2', {
        mapping: mapping,
        packingInstructions: packed ? this.prompts.render('references.packed') : '',
      }),
    };
  }
}
