import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Contracts } from '../src/shared/Contracts';
import { SourceKnowledgeStore } from '../src/infrastructure/SourceKnowledgeStore';
import { CodexSourceContext } from '../src/infrastructure/style/CodexSourceContext';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { CodexProvider } from '../src/infrastructure/CodexProvider';
import { ImageFiles } from '../src/infrastructure/ImageFiles';
import { SetRules } from '../src/domain/SetRules';

const root = path.resolve('output/source-context');
const data = path.join(os.homedir(), 'Library/Application Support/collection-studio');
await fs.mkdir(root, { recursive: true });
const store = new SourceKnowledgeStore(path.join(data, 'knowledge-assets'));
const profile = Contracts.profile.parse({
  ...JSON.parse(await fs.readFile('resources/style-profile.json', 'utf8')),
  knowledge: await store.import(path.resolve('resources')),
});
const runId = process.argv[2];
if (!runId)
  throw new Error('Pass an existing run ID containing a complete ten-card variant. No run will be mutated.');
const runFolder = path.join(data, 'runs', Contracts.id.parse(runId));
const run = Contracts.run.parse(JSON.parse(await fs.readFile(path.join(runFolder, 'run.json'), 'utf8')));
const variant = run.variants.find((v) => v.cards.length === 10 && v.cards.every((c) => c.selectedAttemptId));
if (!variant) throw new Error('A complete ten-card variant is required.');
const runner = new CodexRunner(await CodexRunner.locate(''), path.join(root, 'jobs'), 'gpt-6.1-sol');
const context = new CodexSourceContext(runner, store.root, path.join(data, 'source-analysis'), 'gpt-6.1-sol');
console.log('Analyzing original set layouts and category illustrations; this does not generate images.');
const prepared = await context.prepare('set-review', run.brief, profile, variant);
await fs.writeFile(path.join(root, 'context.json'), JSON.stringify(prepared.evidence, null, 2));
const sheet = await new ImageFiles().sheet(runFolder, variant);
const savedSheet = path.join(root, 'candidate-set.png');
await fs.copyFile(sheet, savedSheet);
const review = await new CodexProvider(runner).reviewSet(
  variant,
  savedSheet,
  prepared.profile,
  [
    ...profile.references.slice(0, 4).map((r) => path.resolve('resources/references', r.filename)),
    ...prepared.referencePaths,
  ],
  run.brief,
);
SetRules.validateSetReview(review, variant);
review.passed = SetRules.acceptsSetReview(review, 5, true);
await fs.writeFile(path.join(root, 'set-review.json'), JSON.stringify(review, null, 2));
console.log(
  JSON.stringify({
    sourceDocuments: prepared.evidence.documents.length,
    contextImages: prepared.referencePaths.length,
    review,
  }),
);
