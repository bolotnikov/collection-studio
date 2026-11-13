import { expect, it } from 'vitest';
import { Contracts } from '../src/shared/Contracts';
import { SlotTagContracts } from '../src/shared/SlotTagContracts';
import { StyleContracts } from '../src/shared/StyleContracts';
import { RunEdits } from '../src/domain/RunEdits';
import { SetComposition } from '../src/domain/SetComposition';
import { ProductionRules } from '../src/domain/ProductionRules';
import { SlotTagRules } from '../src/domain/SlotTagRules';
import { CompositionRepairRules } from '../src/domain/CompositionRepairRules';
import { CompositionFixture } from './fixtures/CompositionFixture';
import { GenerationRequestBuilder } from '../src/application/GenerationRequestBuilder';

function fixture() {
  const { variant, catalog } = CompositionFixture.create();
  const card = variant.cards[8];
  const target = variant.artContract?.composition?.targets[8];
  if (!card || !target) throw new Error('Missing fixture slot');
  target.appearance = { backgroundColor: 'green', subjectScale: 'large' };
  target.referenceIds = ['reference-9', 'reference-8'];
  target.selectedReferenceIds = ['reference-9', 'reference-8'];
  target.preferred = { backgroundColor: 'green', camera: 'front' };
  variant.planSignature = ProductionRules.signature(variant);
  const library = catalog.cards.map((item) =>
    StyleContracts.libraryItem.parse({
      ...item,
      title: item.observation.subject,
      category: item.observation.category,
      source: 'fixture',
    }),
  );
  const run = Contracts.run.parse({
    id: '00000000-0000-4000-8000-000000000001',
    createdAt: '',
    updatedAt: '',
    brief: {
      theme: 'Fixture',
      wishes: '',
      variants: 1,
      quality: 'low',
      maxImageCalls: 20,
      autoRepair: false,
    },
    status: 'completed',
    stage: 'Generation complete',
    imageCalls: 10,
    variants: [variant],
    imageModel: 'fixture',
    textModel: 'fixture',
    events: [],
    selectedVariantId: variant.id,
  });
  const savedVariant = run.variants[0],
    savedCard = savedVariant?.cards[8];
  if (!savedVariant || !savedCard) throw new Error('Missing saved fixture slot');
  savedVariant.planSignature = ProductionRules.signature(savedVariant);
  const facets = SlotTagContracts.facets.parse(
    Object.fromEntries(
      Object.entries({ ...target.required, ...target.appearance }).filter(
        ([key]) => key !== 'characterCount',
      ),
    ),
  );
  return { run, variant: savedVariant, card: savedCard, target, facets, library };
}

it('removes and replaces color without mutating the original plan, other slots or request budgets', () => {
  const f = fixture();
  const original = structuredClone(f.variant.artContract);
  const facets = { ...f.facets };
  delete facets.backgroundColor;
  expect(RunEdits.setSlotTags(f.run, f.card.id, { expectedRevision: 0, facets }, f.library)).toBe(true);
  expect(SetComposition.target(f.variant, f.card)?.appearance).toEqual({ subjectScale: 'large' });
  expect(SetComposition.target(f.variant, f.card)?.preferred).toEqual({});
  expect(SetComposition.target(f.variant, f.card)?.selectedReferenceIds).toEqual([
    'reference-9',
    'reference-8',
  ]);
  RunEdits.setSlotTags(
    f.run,
    f.card.id,
    { expectedRevision: 1, facets: { ...facets, backgroundColor: 'blue' } },
    f.library,
  );
  expect(SetComposition.target(f.variant, f.card)?.appearance).toEqual({
    backgroundColor: 'blue',
    subjectScale: 'large',
  });
  expect(f.card.slotTagEdits).toHaveLength(2);
  expect(f.variant.artContract).toEqual(original);
  expect(ProductionRules.planMatches(f.variant)).toBe(true);
  expect(f.run.imageCalls).toBe(10);
  expect(f.run.status).toBe('completed');
  expect(Contracts.run.parse(f.run).variants[0]?.cards[8]?.slotTagEdits).toEqual(f.card.slotTagEdits);
  expect(SetComposition.activeContract(f.variant)?.composition?.targets[8]?.appearance?.backgroundColor).toBe(
    'blue',
  );
});

