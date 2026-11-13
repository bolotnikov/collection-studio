import { describe, expect, it, vi } from 'vitest';
import { CompositionFixture } from './fixtures/CompositionFixture';
import { SourceCompositionPlanner } from '../src/domain/SourceCompositionPlanner';
import {
  CompositionPlanningContracts,
  type CompositionBlueprint,
  type SemanticConcept,
} from '../src/shared/CompositionPlanningContracts';
import { CompositionPlanCompiler } from '../src/domain/CompositionPlanCompiler';
import { SetComposition } from '../src/domain/SetComposition';
import { Contracts, type Profile, type Run } from '../src/shared/Contracts';
import { SetPlanningService } from '../src/application/SetPlanningService';
import type { GenerationPort } from '../src/application/GenerationPort';
import { ProductionRules } from '../src/domain/ProductionRules';
import { PromptBuilder } from '../src/application/PromptBuilder';

function setup() {
  const f = CompositionFixture.create();
  const concept: SemanticConcept = {
    title: 'New theme',
    concept: 'A connected story of ten complementary subjects',
    candidates: f.catalog.cards.map((card, index) => ({
      id: `subject-${index}`,
      subject: `New subject ${index}`,
      role: `Distinct story function ${index}`,
      materials: ['wood', 'metal'],
      silhouette: 'Recognizable rounded form',
      compatibleCategories: [card.observation.category],
      characterCount: card.observation.facets.characterCount,
    })),
  };
  const profile: Profile = Contracts.profile.parse({
    id: 'fixture',
    name: 'Fixture style',
    rules: ['Canonical painted style unchanged.'],
    categories: {
      '1': 'Floating',
      '2': 'Simple plane',
      '3': 'Material surface',
      '4': 'Environment',
      '5': 'Narrative scene',
    },
    references: [],
    visualCatalog: f.catalog,
    compositionPlanning: { ...CompositionPlanningContracts.defaults, version: 'source-prototype-v1' },
  });
  const details = (blueprints: CompositionBlueprint[]) => ({
    variants: blueprints.map((blueprint, variantIndex) => ({
      variantIndex,
      paletteRhythm: 'Vary colors with complementary accents',
      cards: blueprint.slots.map((slot) => ({
        index: slot.index,
        description: `An explicitly described ${slot.subject.subject}`,
        paletteRole: 'Contrast subject and background',
        composition: 'The assigned subject within the exact fixed slot requirements',
      })),
    })),
  });
  return {
    ...f,
    concept,
    profile,
    details,
    planner: new SourceCompositionPlanner(CompositionPlanningContracts.defaults),
  };
}

