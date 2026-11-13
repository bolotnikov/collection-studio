import type { Plan } from '../shared/Contracts';

/** Compare model-declared subject identities across one multi-set request. */
export class BatchSubjectRules {
  static validate(plan: Pick<Plan, 'variants'>): void {
    if (plan.variants.length < 2) return;
    const names = new Map<string, string>();
    const types = new Map<string, string>();
    const conflicts: string[] = [];
    for (const [variantIndex, variant] of plan.variants.entries()) {
      for (const [cardIndex, card] of variant.cards.entries()) {
        const location = `set ${variantIndex + 1}, slot ${cardIndex + 1} (${card.subject})`;
        if (!card.subjectType) throw new Error(`Missing normalized subjectType at ${location}.`);
        for (const [kind, key, seen] of [
          ['subject', this.normalize(card.subject), names],
          ['subjectType', card.subjectType, types],
        ] as const) {
          const previous = seen.get(key);
          if (previous) conflicts.push(`${location} repeats ${kind} "${key}" from ${previous}`);
          else seen.set(key, location);
        }
      }
    }
    if (conflicts.length)
      throw new Error(`Duplicate subjects in multi-set request: ${conflicts.join('; ')}.`);
  }

  private static normalize(subject: string): string {
    return subject.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
  }
}
