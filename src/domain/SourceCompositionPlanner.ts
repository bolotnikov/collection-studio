import { SubjectAssignment } from './SubjectAssignment';
import { CatalogPolicy } from '../shared/CatalogPolicy';
import type { CompositionRequirements, CompositionTarget } from '../shared/CompositionContract';
import type {
  CompositionBlueprint,
  CompositionPlanningConfiguration,
  SemanticConcept,
} from '../shared/CompositionPlanningContracts';
import type { CatalogCard, CatalogSet, VisualCatalog } from '../shared/VisualCatalogContracts';
import { SetComposition } from './SetComposition';

/** Historical source-prototype protocol retained solely for frozen profiles and resumable old runs. */
export class SourceCompositionPlanner {
  constructor(
    private readonly config: CompositionPlanningConfiguration,
    private readonly originalIds?: readonly string[],
  ) {}

  prototypes(catalog: VisualCatalog, includeGold: boolean) {
    return [...catalog.sets]
      .sort((a, b) => a.id.localeCompare(b.id))
      .flatMap((set) => {
        if (
          !set.cleanSha256 ||
          new Set(set.cards.map((member) => member.slot)).size !== 10 ||
          new Set(set.cards.map((member) => member.id)).size !== 10 ||
          new Set(set.cards.map((member) => member.sha256)).size !== 10
        )
          return [];
        const slots: Omit<CompositionBlueprint['slots'][number], 'subject'>[] = [];
        for (const member of [...set.cards].sort((a, b) => a.slot - b.slot)) {
          const source = catalog.cards.find((card) => card.id === member.id && card.sha256 === member.sha256);
          if (!source || source.observation.confidence < CatalogPolicy.values.minimumReferenceConfidence)
            return [];
          const slot = this.slot(source, member.slot - 1, catalog);
          if (!slot) return [];
          slots.push(slot);
        }
        const categories = new Set(slots.map((slot) => slot.target.category));
        if (!(['1', '2', '3', '4'] as const).every((category) => categories.has(category))) return [];
        if (categories.has('5') !== includeGold) return [];
        if (slots.filter((slot) => slot.adaptedFacets.length).length > this.config.policy.maxAdaptedSlots)
          return [];
        return [{ set, slots }];
      });
  }

  select(
    concepts: SemanticConcept[],
    catalog: VisualCatalog,
    includeGold: boolean,
    preferredSourceIds: string[] = [],
  ): CompositionBlueprint[] {
    const prototypes = this.prototypes(catalog, includeGold);
    if (!prototypes.length)
      throw new Error(
        'No source prototype satisfies category coverage, gold mode and reference coverage. Review the catalog before generating.',
      );
    const used = new Set<string>();
    return concepts.map((concept) => {
      SubjectAssignment.validate(concept, includeGold);
      const candidates = prototypes
        .flatMap(({ set, slots }) => {
          const assignment = SubjectAssignment.solve(
            concept,
            slots.map((slot) => slot.target),
          );
          if (!assignment) return [];
          const adapted = slots.filter((slot) => slot.adaptedFacets.length).length;
          const score =
            this.relevance(concept, set) +
            (preferredSourceIds.includes(set.id) ? this.config.policy.preferredSourceBonus : 0) -
            adapted * this.config.policy.adaptationPenalty -
            assignment.cost -
            (used.has(set.id) ? this.config.policy.reusedSourcePenalty : 0);
          return [{ set, slots, assignment, score }];
        })
        .sort((a, b) => b.score - a.score || a.set.id.localeCompare(b.set.id));
      const chosen = candidates[0];
      if (!chosen)
        throw new Error(
          `No compatible ten-subject assignment for "${concept.title}". Propose complementary candidates compatible with the available source layouts.`,
        );
      used.add(chosen.set.id);
      return {
        title: concept.title,
        concept: concept.concept,
        composition: {
          version: 'set-composition-v1',
          catalogDependencyHash: catalog.dependencyHash,
          sourceSetIds: [chosen.set.id],
          rationale: chosen.set.analysis.backgroundRhythm,
          selection: {
            version: 'source-prototype-v1',
            sourceSetId: chosen.set.id,
            sourceSetTitle: chosen.set.analysis.theme,
            slots: chosen.slots.map((slot) => ({
              index: slot.index,
              sourceCardId: slot.sourceCardId,
              sourceRequired: slot.sourceRequired,
              adaptedFacets: slot.adaptedFacets,
            })),
          },
          targets: chosen.slots.map((slot) => slot.target),
        },
        slots: chosen.slots.map((slot, index) => {
          const candidateIndex = chosen.assignment.indices[index];
          const subject = candidateIndex === undefined ? undefined : concept.candidates[candidateIndex];
          if (!subject) throw new Error('Incomplete subject assignment.');
          return { ...slot, subject: structuredClone(subject) };
        }),
      };
    });
  }

