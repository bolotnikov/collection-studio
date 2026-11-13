import { CompositionContract, type CompositionTarget } from '../shared/CompositionContract';
import { SlotTagContracts, type SlotTagFacets } from '../shared/SlotTagContracts';
import type { Card, Variant } from '../shared/Contracts';

/** Category identity is fixed; user tag choices override the remaining visual requirements. */
export class SlotTagRules {
  static fixed(target: CompositionTarget): SlotTagFacets {
    if (target.category === '1') return { support: 'none' };
    if (target.category === '2') return { support: 'simple-plane' };
    if (target.category === '3') return { support: 'material-surface' };
    return { backdrop: 'environment' };
  }
  static validate(target: CompositionTarget, facets: SlotTagFacets): void {
    for (const key of SlotTagContracts.axis.options) {
      const fixed = this.fixed(target)[key];
      if (fixed !== undefined && facets[key] !== fixed)
        throw new Error('This tag is required by the card category.');
    }
    if (facets.backdrop === 'pattern' && (!facets.pattern || facets.pattern === 'none'))
      throw new Error('Choose a pattern geometry for a patterned backdrop.');
    if (facets.pattern && facets.pattern !== 'none' && facets.backdrop !== 'pattern')
      throw new Error('Pattern geometry requires a patterned backdrop.');
  }
  static target(
    original: CompositionTarget,
    facets: SlotTagFacets,
    referenceIds?: string[],
  ): CompositionTarget {
    const { backgroundColor, subjectScale, ...required } = facets;
    const appearance = {
      ...(backgroundColor ? { backgroundColor } : {}),
      ...(subjectScale ? { subjectScale } : {}),
    };
    return CompositionContract.target.parse({
      ...original,
      required: {
        ...required,
        characterCount: original.required.characterCount ?? (original.category === '5' ? 1 : 0),
      },
      preferred: {},
      appearance: Object.keys(appearance).length ? appearance : undefined,
      ...(referenceIds ? { referenceIds, selectedReferenceIds: referenceIds } : {}),
    });
  }
  static revision(card: Card): number {
    return card.slotTagEdits?.at(-1)?.revision ?? 0;
  }
  static reviewCurrent(card: Card, revision?: number): boolean {
    return this.revision(card) === (revision ?? 0);
  }
  static gridRevisions(variant: Variant): number[] {
    return variant.cards.map((card) => this.revision(card));
  }
  static gridCurrent(variant: Variant, revisions?: number[]): boolean {
    return (
      JSON.stringify(this.gridRevisions(variant)) === JSON.stringify(revisions ?? variant.cards.map(() => 0))
    );
  }
  static gridCorrectionAllowed(variant: Variant, cardId: string, kind: string): boolean {
    if (!['color-pattern-rhythm', 'adjacent-color'].includes(kind)) return true;
    const index = variant.cards.findIndex((card) => card.id === cardId);
    return !variant.cards.some((card, editedIndex) => {
      const changed = card.slotTagEdits?.at(-1)?.changedFacets ?? [];
      if (!changed.some((axis) => ['backgroundColor', 'pattern', 'backdrop'].includes(axis))) return false;
      if (editedIndex === index) return true;
      return (
        kind === 'adjacent-color' &&
        (Math.abs(index - editedIndex) === 5 ||
          (Math.floor(index / 5) === Math.floor(editedIndex / 5) && Math.abs(index - editedIndex) === 1))
      );
    });
  }
}
