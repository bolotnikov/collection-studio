import type { Run, Variant } from '../../shared/Contracts';
import { useLocalization } from './i18n/LocalizationContext';

export function SetPlanDetails({ run, variant }: { run: Run; variant?: Variant }) {
  const { t } = useLocalization();
  if (!run.workflowVersion) return null;
  const contract = variant?.artContract;
  const latest = run.planHistory?.at(-1);
  return (
    <details className="trace">
      <summary>{t('Plan and art direction')}</summary>
      {contract ? (
        <>
          <p>{contract.story}</p>
          <p>
            {t('Category allocation')}:{' '}
            {Object.entries(contract.categoryAllocation)
              .map(([category, count]) => `${category}: ${count}`)
              .join(' · ')}
          </p>
          <dl>
            <dt>{t('Rendering rules')}</dt>
            <dd>{contract.rendering}</dd>
            <dt>{t('Lighting')}</dt>
            <dd>{contract.lighting}</dd>
            <dt>{t('Materials')}</dt>
            <dd>{contract.materialTreatment}</dd>
            <dt>{t('Palette rhythm')}</dt>
            <dd>{contract.paletteRhythm}</dd>
            <dt>{t('Composition')}</dt>
            <dd>{contract.compositionRhythm}</dd>
            <dt>{t('Pilot card')}</dt>
            <dd>
              {variant?.cards[contract.pilotIndex]?.subject} ·{' '}
              {variant?.pilotAttemptId ? t('Verified') : t('Awaiting verification')}
            </dd>
          </dl>
          <p>{contract.pilotRationale}</p>
          <ol>
            {variant?.cards.map((card) => (
              <li key={card.id}>
                {card.subject} · {t('Category')} {card.category} · {card.role}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <ul>
          {latest?.errors.map((error, i) => (
            <li key={i}>{error}</li>
          ))}
          {latest?.reviews
            .flatMap((review) => review.findings)
            .map((finding, i) => (
              <li key={`review-${i}`}>{finding}</li>
            ))}
        </ul>
      )}
    </details>
  );
}
