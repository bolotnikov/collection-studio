import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArtDirectionService } from '../src/application/ArtDirectionService';
import { StyleRulesService } from '../src/application/StyleRulesService';
import { StyleRulesStore } from '../src/infrastructure/StyleRulesStore';
import canonical from '../resources/canonical-style-rules.json';
import { PromptCatalog } from '../src/application/prompts/PromptCatalog';
import { BriefViewModel } from '../src/renderer/src/viewmodels/BriefViewModel';
import { LibraryFilter } from '../src/renderer/src/viewmodels/LibraryFilter';
import { Contracts } from '../src/shared/Contracts';
import { StyleContracts } from '../src/shared/StyleContracts';
import { PromptBuilder } from '../src/application/PromptBuilder';
import { SourceDocumentText } from '../src/application/style/SourceDocumentText';
import { GenerationContentPolicy } from '../src/application/GenerationContentPolicy';
import modes from '../resources/content-modes.json';
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
it.each([false, true])(
  'passes gold mode to art direction and removes legacy blanket bans (gold=%s)',
  async (includeGold) => {
    const suggest = vi.fn(async (prompt: string) => {
      expect(prompt).toContain(`"includeGold":${includeGold}`);
      expect(prompt).toContain(modes.scopedClause);
      for (const ban of modes.ordinaryClauses) expect(prompt).not.toContain(ban);
      return { text: 'A connected investigation with clearly readable subjects.' };
    });
    const factory = vi.fn((_settings: typeof settings, effectiveProfile: typeof profile) => {
      expect(effectiveProfile.rules.includes(modes.mixedClause)).toBe(includeGold);
      return { suggestArtDirection: suggest };
    });
    const service = new ArtDirectionService(factory, new PromptCatalog(direction, direction));
    await service.suggest({ theme: 'Detective cinema', wishes: '', includeGold }, settings, profile);
    expect(suggest).toHaveBeenCalledOnce();
  },
);

it('ignores an art-direction response requested before gold mode changed', async () => {
  let release: (result: { text: string }) => void = () => {};
  const suggest = vi.fn(
    () =>
      new Promise<{ text: string }>((resolve) => {
        release = resolve;
      }),
  );
  const model = new BriefViewModel({ suggestArtDirection: suggest });
  model.setTheme('Detective');
  model.setIncludeGold(true);
  const pending = model.suggest();
  expect(suggest).toHaveBeenCalledWith({ theme: 'Detective', wishes: '', includeGold: true });
  model.setIncludeGold(false);
  release({ text: 'A scene with two detectives following a clue.' });
  await pending;
  expect(model.snapshot().wishes).toBe('');
  expect(model.snapshot().suggesting).toBe(false);
});

