import type { StudioApi } from '../../shared/Contracts';
import { useLocalization } from './i18n/LocalizationContext';
import { useCatalogViewModel } from './viewmodels/useCatalogViewModel';

export function CatalogSettings({ api, refresh }: { api: StudioApi; refresh: () => Promise<void> }) {
  const { t, text } = useLocalization();
  const { state } = useCatalogViewModel(api, refresh);
  const running = state?.status === 'running';
  return (
    <section className="settings-card">
      <h2>{t('Knowledge library')}</h2>
      <p>{t('Library changes are saved automatically. Only new images need visual analysis.')}</p>
      {state && (
        <p role="status">
          {t(
            state.status === 'ready'
              ? 'Library ready'
              : running
                ? 'Updating library…'
                : state.status === 'missing'
                  ? 'Library update pending'
                  : state.status === 'cancelled'
                    ? 'Library update pending'
                    : 'Library update failed',
          )}
          {state.total > 0 && (
            <>
              {' '}
              ·{' '}
              {running
                ? text(
                    (
                      {
                        categories: 'Categories',
                        cards: 'Cards',
                        patterns: 'Patterns',
                        sets: 'Sets',
                      } as Record<string, string>
                    )[state.stage] ?? '',
                  )
                : ''}{' '}
              {state.done}/{state.total}
            </>
          )}
        </p>
      )}
      {running && (
        <progress value={state.done} max={Math.max(1, state.total)} aria-label={t('Updating library…')} />
      )}
      {state?.message && <p className="inline-error">{text(state.message)}</p>}
    </section>
  );
}
