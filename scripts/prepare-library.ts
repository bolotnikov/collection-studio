import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Contracts } from '../src/shared/Contracts';
import { StyleContracts, type LibraryItem } from '../src/shared/StyleContracts';

/** Imports supplied art without inventing visual analysis or category labels. */
class LibraryPreparation {
  private static readonly manifest = z.array(
    z.object({
      id: z.string(),
      group: z.string(),
      status: z.string(),
      path: z.string().optional(),
      sha256: z.string().optional(),
      miro_url: z.string(),
      card_number: z.number().optional(),
      inferred_set: z.string().optional(),
      original_filename: z.string().optional(),
    }),
  );

  static async run(): Promise<void> {
    let exportRoot = process.env.REFERENCE_EXPORT_DIR ?? process.env.SOURCE_EXPORT_DIR;
    if (!exportRoot && !process.env.REFERENCE_ART_DIR && !process.env.REFERENCE_MANIFEST) {
      try {
        await fs.access(path.join('local-sources/miro/export', 'Файлы.json'));
        exportRoot = 'local-sources/miro/export';
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      }
    }
    if (exportRoot) {
      await LibraryPreparation.importExport(exportRoot);
      return;
    }
    const sourceRoot = process.env.REFERENCE_ART_DIR;
    if (sourceRoot && !process.env.REFERENCE_MANIFEST) {
      await LibraryPreparation.restoreFromCatalog(sourceRoot);
      return;
    }
    const inventoryPath = process.env.REFERENCE_MANIFEST ?? 'local-sources/miro/api/asset-manifest.json';
    const inventory = LibraryPreparation.manifest.parse(JSON.parse(await fs.readFile(inventoryPath, 'utf8')));
    const profile = Contracts.profile.parse(
      JSON.parse(await fs.readFile('resources/style-profile.json', 'utf8')),
    );
    const destination = path.resolve('resources/references');
    await fs.mkdir(destination, { recursive: true });
    const library: LibraryItem[] = [];
    const downloaded = inventory.filter((item) => item.group === 'cards' && item.status === 'downloaded');
    if (downloaded.length === 0) throw new Error('No downloaded card sources in the manifest.');
    const existing = z
      .array(StyleContracts.libraryItem)
      .parse(JSON.parse(await fs.readFile('resources/library.json', 'utf8')));
    const downloadedHashes = new Set(downloaded.map((item) => item.sha256));
    if (existing.some((item) => !downloadedHashes.has(item.sha256)))
      throw new Error(
        'The legacy manifest would remove catalogued source cards. Use REFERENCE_EXPORT_DIR for the complete export or REFERENCE_ART_DIR to restore the catalog.',
      );
    for (const item of downloaded) {
      if (!item.path || !item.sha256) throw new Error(`Missing source path/hash for ${item.id}.`);
      const sourcePath = process.env.REFERENCE_ART_DIR
        ? path.join(process.env.REFERENCE_ART_DIR, item.path.replace(/^art\//, ''))
        : item.path;
      const bytes = await fs.readFile(sourcePath);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (sha256 !== item.sha256) throw new Error(`Source hash mismatch for ${item.id}.`);
      const curated = profile.references.find((reference) => reference.id === item.id);
      if (curated && curated.sha256 !== sha256)
        throw new Error(`Curated reference hash mismatch for ${item.id}.`);
      const filename = curated?.filename ?? `source-${item.id}.png`;
      if (path.basename(filename) !== filename)
        throw new Error(`Invalid destination filename for ${item.id}.`);
      await fs.writeFile(path.join(destination, filename), bytes);
      const setName = item.inferred_set?.replace(/^\d+-/, '').replaceAll('-', ' ');
      library.push(
        StyleContracts.libraryItem.parse({
          id: item.id,
          filename,
          title: curated?.title ?? `Source card ${item.card_number ?? item.id}`,
          category: curated?.category ?? 'unknown',
          sha256,
          source: item.miro_url,
          origin: 'anchor',
          approved: true,
          tags: [
            'collection:summer',
            'employer-source',
            ...(setName ? [setName, `inferred-set:${item.inferred_set}`] : []),
            ...(item.inferred_set === '16-summer-party'
              ? ['gold-card-source', 'exclude:ordinary-card-generation']
              : []),
          ],
        }),
      );
    }
    if (new Set(library.map((item) => item.id)).size !== library.length)
      throw new Error('Duplicate library IDs.');
    library.sort((a, b) => a.id.localeCompare(b.id));
    await fs.writeFile('resources/library.json', JSON.stringify(library, null, 2) + '\n');
    console.log(
      `Prepared ${library.length} hash-verified source cards; ${library.filter((item) => item.category !== 'unknown').length} curated categories. Other categories await visual analysis.`,
    );
  }

  /** Imports toolbar exports using verified bytes, without inventing Miro image-item IDs. */
  private static async importExport(exportRoot: string): Promise<void> {
    const root = path.resolve(exportRoot);
    const exported = z
      .object({
        board_url: z.string().url(),
        image_count: z.number().int().positive(),
        files: z.array(
          z.object({
            file: z.string(),
            bytes: z.number().int().positive(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          }),
        ),
      })
      .parse(JSON.parse(await fs.readFile(path.join(root, 'Файлы.json'), 'utf8')));
    const sections = z
      .array(z.object({ folder: z.string(), item_id: z.string(), type: z.string() }))
      .parse(JSON.parse(await fs.readFile(path.join(root, 'Разделы.json'), 'utf8')));
    const frame = sections.find(
      (section) => section.folder === 'Примеры карточек' && section.type === 'Frame',
    );
    if (!frame) throw new Error('Missing source card frame in export sections.');
    if (
      exported.files.length !== exported.image_count ||
      new Set(exported.files.map((item) => item.file)).size !== exported.image_count
    )
      throw new Error('Export image count or unique filenames do not match the manifest.');
    // Verify the complete export before copying any card into the runtime library.
    for (const item of exported.files) {
      const filename = path.resolve(root, item.file);
      if (!filename.startsWith(root + path.sep))
        throw new Error(`Source path escapes export directory: ${item.file}`);
      const bytes = await fs.readFile(filename);
      if (bytes.length !== item.bytes || createHash('sha256').update(bytes).digest('hex') !== item.sha256)
        throw new Error(`Export source hash/size mismatch for ${item.file}.`);
    }
    const existing = z
      .array(StyleContracts.libraryItem)
      .parse(JSON.parse(await fs.readFile('resources/library.json', 'utf8')));
    const profile = Contracts.profile.parse(
      JSON.parse(await fs.readFile('resources/style-profile.json', 'utf8')),
    );
    const byHash = new Map(existing.map((item) => [item.sha256, item]));
    const cards = exported.files.filter(
      (item) =>
        item.file.startsWith(frame.folder + '/') && /^CardC6_card_\d+\.png$/i.test(path.basename(item.file)),
    );
    if (cards.length === 0) throw new Error('No source cards found in export.');
    const exportHashes = new Set(cards.map((item) => item.sha256));
    if (existing.some((item) => !exportHashes.has(item.sha256)))
      throw new Error('Export is missing previously catalogued source cards.');
    const library: LibraryItem[] = [];
    const destination = path.resolve('resources/references');
    await fs.mkdir(destination, { recursive: true });
    for (const item of cards) {
      const original = byHash.get(item.sha256);
      const curated = profile.references.find((reference) => reference.sha256 === item.sha256);
      const number = Number(path.basename(item.file).match(/^CardC6_card_(\d+)\.png$/i)?.[1]);
      if (!Number.isSafeInteger(number) || number < 1)
        throw new Error(`Invalid source card number: ${item.file}`);
      const source = new URL(exported.board_url);
      source.searchParams.set('moveToWidget', frame.item_id);
      source.hash = `source-file=${encodeURIComponent(item.file)}`;
      const id = original?.id ?? `source-${item.sha256.slice(0, 24)}`;
      const filename = original?.filename ?? `${id}.png`;
      if (path.basename(filename) !== filename) throw new Error(`Invalid destination filename for ${id}.`);
      library.push(
        StyleContracts.libraryItem.parse({
          ...original,
          id,
          filename,
          title: original?.title ?? curated?.title ?? `Source card ${number}`,
          category: original?.category ?? curated?.category ?? 'unknown',
          sha256: item.sha256,
          source: original?.source ?? source.toString(),
          origin: 'anchor',
          approved: true,
          tags: [
            ...new Set([
              ...(original?.tags ?? ['collection:summer', 'employer-source']),
              `card-number:${number}`,
              `source-filename:${path.basename(item.file)}`,
            ]),
          ],
        }),
      );
      const bytes = await fs.readFile(path.join(root, item.file));
      if (createHash('sha256').update(bytes).digest('hex') !== item.sha256)
        throw new Error(`Export source changed during import: ${item.file}`);
      await fs.writeFile(path.join(destination, filename), bytes);
    }
    if (
      new Set(library.map((item) => item.id)).size !== library.length ||
      new Set(library.map((item) => item.filename)).size !== library.length
    )
      throw new Error('Duplicate source identities or destination filenames.');
    library.sort((a, b) => a.id.localeCompare(b.id));
    await fs.writeFile('resources/library.json', JSON.stringify(library, null, 2) + '\n');
    console.log(
      `Verified ${exported.files.length} export PNGs; imported ${library.length} cards (${library.length - existing.length} new). ${exported.files.length - cards.length} non-card images remain reference-only. Existing source identities and curated names preserved.`,
    );
  }

  /** Restores distributed reference files without requiring the private Miro inventory. */
  private static async restoreFromCatalog(sourceRoot: string): Promise<void> {
    const library = z
      .array(StyleContracts.libraryItem)
      .min(1)
      .parse(JSON.parse(await fs.readFile('resources/library.json', 'utf8')));
    if (new Set(library.map((item) => item.id)).size !== library.length)
      throw new Error('Duplicate library IDs.');
    if (new Set(library.map((item) => item.filename)).size !== library.length)
      throw new Error('Duplicate library destination filenames.');
    for (const item of library) {
      if (path.basename(item.filename) !== item.filename)
        throw new Error(`Invalid destination filename for ${item.id}.`);
    }

    const files = (await fs.readdir(sourceRoot, { recursive: true, withFileTypes: true }))
      .filter(
        (entry) =>
          (entry.isFile() || entry.isSymbolicLink()) && path.extname(entry.name).toLowerCase() === '.png',
      )
      .map((entry) => path.join(entry.parentPath, entry.name))
      .sort();
    const sourcesByHash = new Map<string, string>();
    for (const filename of files) {
      const bytes = await fs.readFile(filename);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (!sourcesByHash.has(sha256)) sourcesByHash.set(sha256, filename);
    }
    const missing = library.filter((item) => !sourcesByHash.has(item.sha256));
    if (missing.length > 0)
      throw new Error(
        `Missing ${missing.length} source reference(s) by SHA-256: ${missing.map((item) => item.id).join(', ')}.`,
      );

    const destination = path.resolve('resources/references');
    await fs.mkdir(destination, { recursive: true });
    for (const item of library) {
      const source = sourcesByHash.get(item.sha256);
      if (!source) throw new Error(`Missing source reference ${item.id}.`);
      const bytes = await fs.readFile(source);
      if (createHash('sha256').update(bytes).digest('hex') !== item.sha256)
        throw new Error(`Source changed during preparation for ${item.id}.`);
      await fs.writeFile(path.join(destination, item.filename), bytes);
    }
    console.log(
      `Restored ${library.length} hash-verified source cards from ${sourceRoot}; existing catalog preserved.`,
    );
  }
}

await LibraryPreparation.run();
