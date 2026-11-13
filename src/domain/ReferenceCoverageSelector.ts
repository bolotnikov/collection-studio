import type { LibraryItem, StyleEvidence } from '../shared/StyleContracts';
import { CatalogPolicy } from '../shared/CatalogPolicy';

type Assessment = StyleEvidence['analysis']['selections'][number];
/** Select by role coverage; never add images merely to fill the attachment budget. */
export class ReferenceCoverageSelector {
  select(
    items: LibraryItem[],
    assessments: Assessment[],
    limit: number,
    category: string,
    sharedIds: string[],
    compositionIds: string[] | undefined,
    materials: string[],
  ): LibraryItem[] {
    if (!Number.isInteger(limit) || limit < 2)
      throw new Error('Reference budget cannot cover composition evidence.');
    if (
      new Set(assessments.map((a) => a.id)).size !== assessments.length ||
      assessments.length !== items.length
    )
      throw new Error('Coverage assessment must explain every candidate exactly once.');
    const entries = assessments.map((assessment) => {
      const item = items.find((item) => item.id === assessment.id);
      if (!item || !assessment.coverage) throw new Error('Missing visual reference coverage evidence.');
      return { item, assessment, coverage: assessment.coverage };
    });
    const usable = entries.filter(
      (entry) => entry.item.approved && entry.coverage.useful && !entry.coverage.conflict,
    );
    const selected: typeof entries = [];
    const add = (entry: (typeof entries)[number]) => {
      if (selected.some((s) => s.item.sha256 === entry.item.sha256)) return;
      if (selected.length >= limit) throw new Error('Reference requirements exceed the attachment budget.');
      if (
        entry.item.origin === 'user' &&
        selected.filter((s) => s.item.origin === 'user').length >= Math.floor(limit / 4)
      )
        return;
      selected.push(entry);
    };
    if (sharedIds.length !== 2 || new Set(sharedIds).size !== 2)
      throw new Error('Two shared original style anchors are required.');
    for (const id of sharedIds) {
      const entry = usable.find((e) => e.item.id === id && e.item.origin === 'anchor');
      if (!entry) throw new Error('Shared style anchor failed visual compatibility review.');
      add(entry);
    }
    if (selected.length !== 2) throw new Error('Shared style anchors must have distinct image content.');
    const matches = (entry: (typeof entries)[number]) =>
      entry.item.origin === 'anchor' &&
      entry.item.category === category &&
      (compositionIds
        ? compositionIds.includes(entry.item.id) && entry.assessment.compositionMatches === true
        : true);
    for (const entry of usable.filter(matches)) {
      if (selected.filter(matches).length >= CatalogPolicy.values.minimumCompositionReferences) break;
      add(entry);
    }
    if (selected.filter(matches).length < CatalogPolicy.values.minimumCompositionReferences)
      throw new Error('Insufficient visually confirmed original composition references.');
    const normalize = (value: string) => value.trim().toLowerCase();
    const requiredMaterials = [...new Set(materials.map(normalize))];
    const missing = () => [
      ...(!selected.some((e) => e.coverage.rendering) ? ['rendering'] : []),
      ...(!selected.some((e) => e.coverage.lighting) ? ['lighting'] : []),
      ...requiredMaterials
        .filter((material) => !selected.some((e) => e.coverage.materials.map(normalize).includes(material)))
        .map((material) => 'material:' + material),
    ];
    const covers = (entry: (typeof entries)[number], requirement: string) =>
      requirement === 'rendering'
        ? entry.coverage.rendering
        : requirement === 'lighting'
          ? entry.coverage.lighting
          : entry.coverage.materials.map(normalize).includes(requirement.slice(9));
    while (missing().length) {
      const needs = missing();
      const next = usable
        .filter(
          (e) =>
            !selected.some((s) => s.item.sha256 === e.item.sha256) &&
            (e.item.origin === 'anchor' ||
              selected.filter((s) => s.item.origin === 'user').length < Math.floor(limit / 4)),
        )
        .map((entry, index) => ({ entry, index, gain: needs.filter((need) => covers(entry, need)).length }))
        .filter((e) => e.gain > 0)
        .sort(
          (a, b) =>
            b.gain - a.gain ||
            Number(b.entry.item.origin === 'anchor') - Number(a.entry.item.origin === 'anchor') ||
            a.index - b.index,
        )[0];
      if (!next) throw new Error('Missing reference coverage: ' + needs.join(', '));
      add(next.entry);
    }
    return selected.map((entry) => entry.item);
  }
}
