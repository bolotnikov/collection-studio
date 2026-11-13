import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Contracts } from '../src/shared/Contracts';
import { StyleContracts } from '../src/shared/StyleContracts';
import { ReferencePresentation } from '../src/renderer/src/viewmodels/ReferencePresentation';

it('shows planned candidates and exact per-version generation inputs, including the edit base', () => {
  const references = ['one', 'two', 'three'].map((id) => ({
    id,
    filename: id + '.png',
    title: 'Reference ' + id,
    category: '1' as const,
    source: 'fixture',
    sha256: id,
  }));
  const profile = Contracts.profile.parse({
    id: 'style',
    name: 'Style',
    rules: ['Canonical art rules'],
    categories: { '1': 'Floating', '2': 'Simple', '3': 'Material', '4': 'Environment' },
    references: references.slice(0, 2),
    library: references.map((reference) => StyleContracts.libraryItem.parse(reference)),
  });
  const target = {
    index: 0,
    category: '1' as const,
    required: { support: 'none' as const },
    preferred: {},
    referenceIds: ['three'],
  };
  expect(ReferencePresentation.planned(profile, target).map((reference) => reference.id)).toEqual(['three']);
  expect(ReferencePresentation.candidates(profile, target).map((reference) => reference.id)).toEqual([
    'three',
  ]);
  const makeAttempt = (id: string) =>
    Contracts.attempt.parse({
      id,
      master: id + '-master.png',
      preview: id + '.png',
      prompt: '',
      model: 'fixture',
      createdAt: '',
      elapsedMs: 0,
      requestId: null,
      usage: null,
      review: null,
      reviewError: null,
    });
  const original = makeAttempt('original');
  const revised = {
    ...makeAttempt('revised'),
    generationInputManifest: [
      { image: 1, id: 'three', role: 'original-category' },
      { image: 2, id: 'original', role: 'previous-candidate' },
    ],
  };
  const card = Contracts.card.parse({
    id: 'card',
    subject: 'New prop',
    description: 'A clearly recognizable new prop',
    role: 'Story role',
    category: '1',
    status: 'done',
    selectedAttemptId: 'revised',
    attempts: [original, revised],
    locked: false,
    error: null,
  });
  const run = Contracts.run.parse({
    id: randomUUID(),
    createdAt: '',
    updatedAt: '',
    brief: {
      theme: 'Collection',
      wishes: '',
      quality: 'low',
      variants: 1,
      maxImageCalls: 10,
      autoRepair: true,
    },
    status: 'completed',
    stage: '',
    imageCalls: 2,
    variants: [],
    events: [],
    imageModel: 'fixture',
    textModel: 'fixture',
    selectedVariantId: null,
  });
  const result = ReferencePresentation.used(profile, run, card, revised);
  expect(result.map((reference) => reference.id)).toEqual(['three', 'original']);
  expect(result[0]?.role).toBe('Composition reference');
  expect(result[0]?.src).toContain('three.png');
  expect(result[1]?.src).toContain('original-master.png');
  expect(result[1]?.role).toBe('Previous version (edit base)');
  expect(ReferencePresentation.used(profile, run, card, original)).toEqual([]);
});
