import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CodexRunner } from '../src/infrastructure/CodexRunner';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});

async function executable(script: string): Promise<string> {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-connection-'));
  folders.push(folder);
  const file = path.join(folder, 'codex');
  await fs.writeFile(file, `#!${process.execPath}\n${script}`, { mode: 0o700 });
  return file;
}

it.each(['stdout', 'stderr'] as const)('accepts ChatGPT sign-in reported on %s', async (stream) => {
  const file = await executable(`process.${stream}.write('Logged in using ChatGPT\\n');`);
  await expect(CodexRunner.check(file)).resolves.toContain('signed in with ChatGPT');
});

it.each([
  ['stdout', 1, 'Not logged in'],
  ['stderr', 1, 'Not logged in'],
  ['stdout', 0, 'Logged in using an API key'],
  ['stderr', 0, 'Please sign in with ChatGPT'],
] as const)('explains missing ChatGPT sign-in (%s, %s, %s)', async (stream, code, output) => {
  const file = await executable(`process.${stream}.write(${JSON.stringify(output)}); process.exit(${code});`);
  await expect(CodexRunner.check(file)).rejects.toThrow('Run codex login and choose Sign in with ChatGPT.');
});

it('reports missing, nonexecutable and directory paths without falling back to another CLI', async () => {
  const file = await executable('process.exit(0);');
  expect(await CodexRunner.locate(file)).toBe(file);
  await fs.chmod(file, 0o600);
  await expect(CodexRunner.locate(file)).rejects.toThrow('Install Codex CLI');
  await expect(CodexRunner.locate(path.dirname(file))).rejects.toThrow('Install Codex CLI');
  await expect(CodexRunner.locate(`${file}-missing`)).rejects.toThrow('Install Codex CLI');
  await expect(CodexRunner.check(`${file}-missing`)).rejects.toThrow('Check its executable path');
});

it('replaces raw CLI failures with actionable setup guidance', async () => {
  const file = await executable("process.stderr.write('private diagnostic fixture'); process.exit(2);");
  await expect(CodexRunner.check(file)).rejects.toThrow(
    'Run codex login in Terminal, then select Test connection in Settings.',
  );
});

it('bounds an unresponsive connection check even when the CLI ignores SIGTERM', async () => {
  const file = await executable("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);");
  await expect(CodexRunner.check(file)).rejects.toThrow('did not respond within 15 seconds');
}, 20000);
