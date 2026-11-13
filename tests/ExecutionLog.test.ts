import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { ExecutionJournal } from '../src/infrastructure/ExecutionJournal';
import { ExecutionLogExporter } from '../src/infrastructure/ExecutionLogExporter';
import { RunRepository } from '../src/infrastructure/RunRepository';
import { AuditedFetch } from '../src/infrastructure/AuditedFetch';
import { OpenAiProvider } from '../src/infrastructure/OpenAiProvider';
import { Contracts } from '../src/shared/Contracts';
import sourceProfile from '../resources/style-profile.json';

const folders: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-audit-'));
  folders.push(root);
  const journal = new ExecutionJournal(root);
  const run = Contracts.run.parse({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    brief: {
      theme: 'Offline audit',
      wishes: '',
      variants: 1,
      quality: 'low',
      maxImageCalls: 10,
      autoRepair: false,
    },
    status: 'planning',
    stage: 'Planning',
    imageCalls: 0,
    variants: [],
    events: [],
    provider: 'codex',
    imageModel: 'fixture',
    textModel: 'fixture',
    selectedVariantId: null,
  });
  return { root, journal, run, profile: Contracts.profile.parse(sourceProfile) };
}
it('preserves deterministic decisions across restart and exports an honest historical log without new requests', async () => {
  const { root, journal, run, profile } = await fixture();
  const store = new RunRepository(root, async () => {}, journal);
  await store.save(run);
  await store.saveProfile(run.id, profile);
  run.stage = 'Pilot approved';
  run.status = 'paused';
  run.events.push({ at: new Date().toISOString(), message: 'Pilot approved after reference comparison' });
  await store.save(run);
  const reopened = new ExecutionJournal(root);
  const entries = await reopened.entries(run.id);
  expect(entries).toHaveLength(2);
  expect(JSON.stringify(entries[1])).toContain('/stage');
  expect(JSON.stringify(entries[1])).toContain('Pilot approved');
  const render = new ExecutionLogExporter(reopened);
  const document = await render.render(await store.get(run.id), await store.getProfile(run.id));
  expect(document).toContain('Pilot approved after reference comparison');
  expect(document).toContain('Production workflow');
  expect(document).toContain('Configuration and knowledge snapshot');
  expect(document).toContain('does not make any LLM calls');
  const legacy = { ...run, id: randomUUID() };
  expect(await render.render(legacy, profile)).toContain('cannot be reconstructed');
});
it('records failed and concurrent calls with stable IDs while excluding secrets, binary data and private reasoning', async () => {
  const { journal, run } = await fixture();
  const results = await Promise.allSettled([
    journal.capture(
      run.id,
      'Planner',
      { prompt: 'Literal ``` and sk-fixtureSecret123', apiKey: 'secret-value' },
      async () => ({ selection: 'category-3', reasoning: 'private-body' }),
    ),
    journal.capture(run.id, 'Verifier', { category: '3' }, async () => {
      throw new Error('provider offline');
    }),
  ]);
  expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
  await journal.record(run.id, 'Worker', 'tools', {
    events: [
      { item: { type: 'reasoning', text: 'hidden-body' } },
      { type: 'tool_call', image_url: 'data:image/png;base64,cGl4ZWxz' },
    ],
    b64_json: 'binary-body',
  });
  const entries = await journal.entries(run.id);
  const log = JSON.stringify(entries);
  for (const secret of [
    'sk-fixtureSecret123',
    'secret-value',
    'private-body',
    'hidden-body',
    'cGl4ZWxz',
    'binary-body',
  ])
    expect(log).not.toContain(secret);
  expect(log).toContain('provider offline');
  expect(log).toContain('category-3');
  expect(entries.filter((entry) => entry.action.startsWith('request.'))).toHaveLength(4);
});
it('captures the real OpenAI image request and response once, with hashed file inputs instead of image payloads', async () => {
  const { root, journal, run } = await fixture();
  const file = path.join(root, 'reference.png');
  await fs.writeFile(file, 'fixture image bytes');
  const transport = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from('result pixels').toString('base64') }], created: 1 }),
        {
          headers: { 'content-type': 'application/json', 'x-request-id': 'image-request' },
        },
      ),
  );
  vi.stubGlobal('fetch', transport);
  const audited = new AuditedFetch(journal, run.id);
  const provider = new OpenAiProvider(
    'sk-fixtureCredential123',
    'fixture-image',
    'fixture-text',
    undefined,
    audited.transport(),
  );
  const result = await provider.image('Specific composition prompt', [file], 'low');
  expect(result.bytes.toString()).toBe('result pixels');
  expect(transport).toHaveBeenCalledOnce();
  const log = JSON.stringify(await journal.entries(run.id));
  expect(log).toContain('Specific composition prompt');
  expect(log).toContain('fixture-image');
  expect(log).toContain('sha256');
  expect(log).toContain('image-request');
  expect(log).not.toContain('sk-fixtureCredential123');
  expect(log).not.toContain(Buffer.from('result pixels').toString('base64'));
});
it('keeps array changes granular instead of copying all card evidence on every checkpoint', () => {
  expect(
    ExecutionJournal.changes(
      { cards: [{ id: 'a', state: 'pending' }, { id: 'b' }] },
      { cards: [{ id: 'a', state: 'done' }, { id: 'b' }] },
    ),
  ).toEqual([{ path: '/cards/0/state', before: 'pending', after: 'done' }]);
});
