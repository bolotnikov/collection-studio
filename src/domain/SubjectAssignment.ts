import type { SemanticConcept } from '../shared/CompositionPlanningContracts';
import type { CompositionTarget } from '../shared/CompositionContract';

export class SubjectAssignment {
  static compatible(candidate: SemanticConcept['candidates'][number], target: CompositionTarget): boolean {
    if (
      !candidate.compatibleCategories.includes(target.category) ||
      candidate.characterCount !== target.required.characterCount
    )
      return false;
    const constraints = candidate.compatibleComposition;
    if (!constraints) return true;
    for (const axis of ['support', 'backdrop', 'pattern', 'depth', 'contextDensity'] as const) {
      const value = target.required[axis];
      const allowed: readonly string[] = constraints[axis];
      if (value && !allowed.includes(value)) return false;
    }
    return true;
  }
  static validate(concept: SemanticConcept, includeGold: boolean): void {
    if (
      new Set(concept.candidates.map((candidate) => candidate.id)).size !== concept.candidates.length ||
      new Set(concept.candidates.map((candidate) => candidate.subject.trim().toLowerCase())).size !==
        concept.candidates.length
    )
      throw new Error('Semantic candidates must have distinct IDs and subjects.');
    for (const candidate of concept.candidates) {
      if (
        new Set(candidate.compatibleCategories).size !== candidate.compatibleCategories.length ||
        (candidate.compatibleComposition &&
          Object.values(candidate.compatibleComposition).some(
            (values) => new Set(values).size !== values.length,
          )) ||
        (!includeGold && candidate.compatibleCategories.includes('5')) ||
        (candidate.compatibleCategories.includes('5')
          ? candidate.compatibleCategories.length !== 1 || ![1, 2].includes(candidate.characterCount)
          : candidate.characterCount !== 0)
      )
        throw new Error(
          'Narrative candidates must be separate from ordinary objects; category compatibility must be unique and respect gold mode.',
        );
    }
  }

  /** Minimum-cost matching with candidate bit masks (at most 14 candidates / 10 slots). */
  static solve(concept: SemanticConcept, targets: CompositionTarget[]) {
    let states = new Map<number, { cost: number; indices: number[] }>([[0, { cost: 0, indices: [] }]]);
    for (const target of targets) {
      const next = new Map<number, { cost: number; indices: number[] }>();
      for (const [mask, state] of states)
        concept.candidates.forEach((candidate, index) => {
          const preference = candidate.compatibleCategories.indexOf(target.category);
          if (
            !SubjectAssignment.compatible(candidate, target) ||
            mask & (1 << index) ||
            candidate.characterCount !== target.required.characterCount
          )
            return;
          const key = mask | (1 << index);
          const cost = state.cost + preference + Math.max(0, index - 9);
          if (!next.has(key) || cost < (next.get(key)?.cost ?? Infinity))
            next.set(key, { cost, indices: [...state.indices, index] });
        });
      states = next;
    }
    return [...states.values()].sort(
      (a, b) => a.cost - b.cost || a.indices.join(',').localeCompare(b.indices.join(',')),
    )[0];
  }
}
