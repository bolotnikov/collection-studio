import { Trash2 } from 'lucide-react';
import type { Run } from '../../shared/Contracts';
import { Assets } from './Assets';
import { useLocalization } from './i18n/LocalizationContext';

export function ProjectHistory({
  runs,
  page,
  disabled,
  onOpen,
  onDelete,
}: {
  runs: Run[];
  page: string;
  disabled: boolean;
  onOpen: (id: string) => void;
  onDelete: (run: Run) => void;
}) {
  const { t, text } = useLocalization();
  return (
    <div className="history-list">
      {runs.length === 0 ? (
        <p className="history-empty">
          {t('No collections yet.')}
          <br />
          {t('Create a collection to begin.')}
        </p>
      ) : (
        runs.map((run) => (
          <div key={run.id} className={`history-project ${page === run.id ? 'selected' : ''}`}>
            <button
              className="history-open"
              onClick={() => onOpen(run.id)}
              aria-current={page === run.id ? 'page' : undefined}
            >
              <span className={`run-dot ${run.status}`} />
              <div>
                <strong>{run.brief.theme}</strong>
                <small>
                  {text(Assets.status(run))} ·{' '}
                  {
                    run.variants.flatMap((variant) => variant.cards).filter((card) => card.selectedAttemptId)
                      .length
                  }
                  /{run.brief.variants * 10}
                </small>
              </div>
            </button>
            <button
              className="history-delete icon-button"
              disabled={disabled || Assets.active(run)}
              title={t('Delete project: {name}', { name: run.brief.theme })}
              aria-label={t('Delete project: {name}', { name: run.brief.theme })}
              onClick={() => onDelete(run)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
