import type { Attempt, Card, Profile, Run } from '../../../shared/Contracts';
import type { CompositionTarget } from '../../../shared/CompositionContract';
import { Assets } from '../Assets';

export type ReferenceImage = {
  id: string;
  src: string;
  title: string;
  role: string;
  number?: number;
  take?: string;
  ignore?: string;
};

/** Resolve evidence against the immutable project snapshot, never substitute current library entries. */
export class ReferencePresentation {
  private static image(profile: Profile, id: string, role: string): ReferenceImage | undefined {
    const art =
      profile.library?.find((item) => item.id === id) ?? profile.references.find((item) => item.id === id);
    if (art) {
      const title =
        ('metadata' in art ? art.metadata?.description : undefined) ??
        ('observation' in art ? art.observation?.subject : undefined) ??
        profile.visualCatalog?.cards.find((card) => card.id === id)?.observation.subject ??
        art.title;
      return { id, src: Assets.reference(art.filename), title, role };
    }
    const source = profile.knowledge?.images.find((item) => item.id === id);
    if (source) return { id, src: Assets.knowledge(source.filename), title: source.title, role };
    return undefined;
  }
  static candidates(profile: Profile, target?: CompositionTarget): ReferenceImage[] {
    return (target?.referenceIds ?? []).flatMap((id) => {
      const image = this.image(profile, id, 'Composition candidate');
      return image ? [image] : [];
    });
  }
  static planned(profile: Profile, target?: CompositionTarget): ReferenceImage[] {
    if (!target?.referenceIds?.length) return [];
    const ids = target.selectedReferenceIds ?? target.referenceIds.slice(0, 2);
    return [...new Set(ids)].flatMap((id) => {
      const image = this.image(profile, id, 'Planning composition reference');
      return image ? [image] : [];
    });
  }
  static used(profile: Profile, run: Run, card: Card, attempt?: Attempt): ReferenceImage[] {
    if (!attempt) return [];
    const manifest = attempt.generationInputManifest ?? [
      ...(attempt.evidence?.references.map((reference, index) => ({
        image: index + 1,
        id: reference.id,
        role: reference.purposes?.includes('category') ? 'original-category' : 'original-rendering',
        take: reference.take,
        ignore: reference.ignore,
      })) ?? []),
      ...(attempt.sourceEvidence?.images
        .filter((image) => image.attached)
        .map((image) => ({ image: 0, id: image.id, role: image.role })) ?? []),
    ];
    const roles: Record<string, string> = {
      'original-category': 'Composition reference',
      'original-rendering': 'Rendering reference',
      supplemental: 'Supplemental reference',
      'category-example': 'Category example',
      'collection-example': 'Set example',
      'previous-candidate': 'Previous version (edit base)',
    };
    return manifest.flatMap((entry) => {
      if (!entry.id) return [];
      const role = roles[entry.role] ?? entry.role;
      const previous =
        entry.role === 'previous-candidate'
          ? card.attempts.find((version) => version.id === entry.id)
          : undefined;
      const image = previous
        ? { id: previous.id, src: Assets.image(run, previous.master), title: card.subject, role }
        : this.image(profile, entry.id, role);
      return image
        ? [
            {
              ...image,
              number: entry.image || undefined,
              take: 'take' in entry ? entry.take : undefined,
              ignore: 'ignore' in entry ? entry.ignore : undefined,
            },
          ]
        : [];
    });
  }
}