it('rejects stale edits, locked cards, category changes and unsupported reference requirements atomically', () => {
  const f = fixture();
  expect(() =>
    RunEdits.setSlotTags(f.run, f.card.id, { expectedRevision: 1, facets: f.facets }, f.library),
  ).toThrow('Reopen');
  f.card.locked = true;
  expect(() =>
    RunEdits.setSlotTags(f.run, f.card.id, { expectedRevision: 0, facets: f.facets }, f.library),
  ).toThrow('Unlock');
  f.card.locked = false;
  expect(() =>
    RunEdits.setSlotTags(
      f.run,
      f.card.id,
      { expectedRevision: 0, facets: { ...f.facets, backdrop: 'plain' } },
      f.library,
    ),
  ).toThrow('required by');
  expect(() =>
    RunEdits.setSlotTags(
      f.run,
      f.card.id,
      { expectedRevision: 0, facets: { ...f.facets, camera: 'low' } },
      f.library,
    ),
  ).toThrow('two matching');
  expect(() =>
    SlotTagContracts.edit.parse({ expectedRevision: 0, facets: { ...f.facets, characterCount: 1 } }),
  ).toThrow();
  expect(f.card.slotTagEdits).toBeUndefined();
  expect(f.run.events).toEqual([]);
});

it('preserves old evidence while excluding stale checks and obsolete grid repairs', () => {
  const f = fixture();
  const attempt = Contracts.attempt.parse({
    id: 'old',
    master: 'old.png',
    preview: 'old.png',
    prompt: 'Historical green prompt',
    model: 'fixture',
    createdAt: '',
    elapsedMs: 0,
    requestId: null,
    usage: null,
    review: null,
    reviewError: null,
    compositionCheck: {
      subjectPresent: true,
      completeSilhouette: true,
      compositionDescriptionMatch: false,
      observedCategory: '4',
      observedComposition: {
        support: 'material-surface',
        backdrop: 'environment',
        pattern: 'none',
        depth: 'spatial',
        contextDensity: 'minimal',
        camera: 'front',
        subjectScale: 'large',
        characterCount: 0,
        subjectPosition: 'center',
        backgroundColor: 'blue',
      },
      findings: [],
      confirmedViolations: [{ kind: 'wrong-background', evidence: 'Not green' }],
      matches: false,
    },
  });
  f.card.attempts.push(attempt);
  f.card.selectedAttemptId = attempt.id;
  f.variant.gridRepairRounds = [
    { id: 'round', reviewId: 'old-review', targetCardIds: [f.card.id], startedAt: '' },
  ];
  const snapshot = structuredClone(attempt);
  RunEdits.setSlotTags(
    f.run,
    f.card.id,
    { expectedRevision: 0, facets: { ...f.facets, backgroundColor: 'blue' } },
    f.library,
  );
  expect(f.card.attempts[0]).toEqual(snapshot);
  expect(CompositionRepairRules.violations(f.variant, f.card, attempt)).toEqual([]);
  expect(f.variant.gridRepairRounds[0]?.supersededAt).toBeTruthy();
  expect(SlotTagRules.gridCurrent(f.variant)).toBe(false);
  expect(SlotTagRules.gridCurrent(f.variant, SlotTagRules.gridRevisions(f.variant))).toBe(true);
  expect(SlotTagRules.gridCorrectionAllowed(f.variant, f.card.id, 'color-pattern-rhythm')).toBe(false);
  expect(SlotTagRules.gridCorrectionAllowed(f.variant, f.card.id, 'duplicate-subject')).toBe(true);
});

it('leaves unedited historical targets and checks unchanged', () => {
  const f = fixture();
  expect(SetComposition.target(f.variant, f.card)).toBe(f.variant.artContract?.composition?.targets[8]);
  expect(SlotTagRules.reviewCurrent(f.card)).toBe(true);
  expect(SlotTagRules.gridCurrent(f.variant)).toBe(true);
  expect(RunEdits.setSlotTags(f.run, f.card.id, { expectedRevision: 0, facets: f.facets }, f.library)).toBe(
    false,
  );
  expect(f.card.slotTagEdits).toBeUndefined();
  const profile = Contracts.profile.parse({
    id: 'fixture',
    name: 'Fixture',
    rules: [],
    categories: { '1': 'Float', '2': 'Plane', '3': 'Surface', '4': 'Environment' },
    references: [],
  });
  const input = {
    prompt: 'Original generation instructions',
    profile,
    brief: f.run.brief,
    card: f.card,
    target: f.target,
    references: [],
    instruction: '',
  };
  const builder = new GenerationRequestBuilder();
  expect(builder.build({ ...input, variant: f.variant })).toEqual(builder.build(input));
});
