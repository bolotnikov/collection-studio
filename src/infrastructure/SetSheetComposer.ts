import sharp from 'sharp';
import { SetSheetLayout, type SheetLayout } from '../shared/SetSheetLayout';

/** One deterministic layout for source references and generated candidates; no UI or art synthesis. */
export class SetSheetComposer {
  async compose(cards: Buffer[], layout: SheetLayout = SetSheetLayout.defaults()): Promise<Buffer> {
    const decoded = SetSheetLayout.schema.parse(layout);
    if (cards.length !== decoded.columns * decoded.rows)
      throw new Error('A clean set sheet requires ten images.');
    const tiles = await Promise.all(
      cards.map(async (bytes, index) => ({
        input: await sharp(bytes)
          .resize(decoded.cardWidth, decoded.cardHeight, { fit: 'contain', background: decoded.background })
          .flatten({ background: decoded.background })
          .toColourspace('srgb')
          .png()
          .toBuffer(),
        left: decoded.margin + (index % decoded.columns) * (decoded.cardWidth + decoded.gap),
        top: decoded.margin + Math.floor(index / decoded.columns) * (decoded.cardHeight + decoded.gap),
      })),
    );
    return sharp({
      create: {
        ...SetSheetLayout.dimensions(decoded),
        channels: 3,
        background: decoded.background,
      },
    })
      .composite(tiles)
      .png()
      .toBuffer();
  }
}