it.each([false, true])(
  'scopes legacy bans across generation stages without mutating historical inputs (gold=%s)',
  (includeGold) => {
    const original = Contracts.profile.parse({ ...profile, requirements });
    const snapshot = structuredClone(original);
    const policy = StyleContracts.policy.parse({
      rules: [...modes.ordinaryClauses, 'Keep my custom production rule.'],
    });
    const beforePolicy = structuredClone(policy);
    const content = GenerationContentPolicy.apply(original, policy, includeGold);
    expect(content.profile.rules).toContain(modes.scopedClause);
    expect(content.profile.rules.includes(modes.mixedClause)).toBe(includeGold);
    expect(content.policy?.rules).toContain('Keep my custom production rule.');
    expect(content.policy?.rules.includes(modes.mixedClause)).toBe(includeGold);
    const brief = Contracts.brief.parse({
      theme: 'Detective',
      wishes: '',
      includeGold,
      quality: 'low',
      maxImageCalls: 10,
      autoRepair: true,
    });
    const planning = PromptBuilder.planning(brief, content.profile);
    expect(planning).toContain(modes.scopedClause);
    const cardContext = PromptBuilder.sourceContext(content.profile, includeGold ? '5' : '1');
    const setContext = PromptBuilder.sourceContext(content.profile, undefined, 'set-review');
    for (const prompt of [planning, cardContext, setContext])
      for (const ban of modes.ordinaryClauses) expect(prompt).not.toContain(ban);
    expect(original).toEqual(snapshot);
    expect(policy).toEqual(beforePolicy);
  },
);
it('persists one canonical Russian rule source independently of UI localization', async () => {
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
  const russian = await service.save({
    rendering: ['Правило на русском языке'],
    categories: initial.categories,
  });
  expect(russian.rendering).toEqual(['Правило на русском языке']);
  expect(store.get()).toEqual(russian);
});
it('migrates unchanged defaults to Miro Russian text while preserving custom edits and a backup', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-migration-'));
  folders.push(root);
  const legacy = {
    version: 1,
    rendering: profile.rules,
    categories: { ...profile.categories, '2': 'My custom support rule' },
  };
  await fs.writeFile(path.join(root, 'style-rules.json'), JSON.stringify(legacy));
  const store = new StyleRulesStore(root);
  await store.init({ ...legacy, version: 1 });
  expect(store.get().version).toBe(2);
  expect(store.get().rendering).toEqual(canonical.rendering);
  expect(store.get().categories['1']).toBe(canonical.categories['1']);
  expect(store.get().categories['2']).toBe('My custom support rule');
  expect(store.get().preservedCustomFields).toEqual(['category-2']);
  const backup = (await fs.readdir(root)).find((file) => file.startsWith('style-rules.v1.'));
  if (!backup) throw new Error('Missing migration backup');
  expect(JSON.parse(await fs.readFile(path.join(root, backup), 'utf8'))).toEqual(legacy);
  const reopened = new StyleRulesStore(root);
  await reopened.init({ ...legacy, version: 1 });
  expect(reopened.get()).toEqual(store.get());
  expect((await fs.readdir(root)).filter((file) => file.startsWith('style-rules.v1.'))).toHaveLength(1);
});

it('scopes recognized saved defaults with a backup while preserving custom edits and historical profiles', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-scoped-rules-'));
  folders.push(root);
  const previous = {
    version: 2 as const,
    rendering: [...canonical.rendering.slice(0, 6), modes.ordinaryClauses[1], 'Keep custom lighting.'],
    categories: canonical.categories,
  };
  await fs.writeFile(path.join(root, 'style-rules.json'), JSON.stringify(previous));
  const historical = JSON.stringify({ rules: previous.rendering });
  await fs.writeFile(path.join(root, 'historical-profile.json'), historical);
  const store = new StyleRulesStore(root);
  await store.init({ ...previous, rendering: canonical.rendering });
  expect(store.get().rendering).toContain(modes.scopedClause);
  expect(store.get().rendering).toContain('Keep custom lighting.');
  expect(store.get().categories).toEqual(previous.categories);
  const backups = (await fs.readdir(root)).filter((file) => file.startsWith('style-rules.v2.'));
  const backup = backups[0];
  if (!backup) throw new Error('Missing category-scope migration backup');
  expect(backups).toHaveLength(1);
  expect(JSON.parse(await fs.readFile(path.join(root, backup), 'utf8'))).toEqual(previous);
  await store.init({ ...previous, rendering: canonical.rendering });
  expect((await fs.readdir(root)).filter((file) => file.startsWith('style-rules.v2.'))).toEqual(backups);
  expect(await fs.readFile(path.join(root, 'historical-profile.json'), 'utf8')).toBe(historical);
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
  const rule = requirements.find((section) => section.id === 'set-structure')?.rules[0];
  if (!rule) throw new Error('Missing set structure rule');
  expect(text).toContain(rule);
  expect(text).not.toContain('Submit to GitHub');
  expect(text).not.toContain('Тип блока: Doc');
  expect(
    SourceDocumentText.body('Название: x\nТЕКСТ НА ДОСКЕ\nUseful category rule\nИЗОБРАЖЕНИЯ В ЭТОМ БЛОКЕ\n5'),
  ).toBe('Useful category rule');
});
