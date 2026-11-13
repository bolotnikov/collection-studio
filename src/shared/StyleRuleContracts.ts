import { z } from 'zod';

export class StyleRuleContracts {
  static readonly line = z.string().trim().min(3).max(2000);
  static readonly rendering = z.array(StyleRuleContracts.line).min(1).max(40);
  static readonly categories = z.object({
    '1': StyleRuleContracts.line,
    '2': StyleRuleContracts.line,
    '3': StyleRuleContracts.line,
    '4': StyleRuleContracts.line,
    '5': StyleRuleContracts.line.optional(),
  });
  static readonly text = z.object({
    rendering: StyleRuleContracts.rendering,
    categories: StyleRuleContracts.categories,
  });
  static readonly settings = StyleRuleContracts.text.extend({
    version: z.union([z.literal(1), z.literal(2)]),
    preservedCustomFields: z.array(z.string()).optional(),
  });
  static readonly edit = StyleRuleContracts.text;
}
export type StyleRuleSettings = z.infer<typeof StyleRuleContracts.settings>;
export type StyleRuleEdit = z.infer<typeof StyleRuleContracts.edit>;
