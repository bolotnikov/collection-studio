import type { Run } from '../shared/Contracts';
import { SlotTagContracts, type SlotTagEdit } from '../shared/SlotTagContracts';
import type { LibraryItem } from '../shared/StyleContracts';
import { SlotTagRules } from './SlotTagRules';
import { SetComposition } from './SetComposition';

/** User intents invalidate only the approvals whose inputs changed. */
export class RunEdits {
  static setSlotTags(run: Run, cardId: string, input: SlotTagEdit, library: LibraryItem[]): boolean {
    const edit = SlotTagContracts.edit.parse(input);
    const variant = run.variants.find((entry) => entry.cards.some((card) => card.id === cardId));
    const card = variant?.cards.find((entry) => entry.id === cardId);
    if (!variant || !card) throw new Error('Card not found.');
    const original = variant.artContract?.composition?.targets.find(
      (target) => target.index === variant.cards.indexOf(card),
    );
    if (!original) throw new Error('This historical run has no slot tag contract.');
    if (card.locked) throw new Error('Unlock the card first.');
    if (SlotTagRules.revision(card) !== edit.expectedRevision)
      throw new Error('Slot tags changed. Reopen the editor.');
    SlotTagRules.validate(original, edit.facets);
    const current = SetComposition.target(variant, card);
    if (
      current &&
      SlotTagContracts.axis.options.every(
        (key) => edit.facets[key] === { ...current.required, ...current.appearance }[key],
      )
    )
      return false;
    const desired = SlotTagRules.target(original, edit.facets);
    const currentIds = current?.selectedReferenceIds ?? [];
    const candidates = library
      .filter((item) => SetComposition.reference(item, desired))
      .sort((a, b) => {
        const left = currentIds.indexOf(a.id),
          right = currentIds.indexOf(b.id);
        return (left < 0 ? 100 : left) - (right < 0 ? 100 : right) || a.id.localeCompare(b.id);
      });
    const seen = new Set<string>();
    const retained = candidates.filter((item) => currentIds.includes(item.id));
    const pool = retained.length >= 2 && retained.length === currentIds.length ? retained : candidates;
    const references = pool
      .filter((item) => {
        if (seen.has(item.sha256)) return false;
        seen.add(item.sha256);
        return true;
      })
      .slice(0, 8);
    if (references.length < 2)
      throw new Error('The selected tags need at least two matching original references.');
    const originalFacets = { ...original.required, ...original.appearance };
    const revision = SlotTagContracts.revision.parse({
      version: 'manual-slot-tags-v1',
      revision: edit.expectedRevision + 1,
      at: new Date().toISOString(),
      facets: edit.facets,
      changedFacets: SlotTagContracts.axis.options.filter((key) => edit.facets[key] !== originalFacets[key]),
      referenceIds: references.map((item) => item.id),
    });
    (card.slotTagEdits ??= []).push(revision);
    variant.review = null;
    variant.reviewError = null;
    delete variant.reviewedAttemptIds;
    for (const round of variant.gridRepairRounds ?? [])
      if (!round.completedAt && !round.supersededAt) round.supersededAt = revision.at;
    run.events.push({ at: revision.at, message: `Slot tags updated: ${card.subject}` });
    return true;
  }
  static selectAttempt(run: Run, cardId: string, attemptId: string): void {
    const variant = run.variants.find((v) => v.cards.some((card) => card.id === cardId));
    const card = variant?.cards.find((card) => card.id === cardId);
    if (!variant || !card || !card.attempts.some((attempt) => attempt.id === attemptId))
      throw new Error('Version not found.');
    if (card.locked) throw new Error('Unlock the card first.');
    if (card.selectedAttemptId === attemptId) return;
    card.selectedAttemptId = attemptId;
    if (run.reviewProtocol === 'composition-v1') return;
    variant.review = null;
    delete variant.reviewedAttemptIds;
    variant.reviewError = 'Selection changed manually; set review is now outdated.';
    run.status = 'paused';
    run.stage = variant.reviewError;
  }
  static lock(run: Run, cardId: string, locked: boolean): void {
    const card = run.variants.flatMap((v) => v.cards).find((card) => card.id === cardId);
    if (!card) throw new Error('Card not found.');
    if (locked && !card.selectedAttemptId) throw new Error('Generate an image first.');
    card.locked = locked;
  }
  static selectVariant(run: Run, variantId: string): void {
    if (!run.variants.some((v) => v.id === variantId)) throw new Error('Variant not found.');
    run.selectedVariantId = variantId;
  }
  static setBudget(run: Run, maximum: number): void {
    if (
      !Number.isSafeInteger(maximum) ||
      maximum > 150 ||
      maximum < run.imageCalls ||
      maximum < run.brief.variants * 10
    )
      throw new Error('The limit must cover existing requests and the base set size.');
    run.brief.maxImageCalls = maximum;
  }
}
