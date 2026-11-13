import fs from 'node:fs/promises';
import path from 'node:path';
import { StyleRuleContracts, type StyleRuleSettings } from '../shared/StyleRuleContracts';
import type { StyleRulesPort } from '../application/StyleRulesPort';
import defaults from '../../resources/canonical-style-rules.json';
import legacy from '../../resources/style-profile.json';
import { createHash } from 'node:crypto';
import { GenerationContentPolicy } from '../application/GenerationContentPolicy';

export class StyleRulesStore implements StyleRulesPort {
  private settings: StyleRuleSettings | null = null;
  constructor(private readonly root: string) {}
  async init(initial: StyleRuleSettings): Promise<void> {
    try {
      this.settings = StyleRuleContracts.settings.parse(
        JSON.parse(await fs.readFile(path.join(this.root, 'style-rules.json'), 'utf8')),
      );
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      this.settings = StyleRuleContracts.settings.parse(initial);
    }
    if (this.settings.version === 1) {
      const previous = this.get();
      await this.backup(previous);
      const migrated = StyleRuleContracts.settings.parse(defaults);
      const preserved: string[] = [];
      if (JSON.stringify(previous.rendering) !== JSON.stringify(legacy.rules)) {
        migrated.rendering = previous.rendering;
        preserved.push('rendering');
      }
      for (const category of ['1', '2', '3', '4'] as const) {
        if (previous.categories[category] !== legacy.categories[category]) {
          migrated.categories[category] = previous.categories[category];
          preserved.push(`category-${category}`);
        }
      }
      if (preserved.length) migrated.preservedCustomFields = preserved;
      await this.save(migrated);
    }
    const previous = this.get();
    const rendering = GenerationContentPolicy.scopeRules(previous.rendering);
    if (JSON.stringify(rendering) !== JSON.stringify(previous.rendering)) {
      await this.backup(previous);
      await this.save({ ...previous, rendering });
    }
    if (!this.settings.categories['5'])
      await this.save({
        ...this.get(),
        categories: { ...this.get().categories, '5': defaults.categories['5'] },
      });
  }
  private async backup(settings: StyleRuleSettings): Promise<void> {
    const serialized = JSON.stringify(settings, null, 2);
    await fs.mkdir(this.root, { recursive: true });
    const hash = createHash('sha256').update(serialized).digest('hex');
    await fs.writeFile(path.join(this.root, `style-rules.v${settings.version}.${hash}.json`), serialized);
  }
  get(): StyleRuleSettings {
    if (!this.settings) throw new Error('Style rules are not initialized.');
    return structuredClone(this.settings);
  }
  async save(input: StyleRuleSettings): Promise<void> {
    const settings = StyleRuleContracts.settings.parse(input);
    await fs.mkdir(this.root, { recursive: true });
    const file = path.join(this.root, 'style-rules.json');
    await fs.writeFile(file + '.tmp', JSON.stringify(settings, null, 2));
    await fs.rename(file + '.tmp', file);
    this.settings = settings;
  }
}
