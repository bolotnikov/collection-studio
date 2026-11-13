import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chapters } from '../src/data/chapters.js';
import { showcase } from '../src/data/showcase.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const base = `${(process.env.DOCS_BASE ?? '/').replace(/\/$/, '')}/`;
const walk = async (folder) =>
  (
    await Promise.all(
      (await fs.readdir(folder, { withFileTypes: true })).map(async (entry) => {
        const file = path.join(folder, entry.name);
        return entry.isDirectory() ? walk(file) : [file];
      }),
    )
  ).flat();
const files = await walk(dist);
const htmlFiles = files.filter((file) => file.endsWith('.html'));
const errors = [];
const pages = new Map(
  await Promise.all(
    htmlFiles.map(async (file) => [file, await fs.readFile(file, 'utf8')]),
  ),
);
let checked = 0;
for (const [file, html] of pages) {
  assert.match(html, /<html[^>]*lang="ru"/, `Russian locale missing: ${file}`);
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const value = match[1].replaceAll('&amp;', '&');
    if (/^(https?:|data:|mailto:|tel:|javascript:)/.test(value)) continue;
    const url = new URL(
      value,
      `https://handbook.local${base}${path.relative(dist, file).replaceAll(path.sep, '/')}`,
    );
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith(base)) {
      errors.push(
        `${path.relative(dist, file)} → outside deployment path: ${value}`,
      );
      continue;
    }
    let target = path.join(dist, pathname.slice(base.length));
    if (pathname.endsWith('/')) target = path.join(target, 'index.html');
    try {
      const stat = await fs.stat(target);
      if (stat.isDirectory()) target = path.join(target, 'index.html');
      await fs.access(target);
      if (url.hash && target.endsWith('.html')) {
        const content =
          pages.get(target) ?? (await fs.readFile(target, 'utf8'));
        const id = decodeURIComponent(url.hash.slice(1));
        if (!content.includes(`id="${id}"`))
          errors.push(`${path.relative(dist, file)} → missing #${id}`);
      }
    } catch {
      errors.push(`${path.relative(dist, file)} → ${value}`);
    }
    checked++;
  }
}
assert.equal(chapters.length, 5);
assert.equal(showcase.length, 3);
assert.equal(new Set(showcase.map((card) => card.set)).size, 3);
assert.equal(new Set(showcase.map((card) => card.category)).size, 3);
for (const chapter of chapters) {
  assert.equal(
    new Set(chapter.topics.map((topic) => topic.slug)).size,
    chapter.topics.length,
  );
  for (const topic of chapter.topics) {
    const source = await fs.readFile(
      path.join(root, 'src/content/docs', chapter.slug, `${topic.slug}.mdx`),
      'utf8',
    );
    const prose = source
      .replace(/^---[\s\S]*?---/, '')
      .replace(/^import .+$/gm, '')
      .replace(/<[\s\S]*?\/>/g, '');
    const wordCount = prose.split(/\s+/).filter(Boolean).length;
    assert.ok(
      wordCount <= 180,
      `${chapter.slug}/${topic.slug} is too long (${wordCount} words)`,
    );
    assert.ok(
      pages.has(path.join(dist, chapter.slug, topic.slug, 'index.html')),
      `Topic missing: ${topic.slug}`,
    );
  }
}
const stats = JSON.parse(
  await fs.readFile(
    path.join(root, 'src/data/catalog-statistics.json'),
    'utf8',
  ),
);
assert.equal(
  Object.values(stats.categories).reduce((sum, count) => sum + count, 0),
  stats.cards,
);
assert.equal(stats.positions.length, 10);
assert.ok(
  stats.positions.every(
    (position) =>
      Object.values(position).reduce((sum, count) => sum + count, 0) ===
      stats.sets,
  ),
);
const examples = JSON.parse(
  await fs.readFile(path.join(root, 'src/data/examples.json'), 'utf8'),
);
assert.ok(
  Object.values(examples).every((example) => example.cards.length === 10),
);
assert.deepEqual(errors, [], `Broken links or media:\n${errors.join('\n')}`);
console.log(
  `Verified ${htmlFiles.length} pages, ${checked} local links/assets, five chapters, short topics and aggregate data. No provider calls.`,
);
