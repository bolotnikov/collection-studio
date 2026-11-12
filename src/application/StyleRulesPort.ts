import type { StyleRuleSettings } from '../shared/StyleRuleContracts';
export interface StyleRulesPort {
  get(): StyleRuleSettings;
  save(settings: StyleRuleSettings): Promise<void>;
}
