import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import sharp from 'sharp';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { ExecutionJournal } from '../src/infrastructure/ExecutionJournal';
import { randomUUID } from 'node:crypto';
import { PromptCatalog } from '../src/application/prompts/PromptCatalog';
import { CodexProvider } from '../src/infrastructure/CodexProvider';
import { CodexImageArtifacts } from '../src/infrastructure/CodexImageArtifacts';

const folders: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(folders.splice(0).map((p) => fs.rm(p, { recursive: true, force: true })));
});

it('uses CLI stdin without shell interpolation, strips API credentials and stages real input files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-cli-test-'));
  folders.push(root);
  const executable = path.join(root, 'fake-codex'),
    source = path.join(root, 'reference.png');
  await fs.writeFile(source, Buffer.from('reference fixture bytes'));
  await fs.writeFile(
    executable,
    `#!/usr/bin/env node
const fs=require('node:fs');let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{
 const args=process.argv.slice(2),folder=args[args.indexOf('-C')+1];
 fs.writeFileSync(folder+'/observed.json',JSON.stringify({input,args,apiKey:process.env.OPENAI_API_KEY??null,codexKey:process.env.CODEX_API_KEY??null,baseUrl:process.env.OPENAI_BASE_URL??null}));
 fs.writeFileSync(args[args.indexOf('-o')+1],JSON.stringify({answer:'verified'}));
 console.log(JSON.stringify({type:'thread.started',thread_id:'fixture-thread'}));
 console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:12,output_tokens:3}}));
});`,
    { mode: 0o700 },
  );
  vi.stubEnv('OPENAI_API_KEY', 'fixture-secret');
  vi.stubEnv('CODEX_API_KEY', 'fixture-secret');
  vi.stubEnv('OPENAI_BASE_URL', 'https://invalid.example');
  const injection = 'A literal prompt with $(touch SHOULD_NOT_EXIST), `commands`, quotes and\na second line';
  const journal = new ExecutionJournal(root);
  const runId = randomUUID();
  const result = await new CodexRunner(
    executable,
    path.join(root, 'jobs'),
    'fixture-model',
    new PromptCatalog(),
    { journal, runId },
  ).run(injection, z.object({ answer: z.string() }), [source]);
  const observed = z
    .object({
      input: z.string(),
      args: z.array(z.string()),
      apiKey: z.null(),
      codexKey: z.null(),
      baseUrl: z.null(),
    })
    .parse(JSON.parse(await fs.readFile(path.join(result.folder, 'observed.json'), 'utf8')));
  expect(observed.input).toContain(injection);
  expect(observed.args).toContain('--output-schema');
  expect(observed.args).toContain('workspace-write');
  expect(observed.args).toContain('shell_tool');
  expect(await fs.readFile(path.join(result.folder, 'input-1.png'))).toEqual(await fs.readFile(source));
  expect(result.value.answer).toBe('verified');
  expect(result.threadId).toBe('fixture-thread');
  expect(result.usage?.input_tokens).toBe(12);
  const entries = await journal.entries(runId);
  expect(entries.map((entry) => entry.action)).toEqual([
    'request.started',
    'worker.started',
    'worker.completed',
    'request.completed',
  ]);
  const log = JSON.stringify(entries);
  expect(log).toContain('fixture-thread');
  expect(log).toContain('sha256');
  expect(log).toContain('verified');
  expect(log).not.toContain('fixture-secret');
  await expect(fs.access(path.join(root, 'SHOULD_NOT_EXIST'))).rejects.toThrow();
});

