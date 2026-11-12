import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { CodexStylePreparation } from '../src/infrastructure/style/CodexStylePreparation';
import { StyleContracts, type LibraryItem } from '../src/shared/StyleContracts';

const folders: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});
async function fixture(count: number) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-index-'));
  folders.push(folder);
  const items: LibraryItem[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = Buffer.from(`test image ${i}`),
      filename = `${i}.png`;
    await fs.writeFile(path.join(folder, filename), bytes);
    items.push(
      StyleContracts.libraryItem.parse({
        id: String(i),
        filename,
        title: `reference ${i}`,
        category: 'unknown',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        source: 'fixture',
      }),
    );
  }
  const runner = new CodexRunner('/unused', folder, 'test-model');
  const analysis = StyleContracts.analysis.parse({
    eligible: true,
    exclusionReason: '',
    subject: 'Object',
    materials: ['wood'],
    silhouette: 'rounded',
    rendering: 'painted',
    lighting: 'soft',
    palette: 'varied',
    background: 'simple',
    category: '1',
    usefulPrinciples: ['soft lighting'],
    avoidCopying: ['subject'],
  });
  const calls = vi.spyOn(runner, 'run').mockImplementation(async (prompt, schema) => {
    const marker = 'Image order: ';
    const start = prompt.indexOf(marker);
    const order: unknown = JSON.parse(prompt.slice(start + marker.length));
    const decoded = StyleContracts.libraryItem.pick({ id: true }).array().parse(order);
    return {
      value: schema.parse({ entries: decoded.map((r) => ({ id: r.id, analysis })) }),
      folder,
      usage: null,
      threadId: null,
    };
  });
  const create = () =>
    new CodexStylePreparation(
      runner,
      items,
      folder,
      path.join(folder, 'cache'),
      'test-model',
      StyleContracts.policy.parse({}),
    );
  return { folder, items, calls, create };
}
describe('Style library analysis', () => {
  it('batches eight images, validates structured output and reuses the content/model cache', async () => {
    const { calls, create } = await fixture(10);
    await create().initialize();
    expect(calls).toHaveBeenCalledTimes(2);
    await create().initialize();
    expect(calls).toHaveBeenCalledTimes(2);
  });
  it('checks cancellation between batches and resumes from retained analysis', async () => {
    const { calls, create } = await fixture(18);
    await expect(create().initialize(() => calls.mock.calls.length >= 2)).rejects.toThrow('paused');
    expect(calls).toHaveBeenCalledTimes(2);
    await create().initialize();
    expect(calls).toHaveBeenCalledTimes(3);
  });
  it('reports cached progress first and awaited progress after each completed batch pair', async () => {
    const { create } = await fixture(18);
    const progress: Array<[number, number]> = [];
    await create().initialize(undefined, async (indexed, total) => {
      progress.push([indexed, total]);
    });
    expect(progress).toEqual([
      [0, 18],
      [16, 18],
      [18, 18],
    ]);
    const cachedProgress: Array<[number, number]> = [];
    await create().initialize(undefined, async (indexed, total) => {
      cachedProgress.push([indexed, total]);
    });
    expect(cachedProgress).toEqual([[18, 18]]);
  });
  it('projects cached analysis for display without further model calls or source mutation', async () => {
    const { calls, create, items } = await fixture(2);
    const before = await create().catalog();
    expect(before[0]?.category).toBe('unknown');
    expect(calls).not.toHaveBeenCalled();
    await create().initialize();
    const display = await create().catalog();
    expect(display[0]?.category).toBe('1');
    expect(display[0]?.title).toBe('Object');
    expect(display[0]?.tags).toContain('wood');
    expect(items[0]?.category).toBe('unknown');
    expect(calls).toHaveBeenCalledTimes(1);
  });
  it('rejects modified source files before calling the visual agent', async () => {
    const { folder, calls, create } = await fixture(1);
    await fs.writeFile(path.join(folder, '0.png'), 'changed');
    await expect(create().initialize()).rejects.toThrow('integrity mismatch');
    expect(calls).not.toHaveBeenCalled();
  });
});

it('keeps manual category/description authoritative over cached analysis without reindexing pixels', async () => {
  const f = await fixture(2);
  await f.create().initialize();
  const first = f.items[0];
  if (!first) throw new Error('Missing fixture');
  first.metadata = { category: '4', description: 'A brass telescope beside an observatory window.' };
  const display = await f.create().catalog();
  expect(display[0]?.category).toBe('4');
  expect(display[0]?.title).toBe(first.metadata.description);
  expect(display[0]?.tags).toContain('wood');
  expect(f.calls).toHaveBeenCalledTimes(1);
});
it('proposes automatic metadata for one image without changing persisted catalog or cached classification', async () => {
  const f = await fixture(2);
  const first = f.items[0];
  if (!first) throw new Error('Missing fixture');
  const result = await f.create().analyzeReference(first);
  expect(result.category).toBe('1');
  expect(f.calls).toHaveBeenCalledOnce();
  expect(f.calls.mock.calls[0]?.[2]).toEqual([path.join(f.folder, first.filename)]);
  expect((await f.create().catalog())[0]?.category).toBe('unknown');
  expect(first.metadata).toBeUndefined();
});
