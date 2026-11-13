import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import {
  StyleContracts,
  type LibraryItem,
  type ProductionPolicy,
  type ReferenceEdit,
  type ReferenceMetadata,
} from '../shared/StyleContracts';
import type { Card, Run } from '../shared/Contracts';
import type { ReferenceLibraryPort } from '../application/style/ReferenceLibraryPort';

/** One curated catalog; immutable image bytes retain their original provenance. */
export class ReferenceLibrary implements ReferenceLibraryPort {
  items: LibraryItem[] = [];
  policy: ProductionPolicy = StyleContracts.policy.parse({});
  private writes: Promise<unknown> = Promise.resolve();
  private metadata: Record<string, ReferenceMetadata> = {};
  constructor(
    readonly root: string,
    private readonly storage: string,
  ) {}
  async init(resources: string): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    await fs.mkdir(this.storage, { recursive: true });
    const anchors = z
      .array(StyleContracts.libraryItem)
      .parse(JSON.parse(await fs.readFile(path.join(resources, 'library.json'), 'utf8')));
    for (const item of anchors) {
      const bytes = await fs.readFile(path.join(resources, 'references', item.filename));
      if (createHash('sha256').update(bytes).digest('hex') !== item.sha256)
        throw new Error('Reference source hash mismatch.');
      await fs.writeFile(path.join(this.root, item.filename), bytes);
    }
    const users = z.array(StyleContracts.libraryItem).parse(await this.read('user-library.json', []));
    this.metadata = z
      .record(z.string(), StyleContracts.referenceMetadata)
      .parse(await this.read('reference-metadata.json', {}));
    this.items = [...anchors, ...users.filter((item) => item.origin === 'user' && item.approved)].map(
      (item) => ({ ...item, metadata: this.metadata[item.id] ?? item.metadata }),
    );
    const savedPolicy = StyleContracts.policy.parse(await this.read('production-policy.json', {}));
    this.policy = StyleContracts.policy.parse({
      ...savedPolicy,
      styleThreshold: undefined,
      referenceLimit: undefined,
    });
  }
  get(id: string): LibraryItem {
    const item = this.items.find((item) => item.id === id);
    if (!item) throw new Error('Reference not found.');
    return structuredClone(item);
  }
  async savePolicy(input: ProductionPolicy): Promise<void> {
    const policy = StyleContracts.policy.parse({
      ...input,
      styleThreshold: undefined,
      referenceLimit: undefined,
    });
    await this.mutate(async () => {
      await this.write('production-policy.json', policy);
      this.policy = policy;
    });
  }
  async editMetadata(input: ReferenceEdit): Promise<void> {
    const edit = StyleContracts.referenceEdit.parse(input);
    await this.mutate(async () => {
      this.get(edit.id);
      const value = StyleContracts.referenceMetadata.parse(edit);
      const metadata = { ...this.metadata, [edit.id]: value };
      await this.write('reference-metadata.json', metadata);
      this.metadata = metadata;
      this.items = this.items.map((item) => (item.id === edit.id ? { ...item, metadata: value } : item));
    });
  }
  async importImage(file: string): Promise<LibraryItem> {
    if ((await fs.stat(file)).size > 50 * 1024 * 1024) throw new Error('Image must be smaller than 50 MB.');
    const bytes = await sharp(file, { limitInputPixels: 40_000_000, animated: false })
      .rotate()
      .png()
      .toBuffer();
    return this.mutate(async () =>
      this.add(bytes, {
        id: randomUUID(),
        title: 'Imported reference',
        category: 'unknown',
        source: 'local-import',
        origin: 'user',
        approved: true,
        tags: [],
      }),
    );
  }
  async approve(run: Run, card: Card, runFolder: string): Promise<void> {
    const attempt = card.attempts.find((a) => a.id === card.selectedAttemptId);
    if (!attempt?.review?.passed || attempt.reviewError || attempt.review.style < this.policy.styleThreshold)
      throw new Error('Only reviewed and accepted images can enter the user library.');
    const bytes = await fs.readFile(path.join(runFolder, attempt.preview));
    await this.mutate(async () => {
      await this.add(bytes, {
        id: attempt.id,
        title: card.subject,
        category: card.category,
        source: `run:${run.id}/card:${card.id}/attempt:${attempt.id}`,
        origin: 'user',
        approved: true,
        tags: [run.brief.theme, card.subject, card.role],
      });
    });
  }
  private async add(bytes: Buffer, details: Omit<LibraryItem, 'filename' | 'sha256'>): Promise<LibraryItem> {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const existing = this.items.find((item) => item.sha256 === sha256);
    if (existing) return structuredClone(existing);
    const item = StyleContracts.libraryItem.parse({ ...details, filename: `user-${details.id}.png`, sha256 });
    await fs.writeFile(path.join(this.root, item.filename), bytes);
    const items = [...this.items, item];
    await this.write(
      'user-library.json',
      items.filter((item) => item.origin === 'user'),
    );
    this.items = items;
    return structuredClone(item);
  }
  async remove(id: string): Promise<void> {
    await this.mutate(async () => {
      if (this.get(id).origin !== 'user') throw new Error('Original style anchors cannot be removed.');
      const items = this.items.filter((item) => item.id !== id);
      await this.write(
        'user-library.json',
        items.filter((item) => item.origin === 'user'),
      );
      this.items = items;
      // Retain image bytes and metadata for historical run provenance.
    });
  }
  private async read(name: string, fallback: unknown): Promise<unknown> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.storage, name), 'utf8'));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return fallback;
      throw error;
    }
  }
  private async mutate<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.writes.then(action);
    this.writes = operation.catch(() => {});
    return operation;
  }
  private async write(name: string, value: unknown): Promise<void> {
    const file = path.join(this.storage, name);
    await fs.writeFile(file + '.tmp', JSON.stringify(value, null, 2));
    await fs.rename(file + '.tmp', file);
  }
}
