import fs from 'node:fs/promises';
import { AggregateCompositionPlanner } from '../src/domain/AggregateCompositionPlanner';
import {
  CompositionPlanningContracts,
  type SemanticConcept,
} from '../src/shared/CompositionPlanningContracts';
import { VisualCatalogContracts } from '../src/shared/VisualCatalogContracts';
import { CompositionPlanCompiler } from '../src/domain/CompositionPlanCompiler';
import { SetComposition } from '../src/domain/SetComposition';
import { ProductionRules } from '../src/domain/ProductionRules';
import { Contracts } from '../src/shared/Contracts';
import canonical from '../resources/canonical-style-rules.json';
import { GenerationContentPolicy } from '../src/application/GenerationContentPolicy';
const catalog = VisualCatalogContracts.catalog.parse(
  JSON.parse(await fs.readFile('resources/knowledge/visual-catalog.json', 'utf8')),
);
const weights = CompositionPlanningContracts.defaults.aggregation;
if (!weights) throw new Error('Missing policy');
for (const gold of [false, true]) {
  const planner = new AggregateCompositionPlanner(weights);
  const concept: SemanticConcept = {
    title: 'Offline aggregate audit',
    concept: 'Synthetic semantic identities for deterministic corpus planning, no model calls',
    candidates: Array.from({ length: 14 }, (_, index) => ({
      id: `new-${index}`,
      subject: `Synthetic subject ${index}`,
      role: `Distinct purpose ${index}`,
      materials: ['wood', 'metal'],
      silhouette: 'Recognizable shape',
      compatibleCategories: gold && index >= 10 ? ['5'] : ['1', '2', '3', '4'],
      characterCount: gold && index >= 10 ? (index % 2) + 1 : 0,
    })),
  };
  const blueprints = planner.select([concept], catalog, gold);
  const profile = GenerationContentPolicy.apply(
    Contracts.profile.parse({
      id: 'audit',
      name: 'Audit',
      rules: canonical.rendering,
      categories: canonical.categories,
      references: [],
      visualCatalog: catalog,
      compositionPlanning: CompositionPlanningContracts.defaults,
    }),
    undefined,
    gold,
  ).profile;
  const plan = CompositionPlanCompiler.compile(
    blueprints,
    {
      variants: blueprints.map((b, variantIndex) => ({
        variantIndex,
        paletteRhythm: 'Varied complementary colors',
        cards: b.slots.map((s) => ({
          index: s.index,
          description: 'Synthetic object description for offline verification',
          paletteRole: 'Contrasting palette',
          composition: 'Preserve all assigned facets',
        })),
      })),
    },
    profile,
  );
  ProductionRules.validatePlan(plan, 1, gold);
  SetComposition.validate(plan, catalog);
  console.log(
    JSON.stringify({
      gold,
      sourceSets: blueprints[0]?.composition.sourceSetIds.length,
      contributingSets: blueprints[0]?.composition.aggregate?.contributingSetCount,
      allocation: plan.variants[0]?.artContract?.categoryAllocation,
      backgrounds: blueprints[0]?.composition.targets.map((t) => t.required.backdrop),
      chosenPrototype: blueprints[0]?.composition.selection ?? null,
    }),
  );
}
