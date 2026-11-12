import sharp from 'sharp';
import { z } from 'zod';

/** Pixel evidence for correspondence, independent of titles, numbering and model captions. */
export class SetCardMatcher {
  static readonly configuration = z.object({
    normalizedWidth: z.number().int().positive(),
    normalizedHeight: z.number().int().positive(),
    cardWidth: z.number().int().positive(),
    cardHeight: z.number().int().positive(),
    patch: z.object({
      left: z.number().int().nonnegative(),
      top: z.number().int().nonnegative(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    sampleWidth: z.number().int().positive(),
    sampleHeight: z.number().int().positive(),
    x: z.array(z.number().int().nonnegative()).length(5),
    y: z.array(z.number().int().nonnegative()).length(2),
    maximumErrorRatio: z.number().positive().max(0.9),
  });
  private readonly config;
  constructor(input: unknown) {
    this.config = SetCardMatcher.configuration.parse(input);
  }
  async index(cards: { id: string; bytes: Buffer }[]): Promise<{ id: string; pixels: Buffer }[]> {
    return Promise.all(
      cards.map(async (card) => ({
        id: card.id,
        pixels: await this.sample(
          await sharp(card.bytes)
            .resize(this.config.cardWidth, this.config.cardHeight, { fit: 'fill' })
            .toBuffer(),
          this.config.patch.left,
          this.config.patch.top,
        ),
      })),
    );
  }
  async match(screen: Buffer, originals: { id: string; pixels: Buffer }[]) {
    if (originals.length < 2) throw new Error('Correspondence verification requires competing originals.');
    const normalized = await sharp(screen)
      .resize(this.config.normalizedWidth, this.config.normalizedHeight, { fit: 'fill' })
      .toBuffer();
    const matches: { id: string; error: number; runnerUpError: number }[] = [];
    for (let slot = 0; slot < 10; slot++) {
      const x = this.config.x[slot % 5],
        y = this.config.y[Math.floor(slot / 5)];
      if (x === undefined || y === undefined) throw new Error('Missing calibrated slot.');
      const pixels = await this.sample(normalized, x + this.config.patch.left, y + this.config.patch.top);
      const ranked = originals
        .map((card) => {
          if (card.pixels.length !== pixels.length) throw new Error('Incompatible match samples.');
          let sum = 0;
          for (const [index, value] of pixels.entries()) sum += (value - (card.pixels[index] ?? 0)) ** 2;
          return { id: card.id, error: sum / pixels.length };
        })
        .sort((a, b) => a.error - b.error || a.id.localeCompare(b.id));
      const winner = ranked[0],
        second = ranked[1];
      if (
        !winner ||
        !second ||
        second.error === 0 ||
        winner.error / second.error > this.config.maximumErrorRatio
      )
        throw new Error(`Ambiguous card correspondence in slot ${slot + 1}.`);
      matches.push({ ...winner, runnerUpError: second.error });
    }
    if (new Set(matches.map((match) => match.id)).size !== 10)
      throw new Error('Duplicate cards in matched set.');
    return matches;
  }
  private sample(bytes: Buffer, left: number, top: number): Promise<Buffer> {
    return sharp(bytes)
      .extract({ left, top, width: this.config.patch.width, height: this.config.patch.height })
      .resize(this.config.sampleWidth, this.config.sampleHeight)
      .toColourspace('srgb')
      .removeAlpha()
      .raw()
      .toBuffer();
  }
}
