import type { Variant } from '../../shared/Contracts';
import { useLocalization } from './i18n/LocalizationContext';

export function SetReviewDetails({ variant }: { variant: Variant }) {
  const { t } = useLocalization();
  const review = variant.review;
  if (!review || !('assessment' in review)) return null;
  const labels = {
    styleCompatibility: 'Style compatibility',
    thematicCohesion: 'Thematic cohesion',
    silhouetteDiversity: 'Silhouette diversity',
    materialDiversity: 'Material diversity',
    paletteBalance: 'Palette balance',
    compositionBalance: 'Composition balance',
  } as const;
  return (
    <details className="set-review-details">
      <summary>{t('Set comparison details')}</summary>
      <dl>
        {Object.entries(labels).map(([key, label]) => (
          <div key={key}>
            <dt>{t(label)}</dt>
            <dd>{review.assessment[key as keyof typeof labels]}/5</dd>
          </div>
        ))}
      </dl>
      <p>
        {t(
          review.assessment.categoryCoverage
            ? 'All four categories verified'
            : 'Category coverage needs correction',
        )}
      </p>
      <p>
        {t(
          review.assessment.redundantSubjects
            ? 'Repeated subjects detected'
            : 'No redundant subjects detected',
        )}
      </p>
      <ul>
        {review.corrections.map((correction, index) => (
          <li key={`${correction.cardId}-${index}`}>
            <strong>{variant.cards.find((c) => c.id === correction.cardId)?.subject}:</strong>{' '}
            {correction.instruction}
          </li>
        ))}
      </ul>
      {variant.sourceEvidence && (
        <>
          <h4>{t('Source context')}</h4>
          <ul>
            {variant.sourceEvidence.images
              .filter((i) => i.role === 'collection-example')
              .map((image) => (
                <li key={image.id}>
                  {image.title} — {image.reason}
                </li>
              ))}
          </ul>
        </>
      )}
      <p className="form-note">
        {t('Recorded set reviews')}: {variant.reviewHistory?.length ?? 1}
      </p>
    </details>
  );
}
