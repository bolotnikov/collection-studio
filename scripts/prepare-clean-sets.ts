import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { StyleContracts } from '../src/shared/StyleContracts';
import { KnowledgeContracts } from '../src/shared/KnowledgeContracts';
import { SetSheetLayout } from '../src/shared/SetSheetLayout';
import { SetSheetComposer } from '../src/infrastructure/SetSheetComposer';
import { SetCardMatcher } from '../src/infrastructure/SetCardMatcher';

class CleanSetPreparation {
  static async run(): Promise<void> {
    const root = path.resolve('resources/knowledge');
    const catalogPath = path.join(root, 'catalog.json');
    const corpus = KnowledgeContracts.corpus.parse(JSON.parse(await fs.readFile(catalogPath, 'utf8')));
    const membership = z
      .object({
        version: z.literal(1),
        method: z.string(),
        comparison: SetCardMatcher.configuration,
        excludedSets: z.array(z.object({ sourceImageId: z.string(), reason: z.string().min(1) })),
        sets: z.array(
          z.object({
            sourceImageId: z.string(),
            title: z.string(),
            cards: z
              .array(
                z.object({
                  use: z.enum(['ordinary', 'excluded-gold-character']),
                  slot: z.number().int(),
                  id: z.string(),
                  sha256: z.string().length(64),
                }),
              )
              .length(10),
          }),
        ),
      })
      .parse(JSON.parse(await fs.readFile('resources/clean-set-membership.json', 'utf8')));
    const library = StyleContracts.libraryItem
      .array()
      .parse(JSON.parse(await fs.readFile('resources/library.json', 'utf8')));
    const bytes = new Map<string, Buffer>();
    for (const card of library) {
      if (card.origin !== 'anchor') throw new Error('Clean references require original art only.');
      const file = path.resolve('resources/references', card.filename);
      if (!file.startsWith(path.resolve('resources/references') + path.sep))
        throw new Error('Invalid original card path.');
      const data = await fs.readFile(file);
      if (this.hash(data) !== card.sha256) throw new Error('Original card hash mismatch.');
      bytes.set(card.id, data);
    }
    const declarations = [...membership.sets, ...membership.excludedSets].map((set) => set.sourceImageId);
    const sources = corpus.images.filter((image) => image.role === 'collection-example');
    if (
      new Set(declarations).size !== declarations.length ||
      sources.length !== declarations.length ||
      sources.some((image) => !declarations.includes(image.id))
    )
      throw new Error('Every source set must have a unique mapping or explicit exclusion.');
    const matcher = new SetCardMatcher(membership.comparison);
    const index = await matcher.index([...bytes].map(([id, bytes]) => ({ id, bytes })));
    const cleanSets = [];
    const layout = SetSheetLayout.schema.parse(
      JSON.parse(await fs.readFile('resources/set-sheet-layout.json', 'utf8')),
    );
    for (const declared of membership.sets) {
      const source = sources.find((image) => image.id === declared.sourceImageId);
      if (!source) throw new Error('Source set missing.');
      const screenshot = await fs.readFile(path.join(root, source.filename));
      if (this.hash(screenshot) !== source.sha256) throw new Error('Set screenshot hash mismatch.');
      const matched = await matcher.match(screenshot, index);
      const cards = declared.cards.map((entry, position) => {
        const card = library.find((card) => card.id === entry.id);
        const observed = matched[position];
        if (
          !card ||
          !observed ||
          observed.id !== entry.id ||
          card.sha256 !== entry.sha256 ||
          entry.slot !== position + 1
        )
          throw new Error(
            `Membership differs from visual correspondence: ${declared.title}, slot ${position + 1}.`,
          );
        return {
          use: entry.use,
          slot: entry.slot,
          id: card.id,
          filename: card.filename,
          sha256: card.sha256,
          source: card.source,
          match: { error: observed.error, runnerUpError: observed.runnerUpError },
        };
      });
      const sheet = await new SetSheetComposer().compose(
        cards.map((card) => {
          const data = bytes.get(card.id);
          if (!data) throw new Error('Original bytes missing.');
          return data;
        }),
        layout,
      );
      const sha256 = this.hash(sheet),
        filename = `images/clean-sets/${sha256}.png`;
      await fs.mkdir(path.dirname(path.join(root, filename)), { recursive: true });
      await fs.writeFile(path.join(root, filename), sheet);
      cleanSets.push({
        sourceImageId: source.id,
        sourceSha256: source.sha256,
        filename,
        sha256,
        layout,
        method: 'original-card-assembly-v1' as const,
        primaryEligible: cards.every((card) => card.use === 'ordinary'),
        cards,
      });
    }
    const validated = KnowledgeContracts.corpus.parse({ ...corpus, cleanSets });
    await fs.writeFile(catalogPath + '.tmp', JSON.stringify(validated, null, 2));
    await fs.rename(catalogPath + '.tmp', catalogPath);
    console.log(
      `Prepared ${cleanSets.length} clean sets from ${cleanSets.length * 10} verified original cards; ${membership.excludedSets.length} explicitly excluded source set.`,
    );
  }
  private static hash(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
  }
}
await CleanSetPreparation.run();
