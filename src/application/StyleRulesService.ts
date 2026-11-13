import defaults from '../../resources/canonical-style-rules.json';
import { StyleRuleContracts, type StyleRuleEdit } from '../shared/StyleRuleContracts';
import type { StyleRulesPort } from './StyleRulesPort';

/** One canonical rule source independent of UI locale; saving never calls a model. */
export class StyleRulesService {
  private busy = false;
  constructor(private readonly store: StyleRulesPort) {}
  async save(input: StyleRuleEdit) {
    const edit = StyleRuleContracts.edit.parse(input);
    if (this.busy) throw new Error('Style rules are already being saved.');
    this.busy = true;
    try {
      const result = StyleRuleContracts.settings.parse({ version: 2, ...edit, categories: { ...edit.categories, '5': edit.categories['5'] ?? defaults.categories['5'] } });
      await this.store.save(result);
      return result;
    } finally {
      this.busy = false;
    }
  }
}
