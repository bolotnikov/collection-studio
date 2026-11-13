import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { CatalogInputLoader } from '../src/infrastructure/CatalogInputLoader';
import { CatalogWorkspace } from '../src/infrastructure/CatalogWorkspace';
import { VisualCatalogStore } from '../src/infrastructure/VisualCatalogStore';
import { StyleRulesStore } from '../src/infrastructure/StyleRulesStore';
import { StyleRulesService } from '../src/application/StyleRulesService';
import canonical from '../resources/canonical-style-rules.json';
import prompts from '../resources/prompts/catalog.json';
import { StyleRuleContracts } from '../src/shared/StyleRuleContracts';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});
it('opens the shipped catalog without analysis, independently of generation-rule edits', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-readiness-'));
  folders.push(root);
  const shipped = await new VisualCatalogStore('resources/knowledge/visual-catalog.json').read();
  const input = () => new CatalogInputLoader('resources').load(shipped.model, prompts);
  expect((await input()).dependencyHash).toBe(shipped.dependencyHash);
  const analysis = vi.fn(() => {
    throw new Error('Startup must not call an analysis provider');
  });
  const workspace = new CatalogWorkspace(path.resolve('resources'), root, input, analysis);
  await workspace.ensure();
  expect((await workspace.status()).status).toBe('ready');
  const store = new StyleRulesStore(path.join(root, 'rules'));
  await store.init(StyleRuleContracts.settings.parse(canonical));
  const service = new StyleRulesService(store);
  await service.save({
    rendering: ['A user-edited global rendering instruction.'],
    categories: canonical.categories,
  });
  await workspace.ensure();
  expect((await workspace.ready()).dependencyHash).toBe(shipped.dependencyHash);
  expect(analysis).not.toHaveBeenCalled();
  expect(store.get().rendering).toEqual(['A user-edited global rendering instruction.']);
});
it('still detects changes in actual source inventory rather than accepting stale classification', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-inventory-'));
  folders.push(root);
  await fs.mkdir(path.join(root, 'knowledge'), { recursive: true });
  for (const file of [
    'library.json',
    'additional-set-membership.json',
    'knowledge/catalog.json',
    'knowledge/visual-catalog.json',
  ])
    await fs.copyFile(path.join('resources', file), path.join(root, file));
  const original = JSON.parse(await fs.readFile(path.join(root, 'library.json'), 'utf8'));
  // A changed inventory must require a new publication; do not overwrite its dependency hash.
  const { StyleContracts } = await import('../src/shared/StyleContracts');
  const library = StyleContracts.libraryItem.array().parse(original);
  const first = library[0];
  if (!first) throw new Error('Missing fixture');
  first.title = 'Changed source metadata';
  await fs.writeFile(path.join(root, 'library.json'), JSON.stringify(library));
  const shipped = await new VisualCatalogStore(path.join(root, 'knowledge/visual-catalog.json')).read();
  const workspace = new CatalogWorkspace(
    root,
    path.join(root, 'storage'),
    () => new CatalogInputLoader(root).load(shipped.model, prompts),
    () => {
      throw new Error('No model calls in this check');
    },
  );
  await expect(workspace.ready()).rejects.toThrow('updated automatically');
});