it.each(['truncated tool output', 'Argument list too long'])(
  'collects the native image even when the worker reports %s, without shell or base64 transfer',
  async (message) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-cli-artifact-'));
    folders.push(root);
    vi.stubEnv('CODEX_HOME', root);
    const threadId = randomUUID();
    const directory = path.join(root, 'generated_images', threadId);
    await fs.mkdir(directory, { recursive: true });
    const source = path.join(directory, `exec-${randomUUID()}.png`);
    await sharp({ create: { width: 512, height: 512, channels: 3, background: '#ab6721' } })
      .png()
      .toFile(source);
    const executable = path.join(root, 'fake-codex');
    await fs.writeFile(
      executable,
      `#!/usr/bin/env node
const fs = require('node:fs'); process.stdin.resume(); process.stdin.on('end', () => {
 const args = process.argv.slice(2);
 if (!args.some((arg, index) => arg === '--disable' && args[index + 1] === 'shell_tool')) process.exit(2);
 fs.writeFileSync(args[args.indexOf('-o') + 1], JSON.stringify({success:false, tool:'image_gen', message:${JSON.stringify(message)}}));
 console.log(JSON.stringify({type:'thread.started', thread_id:${JSON.stringify(threadId)}}));
 console.log(JSON.stringify({type:'turn.completed'}));
});`,
      { mode: 0o700 },
    );
    const runner = new CodexRunner(executable, path.join(root, 'jobs'), 'fixture');
    const result = await new CodexProvider(runner).image('Generate a card', [], 'high');
    expect(result.bytes).toEqual(await fs.readFile(source));
    expect(result.requestId).toBe(threadId);
    expect(result.usage).toHaveProperty('imageArtifact.source', source);
    expect(result.usage).toHaveProperty('imageArtifact.sha256', expect.any(String));
    expect(await fs.readFile(source)).toEqual(result.bytes);
  },
);

it('never substitutes another thread image or an ambiguous or invalid artifact', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-cli-artifact-'));
  folders.push(root);
  const collector = new CodexImageArtifacts(root);
  const threadId = randomUUID();
  const directory = path.join(root, 'generated_images', threadId);
  await fs.mkdir(directory, { recursive: true });
  const image = path.join(directory, `exec-${randomUUID()}.png`);
  await fs.writeFile(image, 'not a PNG');
  expect(await collector.collect(root, randomUUID())).toBeNull();
  expect(await collector.collect(root, '../escape')).toBeNull();
  expect(await collector.collect(root, null)).toBeNull();
  await expect(collector.collect(root, threadId)).rejects.toThrow();
  await fs.writeFile(path.join(directory, `exec-${randomUUID()}.png`), 'second candidate');
  await expect(collector.collect(root, threadId)).rejects.toThrow('multiple image artifacts');
  await expect(fs.access(path.join(root, 'image.png'))).rejects.toThrow();
});

it('preserves diagnostic output when the CLI process fails', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-cli-test-'));
  folders.push(root);
  const executable = path.join(root, 'fake-codex');
  await fs.writeFile(
    executable,
    `#!/usr/bin/env node
process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'turn.failed',error:{message:'fixture failure'}}));console.error('fixture diagnostic');process.exitCode=2;});`,
    { mode: 0o700 },
  );
  const jobs = path.join(root, 'jobs');
  await expect(
    new CodexRunner(executable, jobs, 'fixture-model').run('test', z.object({ answer: z.string() })),
  ).rejects.toThrow('code 2: fixture failure');
  const [job] = await fs.readdir(jobs);
  if (!job) throw new Error('Job not saved');
  expect(await fs.readFile(path.join(jobs, job, 'stderr.log'), 'utf8')).toContain('fixture diagnostic');
  expect(await fs.readFile(path.join(jobs, job, 'events.jsonl'), 'utf8')).toContain('turn.failed');
});

it.each(['turn.failed', 'error'])(
  'surfaces nested server diagnostics from %s rather than stdin progress',
  async (type) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-cli-failure-'));
    folders.push(root);
    const executable = path.join(root, 'fake-codex');
    const message = JSON.stringify({
      type: 'error',
      error: { message: "Invalid schema: required is missing '5'.", code: 'invalid_json_schema' },
      status: 400,
    });
    const event = type === 'error' ? { type, message } : { type, error: { message } };
    await fs.writeFile(
      executable,
      `#!/usr/bin/env node
process.stdin.resume();process.stdin.on('end',()=>{
 console.log('non-JSON startup diagnostic');
 console.log(${JSON.stringify(JSON.stringify(event))});
 console.error('Reading prompt from stdin...');process.exitCode=1;
});`,
      { mode: 0o700 },
    );
    await expect(
      new CodexRunner(executable, path.join(root, 'jobs'), 'fixture-model').run(
        'test',
        z.object({ answer: z.string() }),
      ),
    ).rejects.toThrow("code 1: Invalid schema: required is missing '5'.");
  },
);

