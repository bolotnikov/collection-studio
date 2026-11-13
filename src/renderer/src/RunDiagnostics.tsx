import type { Run, Variant } from '../../shared/Contracts';
import { useLocalization } from './i18n/LocalizationContext';
import { SetPlanDetails } from './SetPlanDetails';
import { SetReviewDetails } from './SetReviewDetails';
import { Modal } from './Modal';

export function RunDiagnostics({
  run,
  variant,
  onClose,
  onDownload,
  budget,
  onBudget,
  onUpdateBudget,
  busy,
  active,
}: {
  run: Run;
  variant?: Variant;
  onClose: () => void;
  onDownload: () => void;
  budget: number;
  onBudget: (value: number) => void;
  onUpdateBudget: () => void;
  busy: boolean;
  active: boolean;
}) {
  const { t, text, locale } = useLocalization();
  return (
    <Modal title={t('Diagnostics')} onClose={onClose}>
      <div className="diagnostics-toolbar">
        <p>
          {t('Internal checks and production history. Scores are model judgments, not quality guarantees.')}
        </p>
        <button disabled={busy} onClick={onDownload}>
          {t('Download diagnostics')}
        </button>
      </div>
      {variant && (
        <section>
          <h3>{t('SET REVIEW')}</h3>
          <ul>
            {variant.review?.findings.map((finding, index) => (
              <li key={index}>{finding}</li>
            ))}
          </ul>
          {variant.reviewError && <p className="inline-error">{text(variant.reviewError)}</p>}
          {variant.review && (
            <p>
              {t('Coherence:')} {variant.review.coherence}/5
            </p>
          )}
          <SetReviewDetails variant={variant} />
        </section>
      )}
      <SetPlanDetails run={run} variant={variant} />
      <h3>{t('Production log & limits')}</h3>
      <p>{run.brief.wishes}</p>
      <div className="budget-controls">
        <label htmlFor="run-budget">{t('Image request limit')}</label>
        <input
          id="run-budget"
          type="number"
          min={Math.max(run.imageCalls, run.brief.variants * 10)}
          max={150}
          value={budget}
          onChange={(event) => onBudget(Number(event.target.value))}
        />
        <button disabled={busy || active || budget === run.brief.maxImageCalls} onClick={onUpdateBudget}>
          {t('Update limit')}
        </button>
      </div>
      <div className="diagnostics-events">
        {run.events.map((event, index) => (
          <div key={index}>
            <time>{new Date(event.at).toLocaleTimeString(locale)}</time>
            <span>{text(event.message)}</span>
          </div>
        ))}
      </div>
      <p>
        {t('Provider:')} {run.provider} {t('· Images:')} {run.imageModel} {t('· Planning / review:')}{' '}
        {run.textModel} {t('· Run:')} {run.id}
      </p>
    </Modal>
  );
}
