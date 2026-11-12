import sharp from 'sharp';
import { SetSheetLayout } from '../shared/SetSheetLayout';
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
      // Pre-organization snapshots refer to this flat content-addressed path.
      const legacy = path.join(this.root, 'images', `${image.sha256}.png`);
      if (path.join(this.root, relative) !== legacy) await fs.writeFile(legacy, bytes);
    }
    for (const sheet of corpus.cleanSets ?? []) {
      const relative = path.normalize(sheet.filename);
      if (!relative.startsWith('images' + path.sep) || relative.includes('..'))
        throw new Error('Invalid clean-set image path.');
      const bytes = await fs.readFile(path.join(source, relative));
      if (createHash('sha256').update(bytes).digest('hex') !== sheet.sha256)
        throw new Error('Clean-set image integrity mismatch.');
      const expected = SetSheetLayout.dimensions(sheet.layout),
        actual = await sharp(bytes).metadata();
      if (actual.format !== 'png' || actual.width !== expected.width || actual.height !== expected.height)
        throw new Error('Clean-set image dimensions do not match the declared layout.');
      for (const card of sheet.cards) {
        const file = path.resolve(resources, 'references', card.filename);
        if (!file.startsWith(path.resolve(resources, 'references') + path.sep))
          throw new Error('Invalid clean-set card path.');
        if (
          createHash('sha256')
            .update(await fs.readFile(file))
            .digest('hex') !== card.sha256
        )
          throw new Error('Clean-set original card integrity mismatch.');
      }
      await fs.mkdir(path.dirname(path.join(this.root, relative)), { recursive: true });
      await fs.writeFile(path.join(this.root, relative), bytes);
    }
    return corpus;
  }
}
