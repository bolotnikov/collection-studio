import { StyleRuleContracts, type StyleRuleEdit } from '../shared/StyleRuleContracts';
import type { StyleRulesPort } from './StyleRulesPort';

/** One local English source of truth; saving rules never calls a model. */
export class StyleRulesService {
  private busy = false;
  constructor(private readonly store: StyleRulesPort) {}
  async save(input: StyleRuleEdit) {
    const edit = StyleRuleContracts.edit.parse(input);
    if (this.busy) throw new Error('Style rules are already being saved.');
    this.busy = true;
    try {
      const result = StyleRuleContracts.settings.parse({ version: 1, ...edit });
      await this.store.save(result);
      return result;
    } finally {
      this.busy = false;
    }
  }
}
