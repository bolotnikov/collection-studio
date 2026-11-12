import { describe, expect, it } from 'vitest';
import { PromptCatalog } from '../src/application/prompts/PromptCatalog';
import defaults from '../resources/prompts/production.json';
import { PromptBuilder } from '../src/application/PromptBuilder';
import { Contracts } from '../src/shared/Contracts';
import profile from '../resources/style-profile.json';

describe('authored prompt configuration', () => {
  it('rejects incomplete catalogs and incompatible placeholders before execution', () => {
    expect(() => new PromptCatalog({})).toThrow('Missing prompt');
    expect(() => new PromptCatalog({ ...defaults, 'correction.card': 'Fix {{unknown}}' })).toThrow(
      'placeholders',
    );
    const catalog = new PromptCatalog();
    expect(() => catalog.render('correction.card')).toThrow('Missing prompt value');
    expect(() => catalog.render('missing')).toThrow('Unknown prompt');
  });
  it('performs single-pass substitution without evaluating embedded templates or code', () => {
    const instruction = '{{outputPath}} $(not-a-command)';
    expect(new PromptCatalog().render('correction.card', { correction: instruction })).toContain(instruction);
  });
  it('uses the persisted editable catalog for planning and reviewer prompts', () => {
    const catalog = { ...defaults, 'PromptBuilder.reviewRubric': 'Persisted reviewer criteria' };
    const snapshot = Contracts.profile.parse({ ...profile, promptCatalog: catalog });
    expect(PromptBuilder.reviewRubric(snapshot)).toBe('Persisted reviewer criteria');
    expect(PromptBuilder.reviewRubric()).not.toBe('Persisted reviewer criteria');
  });
});
