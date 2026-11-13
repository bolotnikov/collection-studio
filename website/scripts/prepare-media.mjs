import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const website = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repository = path.dirname(website);
const runRoot =
  process.env.HANDBOOK_RUNS_DIR ||
  path.join(os.homedir(), 'Library/Application Support/collection-studio/runs');
const media = path.join(website, 'public/media');
await fs.mkdir(media, { recursive: true });
const selections = [
  ['detective', '6ccf4823-7323-4057-ab0d-f87f8a3281e5', 0],
  ['western', '61600ca0-9cc2-454f-abf8-a8a481eacf02', 0],
  ['space', '5f787320-d605-4c18-84c9-6648343ce34f', 0],
  ['underwater', '5f787320-d605-4c18-84c9-6648343ce34f', 1],
];
const examples = {};
for (const [key, id, index] of selections) {
  const folder = path.join(runRoot, id);
  const run = JSON.parse(
    await fs.readFile(path.join(folder, 'run.json'), 'utf8'),
  );
  const variant = run.variants[index];
  const cards = [];
  for (const [position, card] of variant.cards.entries()) {
    const selected = card.attempts.find(
      (attempt) => attempt.id === card.selectedAttemptId,
    );
    if (!selected) throw new Error(`Missing selected version: ${card.subject}`);
    const name = `${key}-${String(position + 1).padStart(2, '0')}.webp`;
    await sharp(path.join(folder, selected.preview))
      .webp({ quality: 88 })
      .toFile(path.join(media, name));
    cards.push({ title: card.subject, src: `/media/${name}` });
    if (key === 'space' && card.subject === 'Планетоход') {
      for (const [attemptIndex, attempt] of card.attempts.entries()) {
        await sharp(path.join(folder, attempt.preview))
          .webp({ quality: 90 })
          .toFile(path.join(media, `rover-${attemptIndex + 1}.webp`));
      }
    }
  }
  examples[key] = { title: variant.title, cards };
}
await fs.writeFile(
  path.join(website, 'src/data/examples.json'),
  JSON.stringify(examples, null, 2) + '\n',
);
const catalog = JSON.parse(
  await fs.readFile(
    path.join(repository, 'resources/knowledge/visual-catalog.json'),
    'utf8',
  ),
);
const policy = JSON.parse(
  await fs.readFile(
    path.join(repository, 'resources/catalog-policy.json'),
    'utf8',
  ),
);
const counts = (values) =>
  values.reduce(
    (result, key) => ({ ...result, [key]: (result[key] || 0) + 1 }),
    {},
  );
const axes = [
  'support',
  'backdrop',
  'pattern',
  'backgroundColor',
  'depth',
  'contextDensity',
  'camera',
  'subjectScale',
  'subjectPosition',
  'characterCount',
];
const lookup = new Map(catalog.cards.map((card) => [card.id, card]));
const positions = Array.from({ length: 10 }, (_, index) =>
  counts(
    catalog.sets.map((set) => {
      const member = set.cards.find((card) => card.slot === index + 1);
      const card = member && lookup.get(member.id);
      if (!card) throw new Error('Missing set member');
      return card.observation.category;
    }),
  ),
);
const cohorts = {
  all: catalog.sets,
  ordinary: catalog.sets.filter((set) =>
    set.cards.every(
      (member) => lookup.get(member.id)?.observation.category !== '5',
    ),
  ),
  mixed: catalog.sets.filter(
    (set) =>
      set.cards.some(
        (member) => lookup.get(member.id)?.observation.category === '5',
      ) &&
      set.cards.some(
        (member) => lookup.get(member.id)?.observation.category !== '5',
      ),
  ),
};
const setStatistics = Object.fromEntries(
  Object.entries(cohorts).map(([name, sets]) => [
    name,
    {
      count: sets.length,
      categories: Object.fromEntries(
        ['1', '2', '3', '4', '5'].map((category) => {
          const values = sets.map(
            (set) =>
              set.cards.filter(
                (member) =>
                  lookup.get(member.id)?.observation.category === category,
              ).length,
          );
          return [
            category,
            {
              min: Math.min(...values),
              max: Math.max(...values),
              mean: values.reduce((sum, n) => sum + n, 0) / values.length,
            },
          ];
        }),
      ),
    },
  ]),
);
const stats = {
  cards: catalog.cards.length,
  sets: catalog.sets.length,
  categories: counts(catalog.cards.map((card) => card.observation.category)),
  lowConfidence: catalog.cards.filter(
    (card) => card.observation.confidence < policy.minimumReferenceConfidence,
  ).length,
  confidenceThreshold: policy.minimumReferenceConfidence,
  axes: Object.fromEntries(
    axes.map((axis) => [
      axis,
      counts(
        catalog.cards.map((card) => String(card.observation.facets[axis])),
      ),
    ]),
  ),
  positions,
  setStatistics,
  source:
    'Prepared visual-catalog-v1 publication; aggregate counts only, no original artwork.',
};
await fs.writeFile(
  path.join(website, 'src/data/catalog-statistics.json'),
  JSON.stringify(stats, null, 2) + '\n',
);
console.log(
  `Prepared ${Object.keys(examples).length} generated collections and aggregate statistics (${stats.cards} cards, ${stats.sets} sets).`,
);
