import fs from 'node:fs/promises';
import path from 'node:path';
import { Contracts, type Card, type Variant } from '../src/shared/Contracts';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { CodexProvider } from '../src/infrastructure/CodexProvider';
import { ImageFiles } from '../src/infrastructure/ImageFiles';
import { PromptBuilder } from '../src/application/PromptBuilder';

const folder = path.resolve('output/codex-calibration');
await fs.mkdir(folder, { recursive: true });
const profile = Contracts.profile.parse(
  JSON.parse(await fs.readFile('resources/style-profile.json', 'utf8')),
);
const runner = new CodexRunner(await CodexRunner.locate(), path.join(folder, 'jobs'), 'gpt-6.1-sol');
const provider = new CodexProvider(runner);
const card: Card = {
  id: 'calibration',
  subject: 'Детективная лупа',
  description:
    'A chunky vintage magnifying glass with a warm brass rim, clear blue-tinted glass and a burgundy wooden handle, floating diagonally on a rich teal radial-gradient background. Single object fully visible, strong readable silhouette, generous margins.',
  category: '1',
  role: 'Главный символ расследования',
  status: 'pending',
  attempts: [],
  selectedAttemptId: null,
  locked: false,
  error: null,
};
const variant: Variant = {
  id: 'calibration',
  title: 'Уютное расследование',
  concept: 'Classic cozy detective objects, appealing casual mobile game collectibles.',
  cards: [card],
  review: null,
  reviewError: null,
};
const prompt = PromptBuilder.build(card, variant, profile);
const references = profile.references
  .filter((r) => r.category === '1')
  .map((r) => path.resolve('resources/references', r.filename));
try {
  const generated = await provider.image(prompt, references, 'low');
  const files = await new ImageFiles().save(folder, 'magnifying-glass', generated.bytes);
  await fs.writeFile(
    path.join(folder, 'generation.json'),
    JSON.stringify(
      {
        provider: 'codex',
        prompt,
        references,
        files,
        usage: generated.usage,
        requestId: generated.requestId,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ stage: 'image_saved', files }));
  const review = await provider.review(card, path.join(folder, files.preview), references, profile);
  await fs.writeFile(path.join(folder, 'review.json'), JSON.stringify(review, null, 2));
  console.log(JSON.stringify({ stage: 'reviewed', review }));
} catch (error) {
  const message = error instanceof Error ? error.message : 'Failed';
  await fs.writeFile(path.join(folder, 'failure.json'), JSON.stringify({ message }));
  console.error(message);
  process.exitCode = 1;
}
