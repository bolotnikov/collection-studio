import { expect, it } from 'vitest';
import { Contracts } from '../src/shared/Contracts';
import { SetRules } from '../src/domain/SetRules';

function accepted() {
  return Contracts.detailedSetReview.parse({
    passed: true,
    coherence: 5,
    findings: [],
    outlierCardIds: [],
    assessment: {
      styleCompatibility: 5,
      thematicCohesion: 5,
      silhouetteDiversity: 5,
      materialDiversity: 5,
      paletteBalance: 5,
      compositionBalance: 5,
      categoryCoverage: true,
      redundantSubjects: false,
    },
    corrections: [],
  });
}
it('requires every whole-set dimension and refuses legacy averages for strict reviews', () => {
  const good = accepted();
  expect(SetRules.acceptsSetReview(good, 5, true)).toBe(true);
  for (const key of [
    'thematicCohesion',
    'silhouetteDiversity',
    'materialDiversity',
    'paletteBalance',
    'compositionBalance',
  ] as const)
    expect(
      SetRules.acceptsSetReview({ ...good, assessment: { ...good.assessment, [key]: 3 } }, 5, true),
    ).toBe(false);
  expect(
    SetRules.acceptsSetReview(
      { ...good, assessment: { ...good.assessment, styleCompatibility: 4 } },
      5,
      true,
    ),
  ).toBe(false);
  expect(
    SetRules.acceptsSetReview(
      { ...good, assessment: { ...good.assessment, categoryCoverage: false } },
      5,
      true,
    ),
  ).toBe(false);
  expect(
    SetRules.acceptsSetReview(
      { ...good, assessment: { ...good.assessment, redundantSubjects: true } },
      5,
      true,
    ),
  ).toBe(false);
  expect(SetRules.acceptsSetReview(Contracts.setReview.parse(good), 5, true)).toBe(false);
});
it('requires actionable corrections for real outliers and binds approval to selected image versions', () => {
  const variant = Contracts.variant.parse({
    id: 'v',
    title: 'Test',
    concept: 'Coherent set',
    review: null,
    reviewError: null,
    cards: [
      {
        id: 'c',
        subject: 'Object',
        description: 'Fixture description',
        category: '1',
        role: 'Hero',
        status: 'done',
        attempts: [],
        selectedAttemptId: 'version-1',
        locked: false,
        error: null,
      },
    ],
    reviewedAttemptIds: ['version-1'],
  });
  expect(SetRules.reviewMatchesSelection(variant, true)).toBe(true);
  const card = variant.cards[0];
  if (!card) throw new Error('Missing fixture card');
  card.selectedAttemptId = 'version-2';
  expect(SetRules.reviewMatchesSelection(variant, true)).toBe(false);
  const review = { ...accepted(), passed: false, outlierCardIds: ['c'] };
  expect(() => SetRules.validateSetReview(review, variant)).toThrow('targeted correction');
  expect(() =>
    SetRules.validateSetReview(
      { ...review, corrections: [{ cardId: 'c', instruction: 'Simplify the material treatment.' }] },
      variant,
    ),
  ).not.toThrow();
  expect(() => SetRules.validateSetReview({ ...review, outlierCardIds: ['unknown'] }, variant)).toThrow(
    'invalid card IDs',
  );
});
