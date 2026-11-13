import { z } from 'zod';
import baseline from '../../resources/catalog-analysis-baseline.json';
import exceptions from '../../resources/source-exceptions.json';
import { StyleRuleContracts } from './StyleRuleContracts';

/** Historical analysis inputs bound to the shipped observations; generation edits are independent. */
export class CatalogClassificationRules {
  private static readonly baseline = z
    .object({
      version: z.literal(2),
      rendering: StyleRuleContracts.rendering,
      categories: StyleRuleContracts.categories.extend({ '5': StyleRuleContracts.line }),
      scope: z.string().min(10),
    })
    .parse(baseline);
  private static readonly exceptions = z
    .object({
      version: z.literal(1),
      exceptions: z.array(
        z.object({
          sourceSha256: z.string().length(64),
          slot: z.number().int().min(1).max(10),
          excludedRole: z.literal('category-classification'),
          reason: z.string().min(10),
        }),
      ),
    })
    .parse(exceptions);
  static snapshot() {
    const { scope, ...rules } = this.baseline;
    return structuredClone({ ...rules, exceptions: this.exceptions, scope });
  }
}
