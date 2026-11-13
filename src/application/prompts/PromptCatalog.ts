import defaults from '../../../resources/prompts/production.json';
import { z } from 'zod';

/** Immutable authored text with explicit, non-executable substitution. */
export class PromptCatalog {
  readonly values: Readonly<Record<string, string>>;
  constructor(input: unknown = defaults, required: Readonly<Record<string, string>> = defaults) {
    const values = z.record(z.string(), z.string().min(1)).parse(input);
    for (const [key, template] of Object.entries(required)) {
      const value = values[key];
      // This additive protocol is absent in historical snapshots; never inject it into them.
      if (
        !value &&
        [
          'generation.context.v1',
          'reference.coverage.v1',
          'review.composition.v1',
          'review.environment.v1',
          'generation.appearance.v1',
          'review.mandatoryViolations.v1',
          'correction.mandatory.v1',
          'review.grid.v1',
          'correction.grid.v1',
        ].includes(key) &&
        input !== defaults
      )
        continue;
      if (!value) throw new Error(`Missing prompt template: ${key}`);
      const slots = (text: string) => [...new Set(text.match(/\{\{\w+\}\}/g) ?? [])].sort().join(',');
      // Archived Codex prompts retain their former quality-intent placeholder verbatim.
      const historicalQuality = key === 'CodexProvider.image' && slots(value) === '{{prompt}},{{quality}}';
      if (slots(value) !== slots(template) && !historicalQuality)
        throw new Error(`Invalid prompt placeholders: ${key}`);
    }
    this.values = Object.freeze(values);
  }
  render(key: string, parameters: Record<string, unknown> = {}): string {
    const template = this.values[key];
    if (!template) throw new Error(`Unknown prompt template: ${key}`);
    return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
      if (!Object.hasOwn(parameters, name)) throw new Error(`Missing prompt value: ${key}.${name}`);
      const value = parameters[name];
      if (value === undefined) throw new Error(`Undefined prompt value: ${key}.${name}`);
      return typeof value === 'string' ? value : JSON.stringify(value);
    });
  }
  static render(key: string, parameters: Record<string, unknown> = {}, catalog?: unknown): string {
    return new PromptCatalog(catalog).render(key, parameters);
  }
}
