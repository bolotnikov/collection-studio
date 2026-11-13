import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { ExecutionJournal } from '../src/infrastructure/ExecutionJournal';
import { ExecutionLogExporter } from '../src/infrastructure/ExecutionLogExporter';
import { RunRepository } from '../src/infrastructure/RunRepository';
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
  expect(document).toContain('Состояние работы: приостановлено');
  expect(document).toContain('машинной диагностике');
  expect(document).toContain('без обращений к моделям');
  const legacy = { ...run, id: randomUUID() };
  expect(await render.render(legacy, profile)).toContain('восстановить нельзя');
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
it('keeps array changes granular instead of copying all card evidence on every checkpoint', () => {
  expect(
    ExecutionJournal.changes(
      { cards: [{ id: 'a', state: 'pending' }, { id: 'b' }] },
      { cards: [{ id: 'a', state: 'done' }, { id: 'b' }] },
    ),
  ).toEqual([{ path: '/cards/0/state', before: 'pending', after: 'done' }]);
});

it('pairs concurrent requests in chronological Russian narration and keeps full sanitized machine evidence', async () => {
  const { journal, run, profile } = await fixture();
  await journal.record(run.id, 'CodexProvider.designSlotSet', 'request.started', {
    callId: 'first',
    request: { model: 'gpt-6.1-terra', prompt: 'Точный запрос А', secret: 'hidden-secret' },
  });
  await journal.record(run.id, 'CodexProvider.image', 'request.started', {
    callId: 'second',
    request: { prompt: 'Точный запрос Б' },
  });
  await journal.record(run.id, 'CodexProvider.image', 'request.failed', {
    callId: 'second',
    error: 'provider offline',
  });
  await journal.record(run.id, 'CodexProvider.designSlotSet', 'request.completed', {
    callId: 'first',
    response: { response: { variants: [{ title: 'Набор', cards: [{ subject: 'Ключ' }] }] } },
  });
  const exporter = new ExecutionLogExporter(journal);
  const human = await exporter.render(run, profile);
  expect(human.indexOf('Отправлен запрос №1')).toBeLessThan(human.indexOf('Отправлен запрос №2'));
  expect(human.indexOf('Запрос №2 завершился ошибкой')).toBeLessThan(
    human.indexOf('Получен ответ на запрос №1'),
  );
  expect(human).toContain('Точный запрос А');
  expect(human).toContain('Ключ');
  const machine = JSON.parse(await exporter.diagnostics(run, profile));
  expect(machine.schema).toBe('collection-studio-diagnostics-v2');
  expect(machine.journal).toHaveLength(4);
  expect(machine.run.id).toBe(run.id);
  expect(machine.profile.id).toBe(profile.id);
  expect(JSON.stringify(machine)).not.toContain('hidden-secret');
});

it('exports full long requests and responses in collapsed blocks while preserving redaction and literal markup', async () => {
  const { journal, run, profile } = await fixture();
  const prompt =
    'Начало задания\n' + 'Полный текст задания.\n'.repeat(300) + '````\n</details>\nКонец задания';
  const response = {
    findings: ['Полное наблюдение.\n'.repeat(300) + 'Конец ответа'],
    secret: 'hidden-secret',
  };
  await journal.capture(run.id, 'CodexProvider.verifyComposition', { prompt }, async () => response);

  const document = await new ExecutionLogExporter(journal).render(run, profile);
  const requestBlock = document.match(
    /<details>\n<summary>Точный текст отправленного задания<\/summary>\n\n(`{3,})text\n([\s\S]*?)\n\1\n\n<\/details>/,
  );
  expect(requestBlock?.[2]).toBe(prompt);
  const responseBlock = document.match(
    /<details>\n<summary>Полный исходный ответ модели<\/summary>\n\n(`{3,})text\n([\s\S]*?)\n\1\n\n<\/details>/,
  );
  expect(JSON.parse(responseBlock?.[2] ?? 'null')).toEqual({ ...response, secret: '[redacted]' });
  expect(document).not.toMatch(/<details\s+open/);
  expect(document).not.toContain('hidden-secret');
  expect(document).not.toContain('Полный текст находится в отдельном файле');
});
