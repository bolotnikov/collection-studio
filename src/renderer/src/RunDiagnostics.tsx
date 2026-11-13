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
        <p>{t('Technical details of composition checks and production history.')}</p>
        <button disabled={busy} onClick={onDownload}>
          {t('Download diagnostics')}
        </button>
      </div>
      {Boolean(run.qualityWarnings?.length) && (
        <section>
          <h3>{t('Quality warnings')}</h3>
          <ul>
            {run.qualityWarnings?.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </section>
      )}
      {run.reviewProtocol === 'composition-v1' && variant && (
        <section>
          <h3>{t('Composition checks')}</h3>
          {variant.cards.map((card, index) => {
            const attempt = card.attempts.find((item) => item.id === card.selectedAttemptId);
            return (
              <details key={card.id}>
                <summary>
                  {index + 1}. {card.subject}
                </summary>
                <pre>
                  {JSON.stringify(
                    attempt?.compositionCheck ?? {
                      skipped: attempt?.compositionCheckSkipped,
                      error: attempt?.compositionCheckError,
                    },
                    null,
                    2,
                  )}
                </pre>
                {Boolean(card.repairRequests?.length) && (
                  <details>
                    <summary>{t('Repair history')}</summary>
                    <pre>{JSON.stringify(card.repairRequests, null, 2)}</pre>
                  </details>
                )}
              </details>
            );
          })}
          {Boolean(variant.gridReviewHistory?.length) && (
            <details>
              <summary>{t('Set composition review history')}</summary>
              <pre>
                {JSON.stringify(
                  {
                    policy: run.repairPolicy,
                    reviews: variant.gridReviewHistory,
                    rounds: variant.gridRepairRounds,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          )}
        </section>
      )}
      {run.reviewProtocol !== 'composition-v1' && variant && (
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
