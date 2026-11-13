import { expect, it } from 'vitest';
import { SetComposition } from '../src/domain/SetComposition';
import { StyleContracts } from '../src/shared/StyleContracts';
import { ReferenceRetriever } from '../src/application/style/ReferenceRetriever';
import { CompositionFixture } from './fixtures/CompositionFixture';

it('validates ten source-grounded targets and rejects missing exact reference coverage', () => {
  const f = CompositionFixture.create();
  expect(() => SetComposition.validate(f.plan, f.catalog)).not.toThrow();
  const target = f.plan.variants[0]?.artContract?.composition?.targets[4];
  if (!target) throw new Error('Missing fixture target');
  target.required.pattern = 'rays';
  expect(() => SetComposition.validate(f.plan, f.catalog)).toThrow('coverage gap');
});
it('does not use a semantically closer plain category-3 card as a patterned composition reference', () => {
  const f = CompositionFixture.create();
  const target = f.variant.artContract?.composition?.targets[4];
  if (!target) throw new Error('Missing target');
  const items = f.catalog.cards.map((card) =>
    StyleContracts.libraryItem.parse({
      ...card,
      category: card.observation.category,
      title: card.observation.subject,
      source: 'fixture',
    }),
  );
  const ids = items.filter((item) => SetComposition.reference(item, target)).map((item) => item.id);
  expect(ids).toEqual(['reference-4', 'reference-5']);
  const selected = new ReferenceRetriever().select(
    [...items.slice(6, 8), ...items],
    items.map((item) => item.id),
    4,
    '3',
    ['reference-0', 'reference-1'],
    ids,
  );
  expect(selected.map((item) => item.id)).toEqual([
    'reference-0',
    'reference-1',
    'reference-4',
    'reference-5',
  ]);
  expect(() =>
    new ReferenceRetriever().select(items, [], 4, '3', ['reference-0', 'reference-1'], []),
  ).toThrow('two original');
});
it('derives actual counts from selected accepted attempts and replaces observations on version selection', () => {
  const { variant } = CompositionFixture.create();
  const card = variant.cards[4],
    source = CompositionFixture.create().catalog.cards[4];
  if (!card || !source) throw new Error('Missing fixture');
  const attempt = {
    id: 'first',
    master: 'master.png',
    preview: 'preview.png',
    prompt: 'fixture',
    model: 'fixture',
    createdAt: 'fixture',
    elapsedMs: 0,
    requestId: null,
    usage: null,
    reviewError: null,
    review: {
      passed: true,
      style: 5,
      readability: 5,
      subjectMatch: 5,
      categoryMatch: true,
      findings: [],
      correction: '',
      compositionMatch: true,
      observedComposition: source.observation.facets,
    },
  };
  card.attempts.push(attempt, {
    ...attempt,
    id: 'second',
    review: {
      ...attempt.review,
      observedComposition: { ...source.observation.facets, backdrop: 'plain', pattern: 'none' },
    },
  });
  card.selectedAttemptId = 'first';
  const first = SetComposition.snapshot(variant, new Set([card.id]));
  expect(first.accepted).toBe(1);
  expect(first.actualBackdropCounts).toEqual({ pattern: 1 });
  attempt.review.style = 4;
  expect(SetComposition.snapshot(variant, new Set(), 5).accepted).toBe(0);
  expect(SetComposition.snapshot(variant, new Set(), 4).accepted).toBe(1);
  attempt.review.style = 5;
  card.selectedAttemptId = 'second';
  const second = SetComposition.snapshot(variant);
  expect(second.accepted).toBe(0);
  expect(second.actualBackdropCounts).toEqual({});
  expect(SetComposition.snapshot(CompositionFixture.create().variant).accepted).toBe(0);
});