describe('source-prototype composition planning', () => {
  it('preserves the joint source sequence, assigns unique compatible subjects, and is reproducible', () => {
    const { planner, concept, catalog, profile, details } = setup();
    const input = structuredClone({ concept, catalog });
    const result = planner.select([concept], catalog, false);
    expect(
      planner.select(
        [concept],
        { ...catalog, cards: [...catalog.cards].reverse(), sets: [...catalog.sets].reverse() },
        false,
      ),
    ).toEqual(result);
    expect({ concept, catalog }).toEqual(input);
    expect(result[0]?.composition.targets.map((slot) => slot.category)).toEqual(
      catalog.cards.map((card) => card.observation.category),
    );
    expect(new Set(result[0]?.slots.map((slot) => slot.subject.id)).size).toBe(10);
    const plan = CompositionPlanCompiler.compile(result, details(result), profile);
    expect(() => SetComposition.validate(plan, catalog)).not.toThrow();
    expect(() => ProductionRules.validatePlan(plan, 1, false)).not.toThrow();
    expect(plan.variants[0]?.artContract?.rendering).toBe(profile.rules.join('\n'));
    expect(plan.variants[0]?.artContract?.categoryAllocation).toEqual({
      '1': 2,
      '2': 2,
      '3': 4,
      '4': 2,
      '5': 0,
    });
  });

  it('finds a global matching when a greedy first-slot assignment would fail', () => {
    const { planner, concept, catalog } = setup();
    const first = concept.candidates[0],
      second = concept.candidates[2];
    if (!first || !second) throw new Error('Fixture');
    first.compatibleCategories = ['2', '1'];
    second.compatibleCategories = ['1'];
    const result = planner.select([concept], catalog, false)[0];
    expect(
      result?.slots
        .filter((slot) => slot.target.category === '2')
        .some((slot) => slot.subject.id === first.id),
    ).toBe(true);
  });

  it('uses a reserve subject instead of assigning an incompatible primary candidate', () => {
    const { planner, concept, catalog } = setup();
    const original = concept.candidates[0];
    if (!original) throw new Error('Fixture');
    concept.candidates.push({ ...original, id: 'reserve', subject: 'Reserve object' });
    original.compatibleCategories = ['4'];
    expect(
      planner.select([concept], catalog, false)[0]?.slots.some((slot) => slot.subject.id === 'reserve'),
    ).toBe(true);
  });

  it('records limited same-category/backdrop adaptations instead of inventing reference coverage', () => {
    const { planner, concept, catalog } = setup();
    const card = catalog.cards[0];
    if (!card) throw new Error('Fixture');
    card.observation.facets.pattern = 'circles';
    // Keep two distinct original stripes references available, without changing source membership.
    const peer = catalog.cards[1];
    if (!peer) throw new Error('Fixture');
    catalog.cards.push({ ...structuredClone(peer), id: 'extra', sha256: 'e'.repeat(64) });
    const result = planner.select([concept], catalog, false)[0];
    expect(result?.slots[0]?.adaptedFacets).toEqual(['pattern']);
    expect(result?.slots[0]?.sourceRequired.pattern).toBe('circles');
    expect(result?.slots[0]?.target.required.pattern).toBe('stripes');
    const strict = new SourceCompositionPlanner({
      ...CompositionPlanningContracts.defaults,
      policy: { ...CompositionPlanningContracts.defaults.policy, maxAdaptedSlots: 0 },
    });
    expect(strict.prototypes(catalog, false)).toHaveLength(0);
  });

  it('does not replace contextual backgrounds with plain backgrounds to fill a coverage gap', () => {
    const { planner, catalog } = setup();
    const card = catalog.cards[0];
    if (!card) throw new Error('Fixture');
    card.observation.facets.backdrop = 'plain';
    card.observation.facets.pattern = 'none';
    expect(planner.prototypes(catalog, false)).toHaveLength(0);
  });

  it('does not count duplicate pixels or supplemental art as independent original references', () => {
    const { catalog } = setup();
    const allowed = catalog.cards.slice(1).map((card) => card.id);
    expect(
      new SourceCompositionPlanner(CompositionPlanningContracts.defaults, allowed).prototypes(catalog, false),
    ).toHaveLength(0);
    const first = catalog.cards[0],
      second = catalog.cards[1];
    if (!first || !second) throw new Error('Fixture');
    second.sha256 = first.sha256;
    expect(
      new SourceCompositionPlanner(CompositionPlanningContracts.defaults).prototypes(catalog, false),
    ).toHaveLength(0);
  });

  it('rejects incomplete sets, impossible gold mode, duplicate subjects and incompatible proposals', () => {
    const { planner, catalog, concept } = setup();
    expect(planner.prototypes(catalog, true)).toHaveLength(0);
    const incompatible = structuredClone(concept);
    incompatible.candidates.forEach((candidate) => {
      candidate.compatibleCategories = ['1'];
    });
    expect(() => planner.select([incompatible], catalog, false)).toThrow('No compatible');
    const duplicate = concept.candidates[0];
    if (!duplicate) throw new Error('Fixture');
    concept.candidates[1] = duplicate;
    expect(() => planner.select([concept], catalog, false)).toThrow('distinct');
    catalog.cards.pop();
    expect(planner.prototypes(catalog, false)).toHaveLength(0);
  });

  it('rejects narrative reinterpretation of ordinary objects', () => {
    const { planner, concept, catalog } = setup();
    const first = concept.candidates[0];
    if (!first) throw new Error('Fixture');
    first.compatibleCategories = ['1', '5'];
    expect(() => planner.select([concept], catalog, false)).toThrow('Narrative candidates');
  });

  it('cannot let descriptive output overwrite subjects, categories or rendering', () => {
    const { planner, catalog, concept, profile, details } = setup();
    const layouts = planner.select([concept], catalog, false);
    const raw = details(layouts);
    const parsed = CompositionPlanningContracts.details.parse({
      ...raw,
      rendering: 'Photorealistic',
      variants: raw.variants.map((variant) => ({
        ...variant,
        categoryAllocation: { '1': 10 },
        cards: variant.cards.map((card) => ({ ...card, category: '5', subject: 'Replaced' })),
      })),
    });
    const plan = CompositionPlanCompiler.compile(layouts, parsed, profile);
    expect(plan.variants[0]?.cards[0]?.subject).toBe('New subject 0');
    expect(plan.variants[0]?.cards[0]?.category).toBe('1');
    expect(plan.variants[0]?.artContract?.rendering).toBe('Canonical painted style unchanged.');
    const slot = parsed.variants[0]?.cards[0];
    if (!slot) throw new Error('Fixture');
    slot.index = 1;
    expect(() => CompositionPlanCompiler.compile(layouts, parsed, profile)).toThrow('exactly once');
  });

  it('detects undocumented drift from the source sequence', () => {
    const { planner, catalog, concept, profile, details } = setup();
    const layouts = planner.select([concept], catalog, false);
    const plan = CompositionPlanCompiler.compile(layouts, details(layouts), profile);
    const target = plan.variants[0]?.artContract?.composition?.targets[0];
    if (!target) throw new Error('Fixture');
    target.required.pattern = 'rays';
    expect(() => SetComposition.validate(plan, catalog)).toThrow('undocumented');
  });

  it('tracks pattern and context counts from selected accepted versions without counting failed attempts', () => {
    const { variant } = setup();
    const state = SetComposition.snapshot(variant);
    expect(state.targetFacetCounts.pattern).toEqual({ stripes: 6, none: 4 });
    expect(state.remainingFacetCounts).toEqual(state.targetFacetCounts);
    expect(state.acceptedFacetCounts.pattern).toEqual({});
  });
});

