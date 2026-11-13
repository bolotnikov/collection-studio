import sharp from 'sharp';
import type { DeliveryLayout } from '../shared/DeliveryContracts';

/** Places reviewed pixels behind the original transparent UI, without stretching them. */
export class DeliveryComposer {
  async compose(cards: Buffer[], template: Buffer, layout: DeliveryLayout): Promise<Buffer> {
    if (cards.length !== 10) throw new Error('Delivery requires ten cards.');
    const metadata = await sharp(template).metadata();
    if (metadata.width !== layout.width || metadata.height !== layout.height || !metadata.hasAlpha)
      throw new Error('Delivery template dimensions or transparency are invalid.');
    const layers = [];
    for (const [index, slot] of layout.slots.entries()) {
      const card = cards[index];
      if (!card) throw new Error('Delivery card missing.');
      const size = await sharp(card).metadata();
      if (size.format !== 'png' || size.width !== 430 || size.height !== 480)
        throw new Error('Delivery requires reviewed 430×480 PNG cards.');
      layers.push({
        input: await sharp(card)
          .resize(slot.width, slot.height, { fit: 'cover', position: 'centre' })
          .png()
          .toBuffer(),
        left: slot.left,
        top: slot.top,
      });
    }
    const assembled = await sharp({
      create: {
        width: layout.width,
        height: layout.height,
        channels: 4,
        background: '#00000000',
      },
    })
      .composite([...layers, { input: template, left: 0, top: 0 }])
      .png()
      .toBuffer();
    return sharp(assembled).extract(layout.viewport).png().toBuffer();
  }
}
