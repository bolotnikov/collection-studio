import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { KnowledgeContracts } from '../src/shared/KnowledgeContracts';
import { StyleContracts } from '../src/shared/StyleContracts';

it('prepares references, the library and knowledge from the default linked local export', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-source-preparation-'));
  try {
    const resources = path.join(root, 'resources');
    await fs.cp(path.resolve('resources'), resources, { recursive: true });
    const corpus = KnowledgeContracts.corpus.parse(
      JSON.parse(await fs.readFile(path.join(resources, 'knowledge/catalog.json'), 'utf8')),
    );
    const library = StyleContracts.libraryItem
      .array()
      .parse(JSON.parse(await fs.readFile(path.join(resources, 'library.json'), 'utf8')));
    const exportRoot = path.join(root, 'local-sources/miro/export');
    const files: { file: string; bytes: number; sha256: string }[] = [];
    const link = async (file: string, source: string, sha256: string) => {
      const destination = path.join(exportRoot, file);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.symlink(path.relative(path.dirname(destination), source), destination);
      files.push({ file, bytes: (await fs.stat(source)).size, sha256 });
    };
    for (const card of library) {
      const filename = card.tags
        .find((tag) => tag.startsWith('source-filename:'))
        ?.slice('source-filename:'.length);
      if (!filename) throw new Error('Missing original card filename');
      await link(
        `Примеры карточек/${filename}`,
        path.join(resources, 'references', card.filename),
        card.sha256,
      );
    }
    for (const image of corpus.images) {
      const folder =
        image.role === 'collection-example'
          ? 'Пример коллекции'
          : image.role === 'category-example'
            ? 'Общие правила'
            : 'Фрейм для описания хода работы и результатов';
      await link(`${folder}/${image.title}`, path.join(resources, 'knowledge', image.filename), image.sha256);
    }
    const sections = [];
    for (const document of corpus.documents) {
      const filename = path.join(exportRoot, document.filename);
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, document.text);
      sections.push({
        folder: path.dirname(document.filename),
        item_id: document.id,
        title: document.title,
        type: 'Frame',
      });
    }
    await fs.writeFile(path.join(exportRoot, 'Разделы.json'), JSON.stringify(sections));
    await fs.writeFile(
      path.join(exportRoot, 'Файлы.json'),
      JSON.stringify({
        board_url: 'https://miro.com/app/board/uXjVEOqNGVA=/',
        image_count: files.length,
        files,
      }),
    );
    const env = { ...process.env };
    for (const key of [
      'SOURCE_EXPORT_DIR',
      'REFERENCE_EXPORT_DIR',
      'REFERENCE_ART_DIR',
      'REFERENCE_MANIFEST',
    ])
      delete env[key];
    const run = (script: string, overrides: NodeJS.ProcessEnv = {}) =>
      promisify(execFile)(
        process.execPath,
        [path.resolve('node_modules/tsx/dist/cli.mjs'), path.resolve('scripts', script)],
        { cwd: root, env: { ...env, ...overrides } },
      );
    expect((await run('prepare-references.ts')).stdout).toContain('Prepared 8 reference images');
    expect((await run('prepare-library.ts')).stdout).toContain(
      'Verified 185 export PNGs; imported 160 cards',
    );
    expect((await run('prepare-library.ts', { REFERENCE_ART_DIR: exportRoot })).stdout).toContain(
      'Restored 160 hash-verified source cards',
    );
    expect((await run('prepare-knowledge.ts')).stdout).toContain(
      'Prepared 7 source documents and 25 contextual images',
    );
    const imported = KnowledgeContracts.corpus.parse(
      JSON.parse(await fs.readFile(path.join(resources, 'knowledge/catalog.json'), 'utf8')),
    );
    expect(imported.documents).toEqual(corpus.documents);
    expect(imported.images.map((image) => image.sha256).sort()).toEqual(
      corpus.images.map((image) => image.sha256).sort(),
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}, 30_000);
