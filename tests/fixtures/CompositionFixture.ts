import { VisualCatalogContracts } from '../../src/shared/VisualCatalogContracts';
import { Contracts } from '../../src/shared/Contracts';

export class CompositionFixture {
  static create() {
    const categories = ['1', '1', '2', '2', '3', '3', '3', '3', '4', '4'] as const;
    const cards = categories.map((category, index) => ({
      id: `reference-${index}`,
      filename: `${index}.png`,
      sha256: String(index).padStart(64, '0'),
      observation: {
        category,
        subject: `Reference object ${index}`,
        confidence: 0.95,
        categoryRationale: 'Verified category exemplar comparison',
        exemplarIds: [`example-${category}`],
        alternatives: [],
        uncertainties: [],
        facets: {
          support: category === '1' ? 'none' : category === '2' ? 'simple-plane' : 'material-surface',
          backdrop: category === '4' ? 'environment' : index === 6 || index === 7 ? 'plain' : 'pattern',
          pattern: category === '4' || index === 6 || index === 7 ? 'none' : 'stripes',
          depth: category === '1' ? 'flat' : 'spatial',
          contextDensity: category === '4' ? 'contextual' : 'minimal',
          camera: 'three-quarter',
          subjectScale: 'large',
          characterCount: 0,
          palette: ['blue', 'orange'],
          materials: ['wood'],
          silhouette: 'rounded',
          rendering: 'Broad painted volumes',
          lighting: 'Soft directional light',
        },
      },
    }));
    const catalog = VisualCatalogContracts.catalog.parse({
      version: 'visual-catalog-v1',
      model: 'fixture',
      dependencyHash: 'a'.repeat(64),
      createdAt: 'fixture',
      documents: [],
      images: [],
      categoryExamples: [],
      categoryProfiles: ['1', '2', '3', '4', '5'].map((category) => ({
        id: `example-${category}`,
        category,
        permittedVariations: ['Example'],
        cautions: [],
      })),
      cards,
      sets: [
        {
          id: 'source-set',
          sourceSha256: 'b'.repeat(64),
          cleanSha256: 'c'.repeat(64),
          cards: cards.map((card, index) => ({ slot: index + 1, id: card.id, sha256: card.sha256 })),
          analysis: {
            theme: 'Fixtures',
            story: 'A coherent fixture story',
            paletteRhythm: 'Complementary saturated colors',
            backgroundRhythm: 'Patterned and contextual rhythm',
            scaleAndCameraRhythm: 'Large readable forms',
            semanticRoles: cards.map((card) => card.observation.subject),
            cautions: [],
          },
        },
      ],
    });
    const plan = Contracts.productionPlan.parse({
      variants: [
        {
          title: 'Fixture set',
          concept: 'One coherent fixture collection',
          artContract: {
            version: 'set-contract-v1',
            story: 'One coherent fixture story',
            categoryAllocation: { '1': 2, '2': 2, '3': 4, '4': 2 },
            rendering: 'Broad painted rounded volumes',
            lighting: 'Soft directional light',
            materialTreatment: 'Simplified readable materials',
            paletteRhythm: 'Complementary saturated colors',
            compositionRhythm: 'Patterned and contextual rhythm',
            avoid: ['Photographic texture'],
            composition: {
              version: 'set-composition-v1',
              catalogDependencyHash: catalog.dependencyHash,
              sourceSetIds: ['source-set'],
              rationale: 'Follow relevant source rhythm',
              targets: catalog.cards.map((card, index) => ({
                index,
                category: card.observation.category,
                required: {
                  support: card.observation.facets.support,
                  backdrop: card.observation.facets.backdrop,
                  pattern: card.observation.facets.pattern,
                  depth: card.observation.facets.depth,
                },
                preferred: {},
              })),
            },
          },
          cards: catalog.cards.map((card, index) => ({
            subject: `Subject ${index}`,
            description: 'One clearly recognizable fixture object',
            category: card.observation.category,
            role: 'Coherent story role',
            visual: {
              materials: ['wood'],
              silhouette: 'rounded form',
              paletteRole: 'blue and orange contrast',
              composition: 'Matches planned support and background',
            },
          })),
        },
      ],
    });
    const proposal = plan.variants[0];
    if (!proposal) throw new Error('Missing fixture variant');
    const variant = Contracts.variant.parse({
      ...proposal,
      id: 'variant',
      review: null,
      reviewError: null,
      cards: proposal.cards.map((card, index) => ({
        ...card,
        id: `card-${index}`,
        status: 'pending',
        locked: false,
        attempts: [],
        selectedAttemptId: null,
        error: null,
      })),
    });
    return { catalog, plan, variant };
  }
}
