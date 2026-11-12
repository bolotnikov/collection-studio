import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { KnowledgeContracts, type SourceKnowledge } from '../src/shared/KnowledgeContracts';

/** Imports the full source corpus with explicit roles; no model-derived rule is treated as source text. */
class KnowledgePreparation {
  static async run(): Promise<void> {
    const root = path.resolve(process.env.SOURCE_EXPORT_DIR ?? 'Art Sources');
    const target = path.resolve('resources/knowledge');
    const sections = z
      .array(z.object({ folder: z.string(), item_id: z.string(), title: z.string() }))
      .parse(JSON.parse(await fs.readFile(path.join(root, 'Разделы.json'), 'utf8')));
    const manifest = z
      .object({
        board_url: z.string(),
        files: z.array(z.object({ file: z.string(), sha256: z.string().length(64) })),
      })
      .parse(JSON.parse(await fs.readFile(path.join(root, 'Файлы.json'), 'utf8')));
    const roles: Record<string, SourceKnowledge['documents'][number]['role']> = {
      'Тестовое задание': 'assignment',
      'Описание коллекций': 'collection-structure',
      'Общие правила': 'composition-rules',
      'Анализ принципов составления коллекций': 'analysis-space',
      'Пример коллекции': 'reference-inventory',
      'Примеры карточек': 'reference-inventory',
      'Фрейм для описания хода работы и результатов': 'delivery',
    };
    const categoryNames = ['10.35.12', '11.18.28', '11.18.41', '11.18.51', '11.19.00'];
    const corpus: SourceKnowledge = { version: 1, documents: [], images: [] };
    await fs.mkdir(path.join(target, 'images'), { recursive: true });
    for (const section of sections) {
      const role = roles[section.folder];
      if (!role) throw new Error(`Unknown source section: ${section.folder}`);
      const filename = `${section.folder}/Описание.txt`;
      const bytes = await fs.readFile(path.join(root, filename));
      const text = bytes.toString('utf8');
      corpus.documents.push({
        id: section.item_id,
        title: section.title,
        filename,
        text,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        role,
        source: `${manifest.board_url}?moveToWidget=${section.item_id}`,
      });
    }
    for (const item of manifest.files.filter((file) => !file.file.startsWith('Примеры карточек/'))) {
      const absolute = path.resolve(root, item.file);
      if (!absolute.startsWith(root + path.sep)) throw new Error('Source path escapes export.');
      const bytes = await fs.readFile(absolute);
      if (createHash('sha256').update(bytes).digest('hex') !== item.sha256)
        throw new Error(`Source changed: ${item.file}`);
      const section = sections.find((s) => item.file.startsWith(s.folder + '/'));
      if (!section) throw new Error('Source image has no section.');
      const categoryIndex = categoryNames.findIndex((name) => item.file.includes(name));
      const role =
        section.folder === 'Пример коллекции'
          ? 'collection-example'
          : section.folder === 'Общие правила'
            ? 'category-example'
            : 'delivery-template';
      const category =
        role === 'category-example'
          ? KnowledgeContracts.image.shape.category.parse(String(categoryIndex + 1))
          : null;
      const filename = `images/${item.sha256}.png`;
      await fs.writeFile(path.join(target, filename), bytes);
      corpus.images.push({
        id: `knowledge-${item.sha256.slice(0, 24)}`,
        title: path.basename(item.file),
        filename,
        sha256: item.sha256,
        role,
        category,
        source: `${manifest.board_url}?moveToWidget=${section.item_id}#file=${encodeURIComponent(item.file)}`,
      });
    }
    const validated = KnowledgeContracts.corpus.parse(corpus);
    if (validated.images.length !== 25 || validated.documents.length !== 7)
      throw new Error('Incomplete source corpus.');
    await fs.writeFile(path.join(target, 'catalog.json'), JSON.stringify(validated, null, 2));
    console.log(
      `Prepared ${validated.documents.length} source documents and ${validated.images.length} contextual images.`,
    );
  }
}
await KnowledgePreparation.run();