  private core(card: CatalogCard): CompositionRequirements {
    const { support, backdrop, pattern, depth, contextDensity, characterCount } = card.observation.facets;
    return { support, backdrop, pattern, depth, contextDensity, characterCount };
  }
  private valid(category: CompositionTarget['category'], required: CompositionRequirements): boolean {
    return (
      (category !== '1' || required.support === 'none') &&
      (category !== '2' || required.support === 'simple-plane') &&
      (category !== '3' || required.support === 'material-surface') &&
      (!['4', '5'].includes(category) || required.backdrop === 'environment') &&
      (category === '5' ? [1, 2].includes(required.characterCount ?? 0) : required.characterCount === 0) &&
      (required.backdrop === 'pattern' ? required.pattern !== 'none' : required.pattern === 'none')
    );
  }
  private slot(source: CatalogCard, index: number, catalog: VisualCatalog) {
    const category = source.observation.category;
    const sourceRequired = this.core(source);
    const alternatives = catalog.cards.filter(
      (card) =>
        (!this.originalIds || this.originalIds.includes(card.id)) &&
        card.observation.category === category &&
        card.observation.confidence >= CatalogPolicy.values.minimumReferenceConfidence,
    );
    const choices = alternatives
      .flatMap((card) => {
        const required = this.core(card);
        // Preserve the source's joint category/backdrop/context/character distribution.
        if (
          required.backdrop !== sourceRequired.backdrop ||
          required.contextDensity !== sourceRequired.contextDensity ||
          required.characterCount !== sourceRequired.characterCount ||
          !this.valid(category, required)
        )
          return [];
        const count = new Set(
          alternatives
            .filter((candidate) => SetComposition.matches(candidate.observation.facets, required))
            .map((candidate) => candidate.sha256),
        ).size;
        if (count < CatalogPolicy.values.minimumCompositionReferences) return [];
        const adaptedFacets = (['support', 'pattern', 'depth'] as const).filter(
          (key) => required[key] !== sourceRequired[key],
        );
        return [{ required, adaptedFacets, id: card.id }];
      })
      .sort((a, b) => a.adaptedFacets.length - b.adaptedFacets.length || a.id.localeCompare(b.id));
    const chosen = choices[0];
    if (!chosen) return null;
    const { camera, subjectScale, subjectPosition, backgroundColor } = source.observation.facets;
    return {
      index,
      sourceCardId: source.id,
      sourceRequired,
      adaptedFacets: chosen.adaptedFacets,
      target: {
        index,
        category,
        required: chosen.required,
        preferred: { camera, subjectScale, subjectPosition, backgroundColor },
      },
    };
  }

  private relevance(concept: SemanticConcept, set: CatalogSet): number {
    const terms = new Set(
      `${concept.title} ${concept.concept} ${concept.candidates.map((candidate) => candidate.role).join(' ')}`
        .toLowerCase()
        .match(/[\p{L}\p{N}]{4,}/gu) ?? [],
    );
    const source = new Set(
      `${set.analysis.theme} ${set.analysis.story}`.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [],
    );
    return [...terms].filter((term) => source.has(term)).length;
  }
}
