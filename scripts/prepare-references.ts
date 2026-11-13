import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Contracts } from '../src/shared/Contracts';

const inventorySchema = z.array(
  z.object({
    id: z.string(),
    status: z.string(),
    path: z.string().optional(),
    original_filename: z.string().optional(),
    miro_url: z.string().optional(),
  }),
);
const sourceRoot =
  process.env.REFERENCE_ART_DIR ??
  (process.env.REFERENCE_MANIFEST
    ? undefined
    : (process.env.SOURCE_EXPORT_DIR ?? 'local-sources/miro/export'));
const inventory = sourceRoot
  ? []
  : inventorySchema.parse(
      JSON.parse(
        await fs.readFile(
          process.env.REFERENCE_MANIFEST ?? 'local-sources/miro/api/asset-manifest.json',
          'utf8',
        ),
      ),
    );
const sourceFiles = sourceRoot
  ? (await fs.readdir(sourceRoot, { recursive: true, withFileTypes: true })).filter(
      (entry) => entry.isFile() || entry.isSymbolicLink(),
    )
  : [];
const picks = [
  [21, '1', 'Graduation cap'],
  [24, '1', 'Calculator'],
  [14, '2', 'Sneakers'],
  [53, '2', 'Apple basket'],
  [13, '3', 'Football on grass'],
  [48, '3', 'Fruit on a wooden surface'],
  [91, '4', 'Sandcastle'],
  [60, '4', 'Boat at a pier'],
] as const;
const profile = Contracts.profile.parse(
  JSON.parse(await fs.readFile('resources/style-profile.json', 'utf8')),
);
const originalReferences = profile.references;
profile.references = [];
await fs.mkdir('resources/references', { recursive: true });
for (const [number, category, title] of picks) {
  const item = inventory.find(
    (i) => i.original_filename === `CardC6_card_${number}.png` && i.status === 'downloaded',
  );
  const filename = `reference-${number}.png`;
  const original = originalReferences.find((r) => r.filename === filename);
  const sourceFile = sourceFiles.find(
    (entry) =>
      entry.name === `CardC6_card_${number}.png` || entry.name.endsWith(`__CardC6_card_${number}.png`),
  );
  const input = sourceFile ? path.join(sourceFile.parentPath, sourceFile.name) : item?.path;
  if (!input || !original)
    throw new Error(
      `Missing reference ${number}. Set REFERENCE_ART_DIR to the folder containing the original card PNGs.`,
    );
  const bytes = await fs.readFile(input);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== original.sha256)
    throw new Error(`Reference ${number} does not match the recorded source hash.`);
  await fs.writeFile(path.join('resources/references', filename), bytes);
  profile.references.push({
    id: original.id,
    filename,
    title,
    category,
    sha256,
    source: original.source,
  });
}
await fs.writeFile('resources/style-profile.json', JSON.stringify(profile, null, 2) + '\n');
console.log(`Prepared ${profile.references.length} reference images with provenance.`);
