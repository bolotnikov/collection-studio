import { SetRhythmPlanner } from './SetRhythmPlanner';
import { CatalogPolicy } from '../shared/CatalogPolicy';
import type { Card, Plan, Variant } from '../shared/Contracts';
import type { CompositionRequirements, CompositionTarget } from '../shared/CompositionContract';
import type { VisualCatalog } from '../shared/VisualCatalogContracts';
import type { LibraryItem } from '../shared/StyleContracts';
import { SetRules } from './SetRules';

/** Immutable slot targets avoid shared mutable counters and double-counted retries. */
export class SetComposition {
  static catalogSummary(catalog: VisualCatalog, includeGold = false) {
    const combinations = new Map<
      string,
      { category: string; facets: CompositionRequirements; count: number }
    >();
    for (const card of catalog.cards.filter(
      (card) =>
        (includeGold || card.observation.category !== '5') &&
        card.observation.confidence >= CatalogPolicy.values.minimumReferenceConfidence,
    )) {
      const { support, backdrop, pattern, depth } = card.observation.facets;
      const facets = {
        support,
        backdrop,
        pattern,
        depth,
        ...(card.observation.category === '5'
          ? { characterCount: card.observation.facets.characterCount }
          : {}),
      };
      const key = JSON.stringify([card.observation.category, facets]);
      const previous = combinations.get(key);
      combinations.set(key, {
        category: card.observation.category,
        facets,
        count: (previous?.count ?? 0) + 1,
      });
    }
    return {
      dependencyHash: catalog.dependencyHash,
      supportedCompositions: [...combinations.values()].filter(
        (combination) => combination.count >= CatalogPolicy.values.minimumCompositionReferences,
      ),
      sets: catalog.sets
        .filter((set) =>
          set.cards.some(
            (member) => catalog.cards.find((card) => card.id === member.id)?.observation.category !== '5',
          ),
        )
        .map((set) => ({
          id: set.id,
          analysis: set.analysis,
          slots: set.cards.map((member) => {
            const observation = catalog.cards.find((card) => card.id === member.id)?.observation;
            return {
              slot: member.slot,
              category: observation?.category,
              support: observation?.facets.support,
              backdrop: observation?.facets.backdrop,
              pattern: observation?.facets.pattern,
              depth: observation?.facets.depth,
              palette: observation?.facets.palette,
              camera: observation?.facets.camera,
              subjectScale: observation?.facets.subjectScale,
              subjectPosition: observation?.facets.subjectPosition,
              backgroundColor: observation?.facets.backgroundColor,
              contextDensity: observation?.facets.contextDensity,
            };
          }),
        })),
    };
  }
  static matches(observed: CompositionRequirements | undefined, required: CompositionRequirements): boolean {
    return Boolean(
      observed &&
      Object.entries(required).every(
        ([key, value]) => value === undefined || observed[key as keyof CompositionRequirements] === value,
      ),
    );
  }
  static target(variant: Variant, card: Card): CompositionTarget | undefined {
    return variant.artContract?.composition?.targets.find(
      (target) => target.index === variant.cards.findIndex((item) => item.id === card.id),
    );
  }
  static reference(item: LibraryItem, target: CompositionTarget): boolean {
    return (
      item.origin === 'anchor' &&
      item.approved &&
      (item.metadata?.category ?? item.observation?.category ?? item.category) === target.category &&
      Boolean(
        item.observation &&
        item.observation.confidence >= CatalogPolicy.values.minimumReferenceConfidence &&
        this.matches(item.observation.facets, target.required),
      )
    );
  }
  static validate(plan: Plan, catalog: VisualCatalog, originalIds?: readonly string[]): void {
    for (const variant of plan.variants) {
      const composition = variant.artContract?.composition;
      if (!composition || composition.catalogDependencyHash !== catalog.dependencyHash)
        throw new Error('A prepared-catalog composition contract is required.');
      if (
        new Set(composition.targets.map((target) => target.index)).size !== 10 ||
        new Set(composition.sourceSetIds).size !== composition.sourceSetIds.length ||
        composition.sourceSetIds.some((id) => !catalog.sets.some((set) => set.id === id))
      )
        throw new Error('Invalid composition slot coverage or source-set evidence.');
      SetRhythmPlanner.validate(composition);
      const selection = composition.selection;
      const aggregate = composition.aggregate;
      if (aggregate) {
        if (
          selection ||
          aggregate.sourceSetCount !== composition.sourceSetIds.length ||
          aggregate.contributingSetCount > aggregate.sourceSetCount ||
          aggregate.patterns.reduce((sum, pattern) => sum + pattern.count, 0) !== 10
        )
          throw new Error('Invalid aggregate composition evidence.');
        for (const pattern of aggregate.patterns) {
          const actual = composition.targets.filter(
            (target) =>
              target.category === pattern.category &&
              JSON.stringify(target.required) === JSON.stringify(pattern.required),
          ).length;
          if (
            actual !== pattern.count ||
            (actual > 0 && pattern.referenceCount < CatalogPolicy.values.minimumCompositionReferences)
          )
            throw new Error('Aggregate pattern counts do not match the assigned slots.');
        }
        if (
          composition.targets.some(
            (target) =>
              !aggregate.patterns.some(
                (pattern) =>
                  pattern.count > 0 &&
                  pattern.category === target.category &&
                  JSON.stringify(pattern.required) === JSON.stringify(target.required),
              ),
          )
        )
          throw new Error('Assigned slot is absent from the aggregate model.');
      }
      if (selection) {
        const source = catalog.sets.find((set) => set.id === selection.sourceSetId);
        if (
          !source ||
          composition.sourceSetIds.length !== 1 ||
          composition.sourceSetIds[0] !== source.id ||
          new Set(selection.slots.map((slot) => slot.index)).size !== 10
        )
          throw new Error('Invalid source-prototype lineage.');
        for (const slot of selection.slots) {
          const member = source.cards.find((member) => member.slot === slot.index + 1);
          const original = catalog.cards.find(
            (card) => card.id === member?.id && card.sha256 === member.sha256,
          );
          const target = composition.targets.find((target) => target.index === slot.index);
          if (
            !original ||
            !target ||
            original.id !== slot.sourceCardId ||
            original.observation.category !== target.category ||
            !this.matches(original.observation.facets, slot.sourceRequired)
          )
            throw new Error('Source-prototype slot evidence mismatch.');
          for (const key of [
            'support',
            'backdrop',
            'pattern',
            'depth',
            'contextDensity',
            'characterCount',
          ] as const) {
            const changed = slot.sourceRequired[key] !== target.required[key];
            const allowed =
              (key === 'support' || key === 'pattern' || key === 'depth') && slot.adaptedFacets.includes(key);
            if (changed !== allowed)
              throw new Error('Source-prototype drift or undocumented slot adaptation.');
          }
        }
      }
      for (const target of composition.targets) {
        if (
          variant.cards[target.index]?.category !== target.category ||
          !target.required.support ||
          !target.required.backdrop ||
          !target.required.depth
        )
          throw new Error('Every slot needs its category, support, backdrop and depth requirements.');
        if (
          (target.required.backdrop === 'pattern' &&
            (!target.required.pattern || target.required.pattern === 'none')) ||
          (target.required.backdrop !== 'pattern' &&
            target.required.pattern &&
            target.required.pattern !== 'none')
        )
          throw new Error('Pattern requirements contradict the planned backdrop.');
        if (
          composition.rhythm &&
          target.appearance &&
          !catalog.cards.some(
            (card) =>
              card.observation.category === target.category &&
              card.observation.facets.backdrop === target.required.backdrop &&
              card.observation.facets.pattern === target.required.pattern &&
              card.observation.facets.backgroundColor === target.appearance?.backgroundColor,
          )
        )
          throw new Error('Locked output color lacks category/backdrop/pattern evidence.');
        const support = target.required.support;
        if (
          (target.category === '1' && support !== 'none') ||
          (target.category === '2' && support !== 'simple-plane') ||
          (target.category === '3' && support !== 'material-surface')
        )
          throw new Error('Planned support does not satisfy the source category definition.');
        if (
          (target.category === '4' || target.category === '5') &&
          target.required.backdrop !== 'environment'
        )
          throw new Error(
            'Category 4 requires recognizable surrounding context, independently of support type.',
          );
        if (target.category === '5' && ![1, 2].includes(target.required.characterCount ?? 0))
          throw new Error('Narrative targets require one or two characters.');
        const matches = catalog.cards.filter(
          (card) =>
            (!originalIds || originalIds.includes(card.id)) &&
            card.observation.category === target.category &&
            card.observation.confidence >= CatalogPolicy.values.minimumReferenceConfidence &&
            this.matches(card.observation.facets, target.required),
        );
        if (
          new Set(matches.map((card) => card.sha256)).size < CatalogPolicy.values.minimumCompositionReferences
        )
          throw new Error(
            `Reference coverage gap in slot ${target.index + 1}: two matching original compositions are required.`,
          );
        if (target.selectedReferenceIds) {
          const selected = target.selectedReferenceIds.map((id) => matches.find((card) => card.id === id));
          if (
            selected.some((card) => !card) ||
            new Set(selected.map((card) => card?.sha256)).size !== selected.length ||
            selected.length < CatalogPolicy.values.minimumCompositionReferences ||
            target.selectedReferenceIds.some((id) => !target.referenceIds?.includes(id))
          )
            throw new Error(
              'Frozen slot references must be distinct matching originals from the candidate pool.',
            );
        }
      }
    }
  }
  static snapshot(variant: Variant, inFlight: ReadonlySet<string> = new Set(), minimumStyle = 4) {
    const slots = variant.cards.map((card, index) => {
      const selected = card.attempts.find((attempt) => attempt.id === card.selectedAttemptId);
      const target = this.target(variant, card);
      const observed =
        selected?.compositionCheck?.observedComposition ?? selected?.review?.observedComposition;
      const verified = selected?.compositionCheck
        ? !selected.compositionCheckError &&
          selected.compositionCheck.matches &&
          (!target ||
            (this.matches(observed, target.required) &&
              (!target.appearance || this.matches(observed, target.appearance))))
        : selected &&
          !selected.reviewError &&
          SetRules.acceptsReview(selected.review, minimumStyle) &&
          (!target ||
            (selected.review?.compositionMatch === true && this.matches(observed, target.required)));
      return {
        index,
        id: card.id,
        subject: card.subject,
        target,
        verified: Boolean(verified),
        status: inFlight.has(card.id) ? 'in-flight' : verified ? 'accepted' : 'remaining',
        selectedAttemptId: verified ? (selected?.id ?? null) : null,
        observed: verified ? observed : null,
      };
    });
    const accepted = slots.filter((slot) => slot.verified);
    const counts = (key: 'backdrop' | 'support') =>
      Object.fromEntries(
        [...new Set(accepted.map((slot) => slot.observed?.[key]).filter(Boolean))].map((value) => [
          value,
          accepted.filter((slot) => slot.observed?.[key] === value).length,
        ]),
      );
    const axes = [
      'backdrop',
      'support',
      'pattern',
      'depth',
      'contextDensity',
      'camera',
      'subjectScale',
      'subjectPosition',
      'backgroundColor',
      'characterCount',
    ] as const;
    const summarize = (values: (CompositionRequirements | null | undefined)[]) =>
      Object.fromEntries(
        axes.map((axis) => {
          const counts: Record<string, number> = {};
          for (const value of values) {
            const facet = value?.[axis];
            if (facet !== undefined) counts[String(facet)] = (counts[String(facet)] ?? 0) + 1;
          }
          return [axis, counts];
        }),
      );
    return {
      targetFacetCounts: summarize(
        slots.map((slot) =>
          slot.target ? { ...slot.target.required, ...slot.target.appearance } : undefined,
        ),
      ),
      acceptedFacetCounts: summarize(accepted.map((slot) => slot.observed)),
      remainingFacetCounts: summarize(
        slots
          .filter((slot) => !slot.verified)
          .map((slot) => (slot.target ? { ...slot.target.required, ...slot.target.appearance } : undefined)),
      ),
      slots,
      accepted: accepted.length,
      remaining: slots.filter((slot) => slot.status === 'remaining').length,
      actualBackdropCounts: counts('backdrop'),
      actualSupportCounts: counts('support'),
    };
  }
}
