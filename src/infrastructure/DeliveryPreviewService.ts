import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DeliveryContracts, type DeliveryPreview } from '../shared/DeliveryContracts';
import type { Run } from '../shared/Contracts';
import { DeliveryReadiness } from '../domain/DeliveryReadiness';
import { ImageFiles } from './ImageFiles';
import { DeliveryComposer } from './DeliveryComposer';

/** Derived presentation files never change review evidence or selected source images. */
export class DeliveryPreviewService {
  private readonly pending = new Map<string, Promise<DeliveryPreview[]>>();
  constructor(
    private readonly images: ImageFiles,
    private readonly knowledgeRoot: string,
  ) {}

  async export(
    run: Run,
    variantId: string,
    folder: string,
    expected: DeliveryPreview,
    destination: string,
  ): Promise<void> {
    const previews = await this.create(run, variantId, folder);
    const preview = previews.find(
      (preview) =>
        preview.id === expected.id &&
        preview.sha256 === expected.sha256 &&
        preview.templateSha256 === expected.templateSha256,
    );
    if (!preview) throw new Error('The window preview has changed. Reopen the preview before exporting.');
    const bytes = await fs.readFile(path.join(folder, preview.filename));
    if (createHash('sha256').update(bytes).digest('hex') !== preview.sha256)
      throw new Error('Window preview integrity mismatch.');
    await fs.writeFile(destination, bytes);
  }

  async create(run: Run, variantId: string, folder: string): Promise<DeliveryPreview[]> {
    const variant = run.variants.find((item) => item.id === variantId);
    if (!variant || !DeliveryReadiness.accepts(run, variant))
      throw new Error('Production export requires passed card and set reviews.');
    const cards = await Promise.all(
      variant.cards.map((card) => {
        const selected = this.images.selected(card);
        if (!selected) throw new Error('Selected attempt missing.');
        return this.images.read(folder, selected, 'preview');
      }),
    );
    const sheet = await this.images.sheet(folder, variant, variant.sourceEvidence?.cleanSets?.[0]?.layout);
    if (run.reviewProtocol === 'set-v3' && path.basename(sheet) !== variant.reviewSheet)
      throw new Error('Export sheet no longer matches the reviewed image bytes.');
    const layout = DeliveryContracts.defaults();
    const identity = createHash('sha256').update(JSON.stringify(layout));
    cards.forEach((bytes) => identity.update(bytes));
    const key = `${folder}:${identity.digest('hex')}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const task = this.compose(cards, folder);
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }

  private async compose(cards: Buffer[], folder: string): Promise<DeliveryPreview[]> {
    const layout = DeliveryContracts.defaults();
    const result: DeliveryPreview[] = [];
    await fs.mkdir(path.join(folder, 'delivery'), { recursive: true });
    for (const template of layout.templates) {
      const bytes = await fs.readFile(
        path.join(this.knowledgeRoot, 'images/delivery', `${template.sha256}.png`),
      );
      if (createHash('sha256').update(bytes).digest('hex') !== template.sha256)
        throw new Error('Delivery template integrity mismatch.');
      const output = await new DeliveryComposer().compose(cards, bytes, layout);
      const sha256 = createHash('sha256').update(output).digest('hex');
      const filename = `delivery/${template.id}-${sha256}.png`;
      const target = path.join(folder, filename),
        temporary = `${target}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, output);
      await fs.rename(temporary, target);
      result.push({ id: template.id, filename, sha256, templateSha256: template.sha256 });
    }
    return result;
  }
}
