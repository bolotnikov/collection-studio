import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp, { type OverlayOptions } from 'sharp';
import { EnvironmentBackdrops } from '../src/domain/EnvironmentBackdrops';
import { VisualCatalogStore } from '../src/infrastructure/VisualCatalogStore';
import { StyleContracts } from '../src/shared/StyleContracts';

/** Reproduce the reviewed inventory and visual inspection sheets without provider calls. */
class EnvironmentBackdropAudit {
  static async run(): Promise<void> {
    const catalog = await new VisualCatalogStore('resources/knowledge/visual-catalog.json').read();
    const library = StyleContracts.libraryItem
      .array()
      .parse(JSON.parse(await fs.readFile('resources/library.json', 'utf8')));
    const review = EnvironmentBackdrops.review;
    if (
      review.cards.length !== catalog.cards.length ||
      catalog.cards.some(
        (card) => !review.cards.some((entry) => entry.id === card.id && entry.sha256 === card.sha256),
      )
    )
      throw new Error('The visual audit must cover the exact complete original inventory.');
    const cards = await Promise.all(
      catalog.cards.map(async (card) => {
        const file = path.resolve('resources/references', card.filename);
        if (
          !file.startsWith(path.resolve('resources/references') + path.sep) ||
          createHash('sha256')
            .update(await fs.readFile(file))
            .digest('hex') !== card.sha256
        )
          throw new Error(`Reviewed source image identity mismatch: ${card.id}`);
        const number = library
          .find((item) => item.id === card.id)
          ?.tags.find((tag) => tag.startsWith('card-number:'))
          ?.slice(12);
        const entry = review.cards.find((entry) => entry.id === card.id);
        if (!number || !entry) throw new Error('Missing audit lineage.');
        return { ...card, number: Number(number), review: entry };
      }),
    );
    cards.sort((a, b) => a.number - b.number);
    const output = path.resolve('output/environment-audit');
    await fs.mkdir(output, { recursive: true });
    const environmental = cards.filter((card) => card.review.hasEnvironment);
    for (const [name, group] of [
      ['all', cards],
      ['environment', environmental],
    ] as const) {
      for (let start = 0; start < group.length; start += 12) {
        const parts: OverlayOptions[] = [];
        for (const [index, card] of group.slice(start, start + 12).entries()) {
          const left = (index % 4) * 315,
            top = Math.floor(index / 4) * 375;
          parts.push({
            input: await sharp(path.resolve('resources/references', card.filename))
              .resize(305, 340, { fit: 'contain', background: 'white' })
              .png()
              .toBuffer(),
            left,
            top,
          });
          parts.push({
            input: Buffer.from(
              `<svg width="315" height="30"><rect width="315" height="30" fill="white"/><text x="5" y="20" font-size="18">#${card.number} / category ${card.observation.category}</text></svg>`,
            ),
            left,
            top: top + 340,
          });
        }
        await sharp({ create: { width: 1260, height: 1125, channels: 3, background: 'white' } })
          .composite(parts)
          .png()
          .toFile(path.join(output, `${name}-${start / 12 + 1}.png`));
      }
    }
    const counts = (axis: keyof typeof EnvironmentBackdrops.facets.shape) =>
      Object.fromEntries(
        EnvironmentBackdrops.facets.shape[axis]
          .unwrap()
          .options.map((value) => [
            value,
            environmental.filter((card) => card.review.facets?.[axis] === value).length,
          ]),
      );
    const summary = {
      reviewed: cards.length,
      environmental: environmental.length,
      categories: Object.fromEntries(
        ['1', '2', '3', '4', '5'].map((category) => [
          category,
          environmental.filter((card) => card.observation.category === category).length,
        ]),
      ),
      facets: Object.fromEntries(
        Object.keys(EnvironmentBackdrops.facets.shape).map((axis) => {
          const key = EnvironmentBackdrops.facets.keyof().parse(axis);
          return [key, counts(key)];
        }),
      ),
      cards: cards.map((card) => ({
        number: card.number,
        category: card.observation.category,
        ...card.review,
      })),
    };
    await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(
      JSON.stringify(
        {
          reviewed: summary.reviewed,
          environmental: summary.environmental,
          categories: summary.categories,
          facets: summary.facets,
        },
        null,
        2,
      ),
    );
  }
}
await EnvironmentBackdropAudit.run();
