import { useLocalization } from './i18n/LocalizationContext';
import { useBriefViewModel } from './viewmodels/useBriefViewModel';
import { ArrowUpRight, Sparkles, Layers, LoaderCircle } from 'lucide-react';
import type { Bootstrap, Brief, StudioApi } from '../../shared/Contracts';
import { Assets } from './Assets';

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
        <div className="eyebrow">{t('Create in your game style')}</div>
        <h1>{t('What set do you need?')}</h1>
        <p className="lead">{t('Complete sets matched to your reference library.')}</p>
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
          <div className="suggestions">
            {[t('Detective cinema'), t('Space science fiction'), t('Adventure fantasy')].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setTheme(suggestion)}
                className={theme === suggestion ? 'chosen' : ''}
              >
                {suggestion}
              </button>
            ))}
          </div>
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
          <div className="start-row">
            <button type="submit" className="primary" disabled={disabled || !ready || suggesting}>
              <Sparkles size={18} />
              {t('Generate')}
              <ArrowUpRight size={18} />
            </button>
          </div>
          <p className="form-note">
            {ready
              ? t('{count} cards · automatic review and bounded revisions', {
                  count: Number.isInteger(variants) && variants > 0 ? variants * 10 : 0,
                })
              : t('Configure a provider and prepare the style references.')}
          </p>
        </form>
      </section>
      <aside className="style-column">
        <div className="style-header">
          <span className="eyebrow">{t('Your style')}</span>
          <span className="small-badge">
            <Layers size={12} />
            {data.library.length} {t('references')}
          </span>
        </div>
        <div className="reference-mosaic">
          {data.profile.references.slice(0, 8).map((reference) => (
            <figure key={reference.id} className="reference-tile">
              <img src={Assets.reference(reference.filename)} alt={text(reference.title)} />
            </figure>
          ))}
        </div>
        <h2>{t('Fixed source anchors')}</h2>
        <p>
          {t(
            'References are selected for each subject. Approved examples can supplement the original style.',
          )}
        </p>
        <div className="brief-delivery">
          <strong>{t('Included in every set')}</strong>
          <span>{t('10 cards · all 4 composition categories')}</span>
          <span>{t('Originals, ready-to-use PNGs and review history')}</span>
        </div>
      </aside>
    </div>
  );
}
