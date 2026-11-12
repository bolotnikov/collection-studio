import { expect, it } from 'vitest';
import sharp from 'sharp';
import { SetSheetComposer } from '../src/infrastructure/SetSheetComposer';
import { SetSheetLayout } from '../src/shared/SetSheetLayout';
import { SetCardMatcher } from '../src/infrastructure/SetCardMatcher';

it('composes ten complete cards in the same neutral layout without cropping their corners', async () => {
  const layout = SetSheetLayout.defaults();
  const cards = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      sharp({ create: { width: 430, height: 480, channels: 3, background: { r: i * 20, g: 80, b: 120 } } })
        .png()
        .toBuffer(),
    ),
  );
  const composer = new SetSheetComposer();
  const sheet = await composer.compose(cards, layout);
  expect(await composer.compose(cards, layout)).toEqual(sheet);
  const metadata = await sharp(sheet).metadata();
  expect([metadata.width, metadata.height]).toEqual([2246, 1008]);
  const { data, info } = await sharp(sheet).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [
    ...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3),
  ];
  for (let i = 0; i < 10; i++) {
    const x = 16 + (i % 5) * 446,
      y = 16 + Math.floor(i / 5) * 496;
    expect(pixel(x, y)).toEqual([i * 20, 80, 120]);
    expect(pixel(x + 429, y + 479)).toEqual([i * 20, 80, 120]);
  }
  expect(pixel(0, 0)).toEqual([236, 234, 229]);
  await expect(composer.compose(cards.slice(0, 9))).rejects.toThrow('ten images');
});

it('matches by pixels despite reordered source IDs and rejects ambiguous identical originals', async () => {
  const matcher = new SetCardMatcher({
    normalizedWidth: 200,
    normalizedHeight: 120,
    cardWidth: 20,
    cardHeight: 40,
    patch: { left: 4, top: 4, width: 12, height: 32 },
    sampleWidth: 6,
    sampleHeight: 8,
    x: [0, 40, 80, 120, 160],
    y: [0, 60],
    maximumErrorRatio: 0.85,
  });
  const originals = await Promise.all(
    Array.from({ length: 10 }, async (_, i) => ({
      id: `card-${i}`,
      bytes: await sharp({
        create: {
          width: 20,
          height: 40,
          channels: 3,
          background: { r: i * 20, g: 200 - i * 15, b: 30 + i * 10 },
        },
      })
        .png()
        .toBuffer(),
    })),
  );
  const order = [5, 4, 3, 2, 1, 0, 9, 8, 7, 6];
  const screen = await sharp({ create: { width: 200, height: 120, channels: 3, background: '#ffffff' } })
    .composite(
      order.map((id, slot) => {
        const card = originals[id];
        if (!card) throw new Error('Fixture missing');
        return { input: card.bytes, left: (slot % 5) * 40, top: Math.floor(slot / 5) * 60 };
      }),
    )
    .png()
    .toBuffer();
  const index = await matcher.index([...originals].reverse());
  expect((await matcher.match(screen, index)).map((match) => match.id)).toEqual(
    order.map((id) => `card-${id}`),
  );
  const first = index[0];
  if (!first) throw new Error('Fixture missing');
  await expect(matcher.match(screen, [...index, { ...first, id: 'ambiguous-copy' }])).rejects.toThrow(
    'Ambiguous',
  );
});
