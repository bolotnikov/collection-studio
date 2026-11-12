import { useLocalization } from './i18n/LocalizationContext';
import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Sparkles, Layers } from 'lucide-react';
import type { Bootstrap, Brief } from '../../shared/Contracts';
import { Assets } from './Assets';

export function BriefForm({
  data,
  disabled,
  onStart,
}: {
  data: Bootstrap;
  disabled: boolean;
  onStart: (brief: Brief) => Promise<void>;
}) {
  const { t, text } = useLocalization();
  const [theme, setTheme] = useState('');
  const [wishes, setWishes] = useState('');
  const ready =
    data.codexReady &&
    (data.settings.provider === 'codex' ? data.codexReady : data.hasKey) &&
    data.referenceCount > 0;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onStart({
      theme,
      wishes,
      variants: 3,
      quality: 'low',
      autoRepair: true,
      maxImageCalls: Math.min(150, 30 * (1 + data.productionPolicy.maxRepairsPerCard)),
    });
  };
  return (
    <div className="new-layout focused-brief">
      <section className="brief-column">
        <div className="eyebrow">{t('Create in your game style')}</div>
        <h1>{t('What set do you need?')}</h1>
        <p className="lead">{t('Three complete options. Matched to your reference library.')}</p>
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
          <label htmlFor="wishes">
            {t('Art direction')} <span className="muted">{t('Optional')}</span>
          </label>
          <textarea
            id="wishes"
            value={wishes}
            onChange={(e) => setWishes(e.target.value)}
            maxLength={3000}
            rows={5}
            placeholder={t('Mood, objects, materials, constraints…')}
          />
          <div className="start-row">
            <button type="submit" className="primary" disabled={disabled || !ready}>
              <Sparkles size={18} />
              {t('Generate set options')}
              <ArrowUpRight size={18} />
            </button>
          </div>
          <p className="form-note">
            {ready
              ? t('30 cards · automatic review and bounded revisions')
              : t('Configure a provider and prepare the style references.')}
          </p>
        </form>
      </section>
      <aside className="style-column">
        <div className="style-header">
          <span className="eyebrow">{t('Your style')}</span>
          <span className="small-badge">
            <Layers size={12} />
            {data.anchorReferences.length} {t('references')}
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
