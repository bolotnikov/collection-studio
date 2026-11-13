import { expect, it } from 'vitest';
import { BatchSubjectRules } from '../src/domain/BatchSubjectRules';
import { Contracts } from '../src/shared/Contracts';
import { CompositionFixture } from './fixtures/CompositionFixture';

function batch() {
  const { plan } = CompositionFixture.create();
  const first = plan.variants[0];
  if (!first) throw new Error('Missing fixture set');
  return Contracts.plan.parse({
    variants: [0, 1].map((variantIndex) => ({
      ...first,
      cards: first.cards.map((card, index) => ({
        ...card,
        subject: `Предмет ${variantIndex} ${index}`,
        subjectType: `object_${variantIndex}_${index}`,
      })),
    })),
  });
}

it('accepts distinct subjects and retains normalized types through persisted plan decoding', () => {
  const plan = batch();
  expect(() => BatchSubjectRules.validate(plan)).not.toThrow();
  expect(Contracts.productionPlan.parse(plan).variants[1]?.cards[0]?.subjectType).toBe('object_1_0');
});

it('rejects synonymous subjects with the same declared type and reports both slot locations', () => {
  const plan = batch();
  const first = plan.variants[0]?.cards[0];
  const second = plan.variants[1]?.cards[3];
  if (!first || !second) throw new Error('Missing fixture subjects');
  first.subject = 'Чайник';
  first.subjectType = 'teapot';
  second.subject = 'Медный заварочный чайник';
  second.subjectType = 'teapot';
  expect(() => BatchSubjectRules.validate(plan)).toThrow(/set 2, slot 4.*teapot.*set 1, slot 1/);
});

it('rejects normalized name collisions even when model-declared types differ', () => {
  const plan = batch();
  const first = plan.variants[0]?.cards[0];
  const second = plan.variants[1]?.cards[0];
  if (!first || !second) throw new Error('Missing fixture subjects');
  first.subject = 'Медный чайник';
  second.subject = '  МЕДНЫЙ\u00a0  ЧАЙНИК  ';
  expect(() => BatchSubjectRules.validate(plan)).toThrow(/repeats subject "медный чайник"/);
});

it('requires types for multi-set validation while retaining single-set and legacy reading', () => {
  const { plan } = CompositionFixture.create();
  expect(() => BatchSubjectRules.validate(plan)).not.toThrow();
  const first = plan.variants[0];
  if (!first) throw new Error('Missing fixture set');
  const historical = Contracts.plan.parse({ variants: [first, structuredClone(first)] });
  expect(historical.variants).toHaveLength(2);
  expect(() => BatchSubjectRules.validate(historical)).toThrow('Missing normalized subjectType');
});
