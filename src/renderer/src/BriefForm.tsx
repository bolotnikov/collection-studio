import { useLocalization } from './i18n/LocalizationContext';
import { useBriefViewModel } from './viewmodels/useBriefViewModel';
import { ArrowUpRight, Sparkles, LoaderCircle } from 'lucide-react';
import type { Bootstrap, Brief, StudioApi } from '../../shared/Contracts';

export function BriefForm({
  data,
  disabled,
  onStart,
  api,
}: {
  api: StudioApi;
  data: Bootstrap;
  disabled: boolean;
  onStart: (brief: Brief) => Promise<void>;
}) {
  const { t, text } = useLocalization();
  const {
    theme,
    setTheme,
    wishes,
    setWishes,
    variants,
    setVariants,
    includeGold,
    setIncludeGold,
    ready,
    submit,
    canSuggest,
    suggesting,
    suggest,
    error,
  } = useBriefViewModel(data, onStart, api);
  return (
    <div className="new-layout focused-brief">
      <section className="brief-column">
        <h1>{t('Create a new set')}</h1>
        <form onSubmit={submit} className="brief-form">
          <label htmlFor="theme">{t('Set theme')}</label>
          <input
            id="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            minLength={2}
            maxLength={180}
            required
            placeholder={t('For example, space science fiction')}
          />
          <div className="art-direction-label">
            <label htmlFor="wishes">
              {t('Art direction')} <span className="muted">{t('Optional')}</span>
            </label>
            <button
              type="button"
              className="ai-suggest"
              disabled={disabled || !canSuggest}
              title={t(
                theme.trim().length < 2 ? 'Enter a set theme first' : 'Generate art direction with AI',
              )}
              aria-label={t('Generate art direction with AI')}
              aria-busy={suggesting}
              onClick={() => void suggest()}
            >
              {suggesting ? <LoaderCircle size={12} className="spin" /> : <Sparkles size={12} />} AI
            </button>
          </div>
          <textarea
            id="wishes"
            value={wishes}
            onChange={(e) => setWishes(e.target.value)}
            maxLength={3000}
            rows={5}
            placeholder={t('Mood, objects, materials, constraints…')}
          />
          {error && (
            <p className="inline-error" role="alert">
              {text(error)}
            </p>
          )}
          <label htmlFor="set-count">{t('Sets to generate')}</label>
          <input
            id="set-count"
            type="number"
            min={1}
            max={5}
            step={1}
            required
            value={Number.isNaN(variants) ? '' : variants}
            onChange={(event) => setVariants(event.currentTarget.valueAsNumber)}
            className="set-count-input"
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={includeGold}
              onChange={(event) => setIncludeGold(event.target.checked)}
            />
            {t('Include gold cards')}
          </label>
          <div className="start-row">
            <button type="submit" className="primary" disabled={disabled || !ready || suggesting}>
              <Sparkles size={18} />
              {t('Generate')}
              <ArrowUpRight size={18} />
            </button>
          </div>
          {!data.codexReady && (
            <p role="status" className="form-note">
              {text(data.codexMessage || 'Connect Codex CLI with ChatGPT in Settings.')}
            </p>
          )}
          {data.catalogReady === false && (
            <p
              role={data.catalogState?.status === 'failed' ? 'alert' : 'status'}
              className={data.catalogState?.status === 'failed' ? 'inline-error' : 'form-note'}
            >
              {data.catalogState?.status === 'failed'
                ? t('Library unavailable: {reason}', { reason: text(data.catalogState.message) })
                : t('Preparing the knowledge library…')}
              {data.catalogState?.status === 'running' &&
                data.catalogState.total > 0 &&
                ` ${data.catalogState.done}/${data.catalogState.total}`}
            </p>
          )}
          <p className="form-note">
            {ready
              ? t('{count} cards · automatic review and bounded revisions', {
                  count: Number.isInteger(variants) && variants > 0 ? variants * 10 : 0,
                })
              : data.catalogReady === false
                ? null
                : t('Configure a provider and prepare the style references.')}
          </p>
        </form>
      </section>
    </div>
  );
}