it('keeps stderr as a fallback for process failures without structured events', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-cli-failure-'));
  folders.push(root);
  const executable = path.join(root, 'fake-codex');
  await fs.writeFile(
    executable,
    `#!/usr/bin/env node
process.stdin.resume();process.stdin.on('end',()=>{console.error('Unsupported CLI flag');process.exitCode=2;});`,
    { mode: 0o700 },
  );
  await expect(
    new CodexRunner(executable, path.join(root, 'jobs'), 'fixture-model').run(
      'test',
      z.object({ answer: z.string() }),
    ),
  ).rejects.toThrow('code 2: Unsupported CLI flag');
});

it('sends nullable optional fields to the CLI and restores their absence in the result', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-cli-schema-'));
  folders.push(root);
  const executable = path.join(root, 'fake-codex');
  await fs.writeFile(
    executable,
    `#!/usr/bin/env node
const fs=require('node:fs');process.stdin.resume();process.stdin.on('end',()=>{
 const args=process.argv.slice(2),schema=JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema')+1],'utf8'));
 if(!schema.required.includes('optional') || !schema.properties.optional.anyOf.some(s=>s.type==='null')){
   console.error('Schema is not strict-compatible');process.exitCode=1;return;
 }
 fs.writeFileSync(args[args.indexOf('-o')+1],JSON.stringify({answer:'verified',optional:null}));
 console.log(JSON.stringify({type:'turn.completed'}));
});`,
    { mode: 0o700 },
  );
  const result = await new CodexRunner(executable, path.join(root, 'jobs'), 'fixture-model').run(
    'test',
    z.object({ answer: z.string(), optional: z.string().optional() }),
  );
  expect(result.value).toEqual({ answer: 'verified' });
});

it('packs generation attachments while retaining staged originals and structured provenance', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-cli-packing-'));
  folders.push(root);
  const executable = path.join(root, 'fake-codex');
  await fs.writeFile(
    executable,
    `#!/usr/bin/env node
const fs=require('node:fs');let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{
 const args=process.argv.slice(2),folder=args[args.indexOf('-C')+1];
 fs.writeFileSync(folder+'/observed.json',JSON.stringify({input,args}));
 fs.writeFileSync(args[args.indexOf('-o')+1],JSON.stringify({answer:'verified'}));
 console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:12}}));
});`,
    { mode: 0o700 },
  );
  const inputs: string[] = [];
  for (let index = 0; index < 8; index++) {
    const file = path.join(root, `original-${index}.png`);
    await sharp({ create: { width: 30 + index, height: 40, channels: 3, background: '#ab6721' } })
      .png()
      .toFile(file);
    inputs.push(file);
  }
  const result = await new CodexRunner(executable, path.join(root, 'jobs'), 'fixture-model').run(
    'Reference 8: use the lighting only.',
    z.object({ answer: z.string() }),
    inputs,
    true,
  );
  const observed = z
    .object({ input: z.string(), args: z.array(z.string()) })
    .parse(JSON.parse(await fs.readFile(path.join(result.folder, 'observed.json'), 'utf8')));
  const attached = observed.args.flatMap((arg, index) =>
    arg === '-i' ? observed.args.slice(index + 1, index + 2) : [],
  );
  expect(attached).toHaveLength(3);
  expect(attached.every((file) => path.basename(file).startsWith('reference-sheet-'))).toBe(true);
  expect(observed.input).toContain('right = ORIGINAL REFERENCE 8');
  expect(observed.input).toContain('Reference 8: use the lighting only.');
  for (const [index, original] of inputs.entries()) {
    expect(await fs.readFile(path.join(result.folder, `input-${index + 1}.png`))).toEqual(
      await fs.readFile(original),
    );
  }
  expect(result.usage).toMatchObject({
    input_tokens: 12,
    referencePacking: { originalCount: 8, attachmentCount: 3, mode: 'contact-sheets' },
  });
  expect(JSON.parse(await fs.readFile(path.join(result.folder, 'reference-packing.json'), 'utf8'))).toEqual(
    result.usage?.referencePacking,
  );
});
