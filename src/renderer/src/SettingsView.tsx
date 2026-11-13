import { CircleCheck } from 'lucide-react';
import type { Bootstrap, StudioApi } from '../../shared/Contracts';
import { Localization } from '../../shared/i18n/Localization';
import { useLocalization } from './i18n/LocalizationContext';
import { useSettingsViewModel } from './viewmodels/useSettingsViewModel';

export function SettingsView({
  data,
  theme,
  setTheme,
  busy,
  perform,
  refresh,
  api,
}: {
  data: Bootstrap;
  api: StudioApi;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  busy: boolean;
  perform: (action: () => Promise<unknown>) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const { t, text, preference, setPreference } = useLocalization();
  const { settings, setSettings, setRepairLimit, connection, saveSettings, checkConnection } =
    useSettingsViewModel(data, api, perform, refresh);
  return (
    <div className="settings-page">
      <div className="eyebrow">{t('PREFERENCES')}</div>
      <h1>{t('Workspace settings')}</h1>
      <p className="lead">{t('Interface, generation limits and provider connections.')}</p>
      <section className="settings-card">
        <h2>{t('Interface')}</h2>
        <label htmlFor="language">{t('Language')}</label>
        <select
          id="language"
          value={preference}
          onChange={(e) => setPreference(Localization.preference(e.target.value))}
        >
          <option value="system">{t('Use device language')}</option>
          <option value="en">English</option>
          <option value="ru">Русский</option>
        </select>
        <label htmlFor="color-theme">{t('Appearance')}</label>
        <select
          id="color-theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value === 'light' ? 'light' : 'dark')}
        >
          <option value="dark">{t('Dark')}</option>
          <option value="light">{t('Light')}</option>
        </select>
        <p>{t('Language and appearance changes apply immediately.')}</p>
      </section>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void saveSettings();
        }}
      >
        <section className="settings-card">
          <h2>Codex CLI · ChatGPT</h2>
          <p>
            {t(
              'Install Codex CLI and run codex login in Terminal, choosing Sign in with ChatGPT. Then select Test connection. No source build or Node.js installation is needed to open this app.',
            )}
          </p>
          <label htmlFor="codex-model">{t('Codex model · images & composition checks')}</label>
          <select
            id="codex-model"
            value={settings.codexModel}
            onChange={(event) => {
              const model = event.target.value;
              if (model === 'gpt-6.1-sol' || model === 'gpt-6.1-terra')
                setSettings((value) => ({ ...value, codexModel: model }));
            }}
          >
            <option value="gpt-6.1-terra">GPT-6.1 Terra</option>
            <option value="gpt-6.1-sol">GPT-6.1 Sol</option>
          </select>
          <label htmlFor="planning-model">{t('Collection planning model')}</label>
          <select
            id="planning-model"
            value={settings.planningModel ?? ''}
            onChange={(event) => {
              const model = event.target.value;
              if (model === '' || model === 'gpt-6.1-sol' || model === 'gpt-6.1-terra')
                setSettings((value) => ({ ...value, planningModel: model || undefined }));
            }}
          >
            <option value="">{t('Use Codex model')}</option>
            <option value="gpt-6.1-terra">GPT-6.1 Terra</option>
            <option value="gpt-6.1-sol">GPT-6.1 Sol</option>
          </select>
          <details className="advanced">
            <summary>{t('Codex executable')}</summary>
            <label htmlFor="codex-path">{t('Codex executable (blank = auto-detect)')}</label>
            <input
              id="codex-path"
              value={settings.codexPath}
              onChange={(event) => setSettings((value) => ({ ...value, codexPath: event.target.value }))}
            />
          </details>
          <button type="button" disabled={busy} onClick={() => void checkConnection()}>
            <CircleCheck size={16} /> {t('Test connection')}
          </button>
        </section>
        <section className="settings-card">
          <h2>{t('Automatic image corrections')}</h2>
          <label htmlFor="card-regenerations">{t('Maximum corrections per card')}</label>
          <input
            id="card-regenerations"
            type="number"
            min={0}
            max={150}
            step={1}
            required
            value={settings.maxCardRegenerations}
            onChange={(event) => setRepairLimit('maxCardRegenerations', event.target.valueAsNumber)}
          />
          <p>
            {t(
              'Only clear subject, silhouette, character, category or background violations trigger a card correction.',
            )}
          </p>
          <label htmlFor="set-regeneration-rounds">{t('Maximum correction rounds after set review')}</label>
          <input
            id="set-regeneration-rounds"
            type="number"
            min={0}
            max={150}
            step={1}
            required
            value={settings.maxSetRegenerationRounds}
            onChange={(event) => setRepairLimit('maxSetRegenerationRounds', event.target.valueAsNumber)}
          />
          <p>
            {t(
              'Each round corrects all flagged cards, then checks the complete set again. When enabled, the initial set check runs once.',
            )}
          </p>
          <p>
            {t(
              '0 disables verification and automatic corrections at that stage. Defaults: 0 and 0. Original versions are preserved. The image request budget still applies.',
            )}
          </p>
          <p className="form-note">{t('Applied to new runs. Existing runs retain their saved policy.')}</p>
        </section>
        <button type="submit" className="primary" disabled={busy}>
          {t('Save settings')}
        </button>
        {connection && (
          <p role="status" className={`connection-result ${connection.ok ? 'green' : 'red'}`}>
            {text(connection.message)}
          </p>
        )}
      </form>
    </div>
  );
}
