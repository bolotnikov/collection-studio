import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ReferenceImagePacker } from './ReferenceImagePacker';

export class CodexRunner {
  private static readonly event = z.object({
    type: z.string(),
    usage: z.record(z.string(), z.unknown()).optional(),
    thread_id: z.string().optional(),
    error: z.object({ message: z.string() }).optional(),
  });
  constructor(
    private readonly executable: string,
    private readonly jobsRoot: string,
    private readonly model: string,
  ) {}
  static async locate(configured = ''): Promise<string> {
    const candidates = configured
      ? [configured]
      : [
          '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
          '/Applications/Codex.app/Contents/Resources/codex',
          ...(process.env.PATH ?? '')
            .split(path.delimiter)
            .filter(Boolean)
            .map((p) => path.join(p, 'codex')),
        ];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        /* Try the next supported installation path. */
      }
    }
    throw new Error('Codex CLI was not found. Set its executable path in Settings.');
  }
  private static environment(): NodeJS.ProcessEnv {
    return Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('OPENAI_') && key !== 'CODEX_API_KEY'),
    );
  }
  static async check(executable: string): Promise<string> {
    const { stdout, stderr } = await promisify(execFile)(executable, ['login', 'status'], {
      env: CodexRunner.environment(),
      timeout: 15000,
    });
    if (!/ChatGPT/i.test(stdout + stderr))
      throw new Error('Run codex login and choose Sign in with ChatGPT.');
    return 'Codex CLI is signed in with ChatGPT. Uses subscription limits; no API key is passed.';
  }
  async run<T>(
    prompt: string,
    schema: z.ZodType<T>,
    images: string[] = [],
    generateImage = false,
  ): Promise<{ value: T; folder: string; usage: Record<string, unknown> | null; threadId: string | null }> {
    const folder = path.join(this.jobsRoot, randomUUID());
    await fs.mkdir(folder, { recursive: true });
    const schemaFile = path.join(folder, 'schema.json'),
      resultFile = path.join(folder, 'result.json');
    await fs.writeFile(schemaFile, JSON.stringify(z.toJSONSchema(schema, { target: 'draft-7' })));
    const inputs: string[] = [];
    for (const [index, file] of images.entries()) {
      const destination = path.join(folder, `input-${index + 1}.png`);
      await fs.copyFile(file, destination);
      inputs.push(destination);
    }
    const packing = generateImage ? await new ReferenceImagePacker().pack(inputs, folder) : null;
    const attachments = packing?.paths ?? inputs;
    const instruction = `You are a bounded worker inside Collection Studio. Complete only the supplied art-production task. Do not access credentials or unrelated files, use external APIs, install software, or delegate to agents. Return the requested structured JSON. ${generateImage ? 'Generate exactly one image using the BUILT-IN image_gen tool. Do not draw with code, SVG or copy an input as output. Save or copy the actual generated image to ' + path.join(folder, 'image.png') + '. If unavailable, return success false and explain; never fall back to paid API.' : 'Do not run shell commands or generate images. Analyse the attached images when provided.'}\n\n${prompt}\n\n${packing?.instruction ?? ''}\n\nATTACHED LOCAL FILES IN ORDER: ${JSON.stringify(attachments)}. ${generateImage ? 'Pass ALL listed files to the built-in image tool as local reference images, in this order. Do not rely on a limited recent-image window or silently omit references. If the tool cannot accept them, report failure.' : 'These paths identify the attached images; do not edit them.'}`;
    await fs.writeFile(path.join(folder, 'prompt.txt'), instruction);
    const args = [
      'exec',
      '--ignore-user-config',
      '--ephemeral',
      '--skip-git-repo-check',
      '--sandbox',
      'workspace-write',
      '--disable',
      'apps',
      '--disable',
      'plugins',
      '--disable',
      'multi_agent',
      generateImage ? '--enable' : '--disable',
      'image_generation',
      ...(!generateImage ? ['--disable', 'shell_tool'] : []),
      '-m',
      this.model,
      '--json',
      '-C',
      folder,
      '--output-schema',
      schemaFile,
      '-o',
      resultFile,
      ...attachments.flatMap((file) => ['-i', file]),
      '-',
    ];
    let usage: Record<string, unknown> | null = null,
      threadId: string | null = null;
    const execution = await new Promise<{
      output: string;
      errors: string;
      code: number | null;
      timedOut: boolean;
    }>((resolve, reject) => {
      const child = spawn(this.executable, args, {
        env: CodexRunner.environment(),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
      let output = '',
        errorOutput = '',
        timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, 600000);
      const killTimeout = setTimeout(() => child.kill('SIGKILL'), 610000);
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        errorOutput = (errorOutput + chunk.toString()).slice(-8000);
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        clearTimeout(killTimeout);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        clearTimeout(killTimeout);
        resolve({ output, errors: errorOutput, code, timedOut });
      });
      child.stdin.on('error', () => {
        /* Exit status reports early child termination. */
      });
      child.stdin.end(instruction);
    });
    const transcript = execution.output;
    await fs.writeFile(path.join(folder, 'events.jsonl'), transcript);
    await fs.writeFile(path.join(folder, 'stderr.log'), execution.errors);
    if (execution.timedOut)
      throw new Error(
        'Codex did not finish within 10 minutes. Generation outcome is unknown; automatic retry is disabled.',
      );
    if (execution.code !== 0)
      throw new Error(`Codex CLI exited with code ${execution.code}: ${execution.errors.slice(-1600)}`);
    for (const line of transcript.split('\n').filter(Boolean)) {
      const event = CodexRunner.event.safeParse(JSON.parse(line));
      if (!event.success) continue;
      if (event.data.usage) usage = event.data.usage;
      if (event.data.thread_id) threadId = event.data.thread_id;
      if (event.data.type === 'turn.failed')
        throw new Error(event.data.error?.message ?? 'Codex task failed.');
    }
    const value = schema.parse(JSON.parse(await fs.readFile(resultFile, 'utf8')));
    if (packing) usage = { ...usage, referencePacking: packing.manifest };
    return { value, folder, usage, threadId };
  }
}
