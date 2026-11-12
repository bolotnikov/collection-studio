import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { StyleContracts, type LibraryItem, type ProductionPolicy } from '../shared/StyleContracts';
import type { Card, Run } from '../shared/Contracts';

/** Owns immutable bundled anchors and explicitly curated local supplements. */
export class ReferenceLibrary {
  items: LibraryItem[] = [];
  policy: ProductionPolicy = StyleContracts.policy.parse({});
  private writes: Promise<void> = Promise.resolve();
  constructor(
    readonly root: string,
    private readonly storage: string,
  ) {}
  async init(resources: string): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    const anchors = z
      .array(StyleContracts.libraryItem)
      .parse(JSON.parse(await fs.readFile(path.join(resources, 'library.json'), 'utf8')));
    for (const item of anchors) {
      const bytes = await fs.readFile(path.join(resources, 'references', item.filename));
      if (createHash('sha256').update(bytes).digest('hex') !== item.sha256)
        throw new Error('Reference source hash mismatch.');
      await fs.writeFile(path.join(this.root, item.filename), bytes);
    }
    let users: LibraryItem[] = [];
    try {
      users = z
        .array(StyleContracts.libraryItem)
        .parse(JSON.parse(await fs.readFile(path.join(this.storage, 'user-library.json'), 'utf8')));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    this.items = [...anchors, ...users.filter((item) => item.origin === 'user' && item.approved)];
    try {
      this.policy = StyleContracts.policy.parse(
        JSON.parse(await fs.readFile(path.join(this.storage, 'production-policy.json'), 'utf8')),
      );
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  async savePolicy(input: ProductionPolicy): Promise<void> {
    const policy = StyleContracts.policy.parse(input);
    await this.write('production-policy.json', policy);
    this.policy = policy;
  }
  async approve(run: Run, card: Card, runFolder: string): Promise<void> {
    const attempt = card.attempts.find((a) => a.id === card.selectedAttemptId);
    if (!attempt?.review?.passed || attempt.reviewError || attempt.review.style < this.policy.styleThreshold)
      throw new Error('Only reviewed and accepted images can enter the user library.');
    const bytes = await fs.readFile(path.join(runFolder, attempt.preview));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (this.items.some((item) => item.sha256 === sha256)) return;
    const item = StyleContracts.libraryItem.parse({
      id: attempt.id,
      filename: `user-${attempt.id}.png`,
      title: card.subject,
      category: card.category,
      sha256,
      source: `run:${run.id}/card:${card.id}/attempt:${attempt.id}`,
      origin: 'user',
      approved: true,
      tags: [run.brief.theme, card.subject, card.role],
    });
    await fs.writeFile(path.join(this.root, item.filename), bytes);
    const items = [...this.items, item];
    await this.write(
      'user-library.json',
      items.filter((i) => i.origin === 'user'),
    );
    this.items = items;
  }
  async remove(id: string): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (!item || item.origin !== 'user') throw new Error('Original style anchors cannot be removed.');
    const items = this.items.filter((i) => i.id !== id);
    await this.write(
      'user-library.json',
      items.filter((i) => i.origin === 'user'),
    );
    this.items = items;
    // Retain image bytes for historical run provenance.
  }
  private async write(name: string, value: unknown): Promise<void> {
    const snapshot = JSON.stringify(value, null, 2);
    const operation = this.writes.then(async () => {
      const file = path.join(this.storage, name);
      await fs.writeFile(file + '.tmp', snapshot);
      await fs.rename(file + '.tmp', file);
    });
    this.writes = operation.catch(() => {});
    await operation;
  }
}
