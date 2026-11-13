import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { z } from 'zod';

/** Persist only completed, schema-validated specialist results under semantic identities. */
export class PreparationCache {
  constructor(private readonly root: string) {}
  async getOrCreate<T>(identity: string, schema: z.ZodType<T>, create: () => Promise<T>): Promise<T> {
    const key = createHash('sha256').update(identity).digest('hex');
    const file = path.join(this.root, `${key}.json`);
    try {
      return schema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    const result = schema.parse(await create());
    await fs.mkdir(this.root, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(result));
    await fs.rename(temporary, file);
    return result;
  }
}