it('resumes the descriptive phase after a transport outage without regenerating concepts or assignments', async () => {
  const { concept, profile, details } = setup();
  const proposeSubjects = vi.fn(async () => ({ variants: [concept] }));
  let outage = true;
  const describeComposition = vi.fn(async (_brief, _profile, blueprints) => {
    if (outage) throw new Error('Temporary transport outage');
    return details(blueprints);
  }) satisfies GenerationPort['describeComposition'];
  const reviewPlan = vi.fn(async () => ({
    passed: true,
    thematicCohesion: 5,
    visualDiversity: 5,
    styleFaithfulness: 5,
    categoryAllocationValid: true,
    producerRequirementsMet: true,
    findings: [],
    correction: '',
  }));
  const unexpected = async (): Promise<never> => {
    throw new Error('Unexpected legacy/image call');
  };
  const provider: GenerationPort = {
    designSlotSet: unexpected,
    proposeSubjects,
    describeComposition,
    reviewPlan,
    plan: unexpected,
    image: unexpected,
    review: unexpected,
    reviewSet: unexpected,
  };
  const history: NonNullable<Run['planHistory']> = [];
  const state: Pick<Run, 'compositionDraft'> = {};
  const checkpoint = vi.fn(async () => {});
  const service = new SetPlanningService();
  const brief = Contracts.brief.parse({
    theme: 'A theme',
    wishes: '',
    variants: 1,
    quality: 'low',
    maxImageCalls: 10,
    autoRepair: false,
  });
  const policy = { maxPlanRepairs: 1, minimumPlanScore: 4, productionConcurrency: 2 };
  await expect(
    service.plan(provider, brief, profile, [], policy, history, checkpoint, () => false, state),
  ).rejects.toThrow('transport');
  const frozen = structuredClone(state.compositionDraft?.blueprints);
  expect(checkpoint).toHaveBeenCalledWith('Choosing the set concept and subjects');
  expect(checkpoint).toHaveBeenCalledWith('Describing the assigned card slots');
  outage = false;
  const persisted = {
    compositionDraft: CompositionPlanningContracts.draft.parse(
      JSON.parse(JSON.stringify(state.compositionDraft)),
    ),
  };
  const result = await service.plan(
    provider,
    brief,
    profile,
    [],
    policy,
    history,
    checkpoint,
    () => false,
    persisted,
  );
  expect(result?.plan.variants).toHaveLength(1);
  expect(proposeSubjects).toHaveBeenCalledTimes(1);
  expect(describeComposition).toHaveBeenCalledTimes(2);
  expect(reviewPlan).toHaveBeenCalledTimes(1);
  expect(persisted.compositionDraft.blueprints).toEqual(frozen);
  expect(history).toHaveLength(1);
});

