import { createHash, randomUUID } from 'node:crypto';
import { ExecutionJournal } from './ExecutionJournal';

/** Records the actual API payload with binary attachments represented by hashes. */
export class AuditedFetch {
  constructor(
    private readonly journal: ExecutionJournal,
    private readonly runId: string,
  ) {}
  transport(): typeof fetch {
    return Object.assign(this.fetch.bind(this), { Response });
  }
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    const payload = await this.payload(request.clone());
    const callId = randomUUID(),
      started = Date.now();
    await this.journal.record(this.runId, 'OpenAiProvider', 'request.started', {
      callId,
      method: request.method,
      url: request.url,
      payload,
    });
    try {
      const response = await fetch(request);
      const content = await response.clone().text();
      let body: unknown = content;
      try {
        body = JSON.parse(content);
      } catch {
        /* Preserve non-JSON provider errors. */
      }
      await this.journal.record(
        this.runId,
        'OpenAiProvider',
        response.ok ? 'request.completed' : 'request.failed',
        {
          callId,
          durationMs: Date.now() - started,
          requestId: response.headers.get('x-request-id'),
          status: response.status,
          response: body,
        },
      );
      return response;
    } catch (error) {
      await this.journal.record(this.runId, 'OpenAiProvider', 'request.failed', {
        callId,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  private async payload(request: Request): Promise<unknown> {
    if (request.method === 'GET' || request.method === 'HEAD') return null;
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await request.formData();
      const fields: { name: string; value: unknown }[] = [];
      for (const [name, value] of form.entries()) {
        fields.push({
          name,
          value:
            typeof value === 'string'
              ? value
              : {
                  filename: value.name,
                  type: value.type,
                  bytes: value.size,
                  sha256: createHash('sha256')
                    .update(Buffer.from(await value.arrayBuffer()))
                    .digest('hex'),
                },
        });
      }
      return fields;
    }
    const content = await request.text();
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
}
