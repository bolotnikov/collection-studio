import { expect, it } from 'vitest';
import { MaterialVocabulary } from '../src/domain/MaterialVocabulary';

it('uses bilingual catalogue materials without claiming unrelated coverage', () => {
  expect(MaterialVocabulary.matches('polished walnut wood', ['деревянная поверхность'])).toBe(true);
  expect(MaterialVocabulary.matches('gold', ['золотой металл'])).toBe(true);
  expect(MaterialVocabulary.matches('steel', ['кристалл', 'стекло'])).toBe(false);
  expect(MaterialVocabulary.matches('velvet', ['wood'])).toBe(false);
});
