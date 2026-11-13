import { expect, it } from 'vitest';
import { SubjectAssignment } from '../src/domain/SubjectAssignment';
import {
  CompositionPlanningContracts,
  type SemanticConcept,
} from '../src/shared/CompositionPlanningContracts';
import type { CompositionTarget } from '../src/shared/CompositionContract';

it('assigns grounded vehicles and hanging props by their physical support rather than category alone', () => {
  const concept: SemanticConcept = {
    title: 'Detective story',
    concept: 'A parked getaway car and a hanging detective coat',
    candidates: [
      {
        id: 'car',
        subject: 'Parked coupe',
        role: 'Getaway vehicle',
        materials: ['metal'],
        silhouette: 'Long low body',
        compatibleCategories: ['4'],
        compatibleComposition: {
          support: ['environment'],
          backdrop: ['environment'],
          pattern: ['none'],
          depth: ['spatial'],
          contextDensity: ['minimal', 'contextual'],
        },
        characterCount: 0,
      },
      {
        id: 'coat',
        subject: 'Coat hanging from a hook',
        role: 'Detective wardrobe',
        materials: ['fabric'],
        silhouette: 'Broad shoulders',
        compatibleCategories: ['4'],
        compatibleComposition: {
          support: ['none', 'environment'],
          backdrop: ['environment'],
          pattern: ['none'],
          depth: ['spatial'],
          contextDensity: ['minimal', 'contextual'],
        },
        characterCount: 0,
      },
    ],
  };
  const targets: CompositionTarget[] = [
    { index: 0, category: '4', required: { support: 'none', characterCount: 0 }, preferred: {} },
    { index: 1, category: '4', required: { support: 'environment', characterCount: 0 }, preferred: {} },
  ];
  expect(SubjectAssignment.solve(concept, targets)?.indices).toEqual([1, 0]);
  const vehicle = concept.candidates[0],
    unsupported = targets[0];
  if (!vehicle || !unsupported) throw new Error('Missing fixture');
  expect(SubjectAssignment.compatible(vehicle, unsupported)).toBe(false);
  concept.candidates.splice(1);
  expect(SubjectAssignment.solve(concept, targets)).toBeUndefined();
});
it('requires explicit support compatibility in new provider output while continuing to read historical proposals', () => {
  const proposal = {
    variants: [
      {
        title: 'A coherent collection',
        concept: 'Ten complementary objects in one story',
        candidates: Array.from({ length: 10 }, (_, index) => ({
          id: String(index),
          subject: 'Object ' + index,
          role: 'Distinct story role',
          materials: ['wood'],
          silhouette: 'Rounded form',
          compatibleCategories: ['1'],
          characterCount: 0,
        })),
      },
    ],
  };
  expect(CompositionPlanningContracts.concepts.safeParse(proposal).success).toBe(true);
  expect(CompositionPlanningContracts.conceptProposal.safeParse(proposal).success).toBe(false);
  const current = {
    variants: proposal.variants.map((variant) => ({
      ...variant,
      candidates: variant.candidates.map((candidate) => ({
        ...candidate,
        compatibleComposition: {
          support: ['none'],
          backdrop: ['pattern'],
          pattern: ['stripes'],
          depth: ['flat'],
          contextDensity: ['none'],
        },
      })),
    })),
  };
  expect(CompositionPlanningContracts.conceptProposal.safeParse(current).success).toBe(true);
});

it('enforces general joint composition compatibility for background, pattern, depth and context', () => {
  const candidate = CompositionPlanningContracts.subject.parse({
    id: 'prop',
    subject: 'Contextual prop',
    role: 'Story role',
    materials: ['wood'],
    silhouette: 'Simple form',
    compatibleCategories: ['4'],
    characterCount: 0,
    compatibleComposition: {
      support: ['environment'],
      backdrop: ['environment'],
      pattern: ['none'],
      depth: ['spatial'],
      contextDensity: ['contextual'],
    },
  });
  const target: CompositionTarget = {
    index: 0,
    category: '4',
    required: {
      support: 'environment',
      backdrop: 'environment',
      pattern: 'none',
      depth: 'spatial',
      contextDensity: 'contextual',
      characterCount: 0,
    },
    preferred: {},
  };
  expect(SubjectAssignment.compatible(candidate, target)).toBe(true);
  for (const required of [
    { backdrop: 'plain' },
    { pattern: 'rays' },
    { depth: 'flat' },
    { contextDensity: 'none' },
  ] as const) {
    expect(
      SubjectAssignment.compatible(candidate, { ...target, required: { ...target.required, ...required } }),
    ).toBe(false);
  }
});
