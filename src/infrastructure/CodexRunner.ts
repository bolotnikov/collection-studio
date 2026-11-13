import { PromptCatalog } from '../application/prompts/PromptCatalog';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { ReferenceImagePacker } from './ReferenceImagePacker';
import { CodexOutputSchema } from './CodexOutputSchema';
import { ExecutionJournal } from './ExecutionJournal';

export class CodexRunner {
  private static readonly event = z.object({
    type: z.string(),
    usage: z.record(z.string(), z.unknown()).optional(),
    thread_id: z.string().optional(),
    message: z.string().optional(),
    error: z.object({ message: z.string() }).optional(),
  });
  private static failureMessage(message: string): string {
    try {
      const payload = CodexRunner.event.safeParse(JSON.parse(message));
      return payload.success ? (payload.data.error?.message ?? payload.data.message ?? message) : message;
    } catch {
      return message;
    }
  }
  constructor(
    private readonly executable: string,
    private readonly jobsRoot: string,
    private readonly model: string,
    private readonly prompts = new PromptCatalog(),
    private readonly audit?: { journal: ExecutionJournal; runId: string },
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
    executor = 'CodexRunner',
  ): Promise<{ value: T; folder: string; usage: Record<string, unknown> | null; threadId: string | null }> {
    if (!this.audit) return this.execute(prompt, schema, images, generateImage);
    return this.audit.journal.capture(
      this.audit.runId,
      executor,
      {
        model: this.model,
        mode: generateImage ? 'image' : 'analysis',
        prompt,
        attachments: images,
        schema: new CodexOutputSchema(schema).jsonSchema,
      },
      () => this.execute(prompt, schema, images, generateImage),
      (result) => ({
        response: result.value,
        jobFolder: result.folder,
        usage: result.usage,
        threadId: result.threadId,
      }),
    );
  }
  private async execute<T>(
    prompt: string,
    schema: z.ZodType<T>,
    images: string[],
    generateImage: boolean,
  ): Promise<{ value: T; folder: string; usage: Record<string, unknown> | null; threadId: string | null }> {
    const folder = path.join(this.jobsRoot, randomUUID());
    await fs.mkdir(folder, { recursive: true });
    const schemaFile = path.join(folder, 'schema.json'),
      resultFile = path.join(folder, 'result.json');
    const outputSchema = new CodexOutputSchema(schema);
    await fs.writeFile(schemaFile, JSON.stringify(outputSchema.jsonSchema));
    const inputs: string[] = [];
    for (const [index, file] of images.entries()) {
      const destination = path.join(folder, `input-${index + 1}.png`);
      await fs.copyFile(file, destination);
      inputs.push(destination);
    }
    const packing = generateImage ? await new ReferenceImagePacker(this.prompts).pack(inputs, folder) : null;
    const attachments = packing?.paths ?? inputs;
    const instruction = this.prompts.render('CodexRunner.run', {
      taskMode: this.prompts.render(generateImage ? 'worker.image' : 'worker.analysis', {
        outputPath: path.join(folder, 'image.png'),
      }),
      prompt: prompt,
      referenceMapping: packing?.instruction ?? '',
      attachmentPaths: JSON.stringify(attachments),
      attachmentInstructions: this.prompts.render(
        generateImage ? 'worker.imageAttachments' : 'worker.analysisAttachments',
      ),
    });
    await fs.writeFile(path.join(folder, 'prompt.txt'), instruction);
    await this.audit?.journal.record(this.audit.runId, 'CodexRunner', 'worker.started', {
      jobFolder: folder,
      model: this.model,
      prompt: instruction,
      attachments: await Promise.all(
        attachments.map(async (file, index) => ({
          image: index + 1,
          file,
          sha256: createHash('sha256')
            .update(await fs.readFile(file))
            .digest('hex'),
        })),
      ),
    });
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
    if (this.audit) {
      const events: unknown[] = [];
      for (const line of transcript.split('\n').filter(Boolean)) {
        try {
          events.push(JSON.parse(line));
        } catch {
          /* Raw non-JSON output stays in the worker folder. */
        }
      }
      await this.audit.journal.record(this.audit.runId, 'CodexRunner', 'worker.completed', {
        jobFolder: folder,
        exitCode: execution.code,
        timedOut: execution.timedOut,
        events,
        stderr: execution.errors,
      });
    }
    if (execution.timedOut)
      throw new Error(
        'Codex did not finish within 10 minutes. Generation outcome is unknown; automatic retry is disabled.',
      );
    let failure: string | null = null;
    for (const line of transcript.split('\n').filter(Boolean)) {
      let payload: unknown;
      try {
        payload = JSON.parse(line);
      } catch {
        // Preserve non-JSON output in the transcript while looking for structured diagnostics.
        continue;
      }
      const event = CodexRunner.event.safeParse(payload);
      if (!event.success) continue;
      if (event.data.usage) usage = event.data.usage;
      if (event.data.thread_id) threadId = event.data.thread_id;
      if (event.data.type === 'turn.failed' || event.data.type === 'error') {
        const message = event.data.error?.message ?? event.data.message;
        if (message) failure = CodexRunner.failureMessage(message);
        else failure ??= 'Codex task failed.';
      }
    }
    if (execution.code !== 0)
      throw new Error(
        `Codex CLI exited with code ${execution.code}: ${failure ?? (execution.errors.trim().slice(-1600) || 'No diagnostic message was returned.')}`,
      );
    if (failure) throw new Error(failure);
    const value = outputSchema.parse(JSON.parse(await fs.readFile(resultFile, 'utf8')));
    if (packing) usage = { ...usage, referencePacking: packing.manifest };
    return { value, folder, usage, threadId };
  }
}
