import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Contracts } from '../src/shared/Contracts';
import { OpenAiProvider } from '../src/infrastructure/OpenAiProvider';
import { ImageFiles } from '../src/infrastructure/ImageFiles';

dotenv.config({ override: true, quiet: true });
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('Missing API key.');
const profile = Contracts.profile.parse(
  JSON.parse(await fs.readFile('resources/style-profile.json', 'utf8')),
);
const provider = new OpenAiProvider(key, 'gpt-image-2', 'gpt-4.1-mini');
const folder = path.resolve('output/calibration');
await fs.mkdir(folder, { recursive: true });
const prompt = `Create a single collectible casual mobile game illustration of a chunky brass detective magnifying glass floating diagonally on a rich teal gradient with subtle concentric rays. One dominant object, no other objects, no text, no people, no frame. References define rendering style only, do not copy their subjects. ${profile.rules.join(' ')} Keep the entire magnifying glass inside the central 43:48 portrait crop of the square image.`;
const refs = profile.references
  .filter((r) => r.category === '1')
  .map((r) => path.resolve('resources/references', r.filename));
try {
  const start = Date.now();
  const result = await provider.image(prompt, refs, 'low');
  const files = await new ImageFiles().save(folder, 'magnifying-glass', result.bytes);
  await fs.writeFile(
    path.join(folder, 'experiment.json'),
    JSON.stringify(
      {
        model: 'gpt-image-2',
        quality: 'low',
        prompt,
        referenceIds: profile.references.filter((r) => r.category === '1').map((r) => r.id),
        elapsedMs: Date.now() - start,
        usage: result.usage,
        requestId: result.requestId,
        files,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ success: true, folder, files, usage: result.usage }));
} catch (error) {
  const message = error instanceof Error ? error.message.replaceAll(key, '[REDACTED]') : 'API failure';
  await fs.writeFile(path.join(folder, 'failure.json'), JSON.stringify({ success: false, message }));
  console.error(message);
  process.exitCode = 1;
}
