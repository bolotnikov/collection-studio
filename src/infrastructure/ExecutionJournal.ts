import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { Contracts } from '../shared/Contracts';

/** Stores observable execution evidence; never model-private reasoning or image payloads. */
export class ExecutionJournal {
  static readonly entry = z.object({
    at: z.string(),
    executor: z.string(),
    action: z.string(),
    data: z.unknown(),
  });
  private writes: Promise<void> = Promise.resolve();
  constructor(private readonly root: string) {}

  static text(value: string): string {
    return value
      .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted API key]')
      .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[image payload omitted]');
  }
  static sanitize(value: unknown, key = ''): unknown {
    if (/^(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)$/i.test(key))
      return '[redacted]';
    if (/^(reasoning|reasoning_content|chain_of_thought)$/i.test(key)) return '[private reasoning omitted]';
    if (/^(b64_json|image_base64)$/i.test(key)) return '[image payload omitted]';
    if (typeof value === 'string') {
      const image = /^data:(image\/[^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
      if (image?.[2]) {
        const bytes = Buffer.from(image[2], 'base64');
        return {
          mimeType: image[1],
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        };
      }
      return ExecutionJournal.text(value);
    }
    if (Buffer.isBuffer(value))
      return { bytes: value.length, sha256: createHash('sha256').update(value).digest('hex') };
    if (Array.isArray(value))
      return value
        .filter(
          (item) =>
            !(typeof item === 'object' && item !== null && 'type' in item && item.type === 'reasoning'),
        )
        .map((item) => ExecutionJournal.sanitize(item));
    if (value && typeof value === 'object' && 'type' in value && value.type === 'reasoning')
      return { type: 'reasoning', omitted: true };
    if (value && typeof value === 'object' && 'type' in value && value.type === 'image' && 'data' in value)
      return { type: 'image', data: '[image payload omitted]' };
    if (value && typeof value === 'object' && 'type' in value && value.type === 'image_generation_call')
      return Object.fromEntries(
        Object.entries(value).map(([name, item]) => [
          name,
          name === 'result' ? '[image payload omitted]' : ExecutionJournal.sanitize(item, name),
        ]),
      );
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([name, item]) => [name, ExecutionJournal.sanitize(item, name)]),
      );
    return value;
  }
  async record(runId: string, executor: string, action: string, data: unknown): Promise<void> {
    const folder = path.join(this.root, Contracts.id.parse(runId));
    const line =
      JSON.stringify({
        at: new Date().toISOString(),
        executor,
        action,
        data: ExecutionJournal.sanitize(data),
      }) + '\n';
    const operation = this.writes.then(async () => {
      await fs.mkdir(folder, { recursive: true });
      await fs.appendFile(path.join(folder, 'execution.jsonl'), line);
    });
    this.writes = operation.catch(() => {});
    await operation;
  }
  async capture<T>(
    runId: string,
    executor: string,
    request: unknown,
    action: () => Promise<T>,
    summarize: (result: T) => unknown = (result) => result,
  ): Promise<T> {
    const callId = randomUUID();
    const started = Date.now();
    await this.record(runId, executor, 'request.started', { callId, request });
    try {
      const result = await action();
      await this.record(runId, executor, 'request.completed', {
        callId,
        durationMs: Date.now() - started,
        response: summarize(result),
      });
      return result;
    } catch (error) {
      await this.record(runId, executor, 'request.failed', {
        callId,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  static changes(previous: unknown, current: unknown, pointer = ''): unknown[] {
    if (JSON.stringify(previous) === JSON.stringify(current)) return [];
    if (Array.isArray(previous) && Array.isArray(current)) {
      return Array.from({ length: Math.max(previous.length, current.length) }, (_, index) =>
        ExecutionJournal.changes(previous[index], current[index], `${pointer}/${index}`),
      ).flat();
    }
    if (
      previous &&
      current &&
      typeof previous === 'object' &&
      typeof current === 'object' &&
      !Array.isArray(previous) &&
      !Array.isArray(current)
    ) {
      const before = new Map(Object.entries(previous));
      const after = new Map(Object.entries(current));
      return [...new Set([...before.keys(), ...after.keys()])]
        .filter((key) => key !== 'updatedAt')
        .flatMap((key) => ExecutionJournal.changes(before.get(key), after.get(key), `${pointer}/${key}`));
    }
    return [{ path: pointer || '/', before: previous ?? null, after: current ?? null }];
  }
  async entries(runId: string): Promise<z.infer<typeof ExecutionJournal.entry>[]> {
    await this.writes;
    let content: string;
    try {
      content = await fs.readFile(path.join(this.root, Contracts.id.parse(runId), 'execution.jsonl'), 'utf8');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => ExecutionJournal.entry.parse(JSON.parse(line)));
  }
}
