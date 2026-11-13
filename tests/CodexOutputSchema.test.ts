import { CompositionPlanningContracts } from '../src/shared/CompositionPlanningContracts';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import { CodexOutputSchema } from '../src/infrastructure/CodexOutputSchema';
import { Contracts } from '../src/shared/Contracts';
import { SetContract } from '../src/shared/SetContract';
import { CompositionContract } from '../src/shared/CompositionContract';
import { VisualCatalogContracts } from '../src/shared/VisualCatalogContracts';
import { CompositionFixture } from './fixtures/CompositionFixture';

it.each([
  CompositionPlanningContracts.concepts,
  CompositionPlanningContracts.details,
  Contracts.productionPlan,
  Contracts.preparedProductionPlan,
  Contracts.review,
  Contracts.compositionReview,
  Contracts.detailedSetReview,
  SetContract.review,
  VisualCatalogContracts.observation,
])('emits a strict-compatible schema for planning, reviews and catalog observations %#', (schema) => {
  const output = new CodexOutputSchema<unknown>(schema);
  // The SDK rejects optional non-nullable properties anywhere in a strict schema.
  expect(() => zodTextFormat(z.fromJSONSchema(output.jsonSchema), 'fixture')).not.toThrow();
});

it('restores a prepared plan with sparse composition constraints and no gold cards', () => {
  const { plan } = CompositionFixture.create();
  const wire = {
    variants: plan.variants.map((variant) => {
      const contract = variant.artContract;
      const composition = contract?.composition;
      if (!contract || !composition) throw new Error('Missing fixture art contract');
      const empty = Object.fromEntries(
        Object.keys(CompositionContract.observed.shape).map((key) => [key, null]),
      );
      return {
        ...variant,
        artContract: {
          ...contract,
          categoryAllocation: { ...contract.categoryAllocation, '5': null },
          composition: {
            ...composition,
            selection: null,
            aggregate: null,
            targets: composition.targets.map((target) => ({
              ...target,
              required: { ...empty, ...target.required },
              preferred: { ...empty, ...target.preferred },
            })),
          },
        },
      };
    }),
  };
  const output = new CodexOutputSchema(Contracts.preparedProductionPlan);
  expect(z.fromJSONSchema(output.jsonSchema).safeParse(wire).success).toBe(true);
  expect(output.parse(wire)).toEqual(plan);
  expect(Contracts.preparedProductionPlan.parse(plan)).toEqual(plan);
});

it('preserves nullable values, zeroes and false while enforcing the original validators', () => {
  const schema = z.object({
    count: z.number().min(0).optional(),
    enabled: z.boolean().optional(),
    optional: z.string().optional(),
    nullable: z.string().nullable().optional(),
    required: z.string().min(3),
    entries: z.array(z.object({ note: z.string().optional() })),
    nested: z.object({ note: z.string().optional() }).nullable(),
  });
  const output = new CodexOutputSchema(schema);
  const wire = {
    count: 0,
    enabled: false,
    optional: null,
    nullable: null,
    required: 'valid',
    entries: [{ note: null }],
    nested: { note: null },
  };
  expect(output.parse(wire)).toEqual({
    count: 0,
    enabled: false,
    nullable: null,
    required: 'valid',
    entries: [{}],
    nested: {},
  });
  expect(output.parse({ ...wire, nested: null }).nested).toBeNull();
  expect(() => output.parse({ ...wire, count: -1 })).toThrow();
  expect(() => output.parse({ ...wire, required: null })).toThrow();
  expect(() => output.parse({ ...wire, required: 'x' })).toThrow();
});
