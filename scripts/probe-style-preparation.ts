import { randomUUID } from 'node:crypto';
import { SetRules } from '../src/domain/SetRules';
import { CodexProvider } from '../src/infrastructure/CodexProvider';
import { ImageFiles } from '../src/infrastructure/ImageFiles';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import { Contracts } from '../src/shared/Contracts';
import { StyleContracts } from '../src/shared/StyleContracts';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { CodexStylePreparation } from '../src/infrastructure/style/CodexStylePreparation';

const root = path.resolve('output/style-preparation');
await fs.mkdir(root, { recursive: true });
const profile = Contracts.profile.parse(
  JSON.parse(await fs.readFile('resources/style-profile.json', 'utf8')),
);
const library = z
  .array(StyleContracts.libraryItem)
  .parse(JSON.parse(await fs.readFile('resources/library.json', 'utf8')));
const brief = Contracts.brief.parse({
  theme: 'Detective cinema',
  wishes: 'Bright casual-game rendering, complete silhouette, simplified felt material.',
  variants: 3,
  quality: 'low',
  maxImageCalls: 90,
  autoRepair: true,
});
const card = Contracts.card.parse({
  id: 'style-probe-fedora',
  subject: 'Detective Fedora',
  description:
    'A burgundy felt detective fedora floating on a turquoise radial background, a complete wide brim and plain dark ribbon, rounded simplified painted volumes and no photoreal fabric grain.',
  category: '1',
  role: 'Iconic detective silhouette',
  status: 'pending',
  attempts: [],
  selectedAttemptId: null,
  locked: false,
  error: null,
});
const variant = Contracts.variant.parse({
  id: 'style-probe-set',
  title: 'The Rainy Night Case',
  concept:
    'Cozy detective objects in the supplied bright stylized casual-game rendering, varied materials and clear silhouettes.',
  cards: [card],
  review: null,
  reviewError: null,
});
const model = 'gpt-6.1-sol';
const runner = new CodexRunner(await CodexRunner.locate(''), path.join(root, 'jobs'), model);
const preparation = new CodexStylePreparation(
  runner,
  library,
  path.resolve('resources/references'),
  path.join(os.homedir(), 'Library/Application Support/collection-studio/reference-analysis'),
  model,
  StyleContracts.policy.parse({}),
);
console.log('Indexing source library; cached analyses are reused.');
if (process.argv.includes('--index-only')) {
  await preparation.initialize(undefined, async (indexed, total) => {
    console.log(`Reference library: ${indexed}/${total} analyzed`);
  });
  const catalog = await preparation.catalog();
  await fs.writeFile(path.join(root, 'catalog-analysis.json'), JSON.stringify(catalog, null, 2));
  console.log(
    JSON.stringify({
      sourceCards: catalog.length,
      eligible: catalog.filter((item) => !item.tags.includes('exclude:ordinary-card-generation')).length,
    }),
  );
} else {
  const repair = process.argv.includes('--repair');
  const prepared = repair
    ? z
        .object({ prompt: z.string(), references: z.array(z.string()), evidence: StyleContracts.evidence })
        .parse(JSON.parse(await fs.readFile(path.join(root, 'preparation.json'), 'utf8')))
    : await preparation.prepare(brief, card, variant, profile);
  await fs.writeFile(path.join(root, 'preparation.json'), JSON.stringify(prepared, null, 2));
  console.log(`Prepared ${prepared.references.length} references with recorded selection evidence.`);

  if (process.argv.includes('--generate') || repair) {
    const policy = StyleContracts.policy.parse({ styleThreshold: 5 });
    const reviewRecord = z.object({
      review: Contracts.review,
      files: z.object({ master: z.string(), preview: z.string() }),
      usage: z.unknown(),
    });
    const historyFile = path.join(root, 'repair-history.json');
    let history: Array<z.infer<typeof reviewRecord>> = [];
    let correction = '';
    if (repair) {
      try {
        history = reviewRecord.array().parse(JSON.parse(await fs.readFile(historyFile, 'utf8')));
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      if (history.length === 0)
        history.push(
          reviewRecord.parse(JSON.parse(await fs.readFile(path.join(root, 'review.json'), 'utf8'))),
        );
      if (history.length > policy.maxRepairsPerCard) throw new Error('Calibration repair budget exhausted.');
      const latest = history.at(-1);
      if (!latest) throw new Error('Calibration result missing.');
      correction = latest.review.correction || latest.review.findings.join('; ');
    }
    const prompt = prepared.prompt + (correction ? `\nMANDATORY TARGETED CORRECTION: ${correction}` : '');
    const provider = new CodexProvider(runner);
    const generated = await provider.image(prompt, prepared.references, 'low');
    const files = await new ImageFiles().save(root, `style-probe-fedora-${randomUUID()}`, generated.bytes);
    const review = await provider.review(
      card,
      path.join(root, files.preview),
      prepared.references,
      profile,
      brief,
    );
    review.passed = SetRules.acceptsReview(review, policy.styleThreshold);
    history.push({ review, files, usage: generated.usage });
    await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
    await fs.writeFile(path.join(root, files.preview + '.prompt.txt'), prompt);
    await fs.writeFile(
      path.join(root, 'review.json'),
      JSON.stringify({ review, files, usage: generated.usage, policy }, null, 2),
    );
    console.log(JSON.stringify({ stage: 'reviewed', review, files }));
  }
}
