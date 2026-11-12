import fs from 'node:fs/promises';
import path from 'node:path';
import { StyleRuleContracts, type StyleRuleSettings } from '../shared/StyleRuleContracts';
import type { StyleRulesPort } from '../application/StyleRulesPort';

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
