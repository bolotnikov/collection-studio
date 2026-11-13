import { GenerationContentPolicy } from '../src/application/GenerationContentPolicy';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Contracts } from '../src/shared/Contracts';
import { VisualCatalogContracts } from '../src/shared/VisualCatalogContracts';
import { CompositionPlanningContracts } from '../src/shared/CompositionPlanningContracts';
import { SourceCompositionPlanner } from '../src/domain/SourceCompositionPlanner';
import { CompositionPlanCompiler } from '../src/domain/CompositionPlanCompiler';
import { ProductionRules } from '../src/domain/ProductionRules';
import { SetComposition } from '../src/domain/SetComposition';
import canonical from '../resources/canonical-style-rules.json';

// Offline feasibility audit only: no provider, model or image-generation calls.
const catalog = VisualCatalogContracts.catalog.parse(
  JSON.parse(await fs.readFile('resources/knowledge/visual-catalog.json', 'utf8')),
);
const configuration = CompositionPlanningContracts.defaults;
const planner = new SourceCompositionPlanner(configuration);
const modes = [false, true].map((includeGold) => {
  const prototypes = planner.prototypes(catalog, includeGold);
  if (!prototypes.length) throw new Error(`No supported source layouts: includeGold=${includeGold}`);
  const checked = prototypes.map(({ set, slots }) => {
    const candidates = slots.map((slot) => {
      const source = catalog.cards.find((card) => card.id === slot.sourceCardId);
      if (!source) throw new Error('Missing source card.');
      return {
        id: source.id,
        subject: `Synthetic subject ${slot.index}`,
        role: `Independent semantic role ${slot.index}`,
        compatibleCategories: [slot.target.category],
        characterCount: slot.target.required.characterCount ?? 0,
        materials: source.observation.facets.materials,
        silhouette: source.observation.facets.silhouette,
      };
    });
    const blueprints = planner.select(
      [
        {
          title: 'Offline layout audit',
          concept: 'Synthetic subjects testing a source layout without generating images',
          candidates,
        },
      ],
      { ...catalog, sets: [set] },
      includeGold,
    );
    const profile = Contracts.profile.parse({
      id: 'audit',
      name: 'Offline audit',
      rules: canonical.rendering,
      categories: canonical.categories,
      references: [],
      visualCatalog: catalog,
      compositionPlanning: configuration,
    });
    const plan = CompositionPlanCompiler.compile(
      blueprints,
      {
        variants: [
          {
            variantIndex: 0,
            paletteRhythm: 'Synthetic descriptor for offline contract verification',
            cards: slots.map((slot) => ({
              index: slot.index,
              description: 'Synthetic description; no generated artwork',
              paletteRole: 'Synthetic contrast',
              composition: 'Follow the assigned hard facets',
            })),
          },
        ],
      },
      GenerationContentPolicy.apply(profile, undefined, includeGold).profile,
    );
    ProductionRules.validatePlan(plan, 1, includeGold);
    SetComposition.validate(plan, catalog);
    return {
      sourceSetId: set.id,
      theme: set.analysis.theme,
      categoryCounts: plan.variants[0]?.artContract?.categoryAllocation,
      backdropCounts: Object.fromEntries(
        ['plain', 'gradient', 'pattern', 'surface-continuation', 'environment'].map((key) => [
          key,
          slots.filter((slot) => slot.target.required.backdrop === key).length,
        ]),
      ),
      adaptations: slots
        .filter((slot) => slot.adaptedFacets.length)
        .map(({ index, sourceRequired, target, adaptedFacets }) => ({
          index,
          sourceRequired,
          required: target.required,
          adaptedFacets,
        })),
    };
  });
  return { includeGold, eligiblePrototypes: checked.length, checked };
});
const result = {
  protocol: configuration.version,
  catalogDependencyHash: catalog.dependencyHash,
  configuration,
  sourceCards: catalog.cards.length,
  sourceSets: catalog.sets.length,
  modelCalls: 0,
  imageCalls: 0,
  modes,
};
const output = path.resolve('output/catalog/composition-feasibility.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      output,
      sourceCards: result.sourceCards,
      sourceSets: result.sourceSets,
      modelCalls: 0,
      imageCalls: 0,
      modes: modes.map(({ includeGold, eligiblePrototypes }) => ({ includeGold, eligiblePrototypes })),
    },
    null,
    2,
  ),
);
