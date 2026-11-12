import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { KnowledgeContracts, type SourceKnowledge } from '../shared/KnowledgeContracts';

/** Keeps content-addressed source images available to historical profile snapshots. */
export class SourceKnowledgeStore {
  constructor(readonly root: string) {}
  async import(resources: string): Promise<SourceKnowledge> {
    const source = path.join(resources, 'knowledge');
    const corpus = KnowledgeContracts.corpus.parse(
      JSON.parse(await fs.readFile(path.join(source, 'catalog.json'), 'utf8')),
    );
    for (const document of corpus.documents)
      if (createHash('sha256').update(document.text).digest('hex') !== document.sha256)
        throw new Error('Source document integrity mismatch.');
    for (const image of corpus.images) {
      const relative = path.normalize(image.filename);
      if (!relative.startsWith('images' + path.sep) || relative.includes('..'))
        throw new Error('Invalid knowledge image path.');
      const bytes = await fs.readFile(path.join(source, relative));
      if (createHash('sha256').update(bytes).digest('hex') !== image.sha256)
        throw new Error('Source image integrity mismatch.');
      await fs.mkdir(path.dirname(path.join(this.root, relative)), { recursive: true });
      await fs.writeFile(path.join(this.root, relative), bytes);
    }
    return corpus;
  }
}
