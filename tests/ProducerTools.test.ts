import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArtDirectionService } from '../src/application/ArtDirectionService';
import { StyleRulesService } from '../src/application/StyleRulesService';
import { StyleRulesStore } from '../src/infrastructure/StyleRulesStore';
import { PromptCatalog } from '../src/application/prompts/PromptCatalog';
import { BriefViewModel } from '../src/renderer/src/viewmodels/BriefViewModel';
import { LibraryFilter } from '../src/renderer/src/viewmodels/LibraryFilter';
import { Contracts } from '../src/shared/Contracts';
import { StyleContracts } from '../src/shared/StyleContracts';
import { PromptBuilder } from '../src/application/PromptBuilder';
import { SourceDocumentText } from '../src/application/style/SourceDocumentText';
import direction from '../resources/prompts/art-direction.json';
import requirements from '../resources/production-requirements.json';
import sourceProfile from '../resources/style-profile.json';
const profile = Contracts.profile.parse(sourceProfile),
  settings = Contracts.settings.parse({ imageModel: 'fixture', textModel: 'fixture' });
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});
it('generates a short topic-specific description with current wishes, language and rules, and validates before provider access', async () => {
  const suggest = vi.fn(async (prompt: string) => {
    expect(prompt).toContain('Detective cinema');
    expect(prompt).toContain('No violence');
    expect(prompt).toContain('English');
    expect(prompt).toContain(profile.rules[0] ?? 'missing');
    return { text: 'A coherent detective story through playful recognizable objects.' };
  });
  const factory = vi.fn(() => ({ suggestArtDirection: suggest }));
  const service = new ArtDirectionService(factory, new PromptCatalog(direction, direction));
  await expect(
    service.suggest({ theme: 'Detective cinema', wishes: 'No violence' }, settings, profile),
  ).resolves.toHaveProperty('text');
  await expect(service.suggest({ theme: '', wishes: '' }, settings, profile)).rejects.toThrow();
  expect(factory).toHaveBeenCalledOnce();
});
it('ignores late AI suggestions when the user edits the theme or text and avoids duplicate requests', async () => {
  let release: (result: { text: string }) => void = () => {};
  const suggest = vi.fn(
    () =>
      new Promise<{ text: string }>((resolve) => {
        release = resolve;
      }),
  );
  const model = new BriefViewModel({ suggestArtDirection: suggest });
  model.setTheme('Detective');
  const pending = model.suggest();
  await model.suggest();
  expect(suggest).toHaveBeenCalledOnce();
  model.setWishes('Keep my manual edit');
  release({ text: 'A generated description for the previous input.' });
  await pending;
  expect(model.snapshot().wishes).toBe('Keep my manual edit');
  expect(model.snapshot().suggesting).toBe(false);
  const next = model.suggest();
  model.dispose();
  release({ text: 'Another generated description.' });
  await next;
  expect(model.snapshot().wishes).toBe('Keep my manual edit');
});
it('persists one English rule source locally, reloads it and rejects non-English edits without altering saved rules', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-rules-'));
  folders.push(root);
  const initial = {
    version: 1 as const,
    rendering: [...profile.rules],
    categories: { ...profile.categories },
  };
  const store = new StyleRulesStore(root);
  await store.init(initial);
  const service = new StyleRulesService(store);
  const result = await service.save({
    rendering: ['Use broad painted highlights.'],
    categories: initial.categories,
  });
  expect(result.rendering).toEqual(['Use broad painted highlights.']);
  expect(Object.keys(result).sort()).toEqual(['categories', 'rendering', 'version']);
  const reloaded = new StyleRulesStore(root);
  await reloaded.init(initial);
  expect(reloaded.get()).toEqual(result);
  await expect(
    service.save({ rendering: ['Правило на русском языке'], categories: initial.categories }),
  ).rejects.toThrow('English');
  expect(store.get()).toEqual(result);
});
it('partitions all reference images once and keeps excluded and unclassified art accessible', () => {
  const items = ['1', '2', '3', '4', 'unknown'].map((category, i) =>
    StyleContracts.libraryItem.parse({
      id: `item-${i}`,
      filename: `${i}.png`,
      sha256: `hash-${i}`,
      source: 'fixture',
      title: 'object',
      category,
    }),
  );
  const first = items[0];
  if (!first) throw new Error('Fixture missing');
  items.push({ ...first, id: 'excluded', tags: ['exclude:ordinary-card-generation'] });
  const groups = LibraryFilter.groups(items, 'all');
  expect(groups.flatMap((group) => group.items)).toHaveLength(6);
  expect(new Set(groups.flatMap((group) => group.items.map((item) => item.id))).size).toBe(6);
  expect(LibraryFilter.count(items, '1')).toBe(1);
  expect(LibraryFilter.count(items, 'excluded')).toBe(1);
  expect(LibraryFilter.groups(items, 'unknown')[0]?.items).toHaveLength(1);
});
it('feeds operational rules to generation without exporting recruitment or board metadata', () => {
  const knowledge = {
    version: 1 as const,
    documents: [
      {
        id: 'private',
        title: 'Recruitment task',
        role: 'assignment' as const,
        source: 'https://example.test',
        filename: 'assignment.txt',
        sha256: '0'.repeat(64),
        text: 'Название на доске: private\nТип блока: Doc\nТЕКСТ НА ДОСКЕ\nSubmit to GitHub for recruitment.',
      },
    ],
    images: [],
  };
  const text = PromptBuilder.sourceContext(Contracts.profile.parse({ ...profile, requirements, knowledge }));
  expect(text).toContain('exactly ten distinct');
  expect(text).not.toContain('Submit to GitHub');
  expect(text).not.toContain('Тип блока: Doc');
  expect(
    SourceDocumentText.body('Название: x\nТЕКСТ НА ДОСКЕ\nUseful category rule\nИЗОБРАЖЕНИЯ В ЭТОМ БЛОКЕ\n5'),
  ).toBe('Useful category rule');
});
