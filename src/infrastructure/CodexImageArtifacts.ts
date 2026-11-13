import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

/** Resolves only native image artifacts belonging to the current CLI thread. */
export class CodexImageArtifacts {
  constructor(private readonly codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')) {}

  async collect(folder: string, threadId: string | null) {
    if (!threadId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(threadId)) return null;
    const directory = path.join(this.codexHome, 'generated_images', threadId);
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
    const images = entries.filter((entry) => entry.isFile() && /^exec-[0-9a-f-]+\.png$/i.test(entry.name));
    if (!images.length) return null;
    if (images.length !== 1) throw new Error('Codex returned multiple image artifacts for one request.');
    const image = images[0];
    if (!image) throw new Error('Codex image artifact is unavailable.');
    const source = path.join(directory, image.name);
    const bytes = await fs.readFile(source);
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'png') throw new Error('Codex image artifact is not a PNG.');
    await fs.writeFile(path.join(folder, 'image.png'), bytes);
    return { source, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
}