it('keeps category-5 evidence for a narrative card while excluding unrelated category examples', () => {
  const { profile } = setup();
  profile.requirements = [];
  profile.knowledgeContext = {
    version: 1,
    stage: 'card',
    model: 'test',
    documents: [],
    guidance: 'Test evidence',
    createdAt: 'test',
    images: ['1', '5'].map((category) => ({
      id: `example-${category}`,
      filename: `${category}.png`,
      sha256: 'a'.repeat(64),
      role: 'category-example' as const,
      category: category === '1' ? ('1' as const) : ('5' as const),
      title: `Category ${category}`,
      source: 'test',
      width: 100,
      height: 100,
      reason: 'Composition authority',
      attached: true,
      analysis: {
        summary: `Evidence category ${category}`,
        theme: '',
        semanticPrinciples: [],
        visualPrinciples: [],
        objectRoles: [],
        avoidTransferring: [],
        ordinarySetExample: false,
      },
    })),
  };
  const prompt = PromptBuilder.sourceContext(profile, '5');
  expect(prompt).toContain('Evidence category 5');
  expect(prompt).not.toContain('Evidence category 1');
});

it('keeps the number of narrative actors fixed during compatible-slot assignment', () => {
  const { planner, catalog, concept } = setup();
  for (const index of [6, 7]) {
    const reference = catalog.cards[index],
      candidate = concept.candidates[index];
    if (!reference || !candidate) throw new Error('Fixture');
    reference.observation.category = '5';
    reference.observation.facets = {
      ...reference.observation.facets,
      support: 'environment',
      backdrop: 'environment',
      pattern: 'none',
      characterCount: 1,
    };
    candidate.compatibleCategories = ['5'];
    candidate.characterCount = 2;
  }
  expect(planner.prototypes(catalog, true)).toHaveLength(1);
  expect(() => planner.select([concept], catalog, true)).toThrow('No compatible');
  for (const candidate of concept.candidates)
    if (candidate.compatibleCategories.includes('5')) candidate.characterCount = 1;
  expect(
    planner.select([concept], catalog, true)[0]?.slots.filter((slot) => slot.target.category === '5'),
  ).toHaveLength(2);
});

it('uses a supported retrieved prototype instead of hardcoding a single category ratio', () => {
  const { planner, catalog, concept } = setup();
  const source = catalog.sets[0];
  if (!source) throw new Error('Fixture');
  const alternative = { ...structuredClone(source), id: 'preferred-source' };
  // Another real joint layout has two more environmental slots, not independent average quotas.
  for (const [index, referenceIndex] of [
    [6, 8],
    [7, 9],
  ]) {
    if (index === undefined || referenceIndex === undefined) throw new Error('Fixture');
    const sourceCard = catalog.cards[referenceIndex];
    const subject = concept.candidates[index];
    if (!sourceCard || !subject) throw new Error('Fixture');
    const extra = {
      ...structuredClone(sourceCard),
      id: `additional-${index}`,
      sha256: String(index + 20).padStart(64, '0'),
    };
    catalog.cards.push(extra);
    alternative.cards[index] = { slot: index + 1, id: extra.id, sha256: extra.sha256 };
    subject.compatibleCategories = ['4', '3'];
  }
  catalog.sets.push(alternative);
  const chosen = planner.select([concept], catalog, false, ['preferred-source'])[0];
  expect(chosen?.composition.sourceSetIds).toEqual(['preferred-source']);
  expect(chosen?.composition.targets.filter((target) => target.category === '4')).toHaveLength(4);
  expect(
    planner
      .select([concept], { ...catalog, sets: [source] }, false)[0]
      ?.composition.targets.filter((target) => target.category === '4'),
  ).toHaveLength(2);
  expect(chosen?.slots.map((slot) => slot.sourceCardId)).toEqual(alternative.cards.map((card) => card.id));
});
