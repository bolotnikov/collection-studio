import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import sharp from 'sharp';
import { CodexRunner } from '../src/infrastructure/CodexRunner';

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
  const result = await new CodexRunner(executable, path.join(root, 'jobs'), 'fixture-model').run(
    injection,
    z.object({ answer: z.string() }),
    [source],
  );
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
  expect(await fs.readFile(path.join(result.folder, 'input-1.png'))).toEqual(await fs.readFile(source));
  expect(result.value.answer).toBe('verified');
  expect(result.threadId).toBe('fixture-thread');
  expect(result.usage?.input_tokens).toBe(12);
  await expect(fs.access(path.join(root, 'SHOULD_NOT_EXIST'))).rejects.toThrow();
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
  ).rejects.toThrow('code 2');
  const [job] = await fs.readdir(jobs);
  if (!job) throw new Error('Job not saved');
  expect(await fs.readFile(path.join(jobs, job, 'stderr.log'), 'utf8')).toContain('fixture diagnostic');
  expect(await fs.readFile(path.join(jobs, job, 'events.jsonl'), 'utf8')).toContain('turn.failed');
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
