import { CircleCheck, KeyRound } from 'lucide-react';
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
  const {
    key,
    setKey,
    settings,
    setSettings,
    policy,
    setPolicy,
    policySaved,
    policyBusy,
    connection,
    savePolicy,
    saveSettings,
    checkConnection,
  } = useSettingsViewModel(data, busy, api, perform, refresh);
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
      <section className="settings-card">
        <h2>{t('Generation limits')}</h2>
        <p>{t('Every card is verified. Failed checks trigger revisions within these limits.')}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void savePolicy();
          }}
        >
          <div>
            <div>
              <label htmlFor="repair-limit">{t('Revisions per card')}</label>
              <input
                id="repair-limit"
                type="number"
                min={0}
                max={4}
                required
                value={policy.maxRepairsPerCard}
                onChange={(e) => setPolicy({ ...policy, maxRepairsPerCard: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="actions">
            <button type="submit" className="primary" disabled={policyBusy}>
              {t('Save production settings')}
            </button>
          </div>
          {policySaved && (
            <p role="status" className="green">
              {t('Settings saved.')}
            </p>
          )}
          <p className="form-note">{t('Applied to new runs. Existing runs retain their saved policy.')}</p>
        </form>
      </section>
      <details className="settings-card provider-settings">
        <summary>
          <KeyRound size={18} />
          {t('Generation provider')}
        </summary>
        <h2>
          <KeyRound size={20} /> {t('Generation provider')}{' '}
        </h2>
        <label htmlFor="provider">{t('Provider')}</label>
        <select
          id="provider"
          value={settings.provider}
          onChange={(e) => {
            const provider = e.target.value;
            if (provider === 'codex' || provider === 'openai') setSettings((s) => ({ ...s, provider }));
          }}
        >
          <option value="codex">{t('Codex CLI · ChatGPT subscription')}</option>
          <option value="openai">{t('OpenAI API · separate billing')}</option>
        </select>
        {settings.provider === 'codex' && (
          <p>
            {' '}
            {t(
              'Runs your installed Codex CLI signed in with ChatGPT. Images, planning and review use Codex limits. No API key is passed.',
            )}{' '}
          </p>
        )}
        <p>
          {data.hasKey
            ? t('An API key is already configured. Leave blank to retain it.')
            : t('Add an API key to use the OpenAI API provider.')}{' '}
          {t('Keys entered here use system encryption.')}{' '}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveSettings();
          }}
        >
          <label htmlFor="api-key">{t('API key (OpenAI API only)')}</label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={data.hasKey ? t('•••••••• · key configured') : 'sk-…'}
          />
          <details className="advanced">
            <summary>{t('Models and Codex executable')}</summary>
            <label htmlFor="codex-path">{t('Codex executable (blank = auto-detect)')}</label>
            <input
              id="codex-path"
              value={settings.codexPath}
              onChange={(e) => setSettings((s) => ({ ...s, codexPath: e.target.value }))}
            />
            <label htmlFor="codex-model">{t('Codex model · planning & review')}</label>
            <input
              id="codex-model"
              value={settings.codexModel}
              onChange={(e) => setSettings((s) => ({ ...s, codexModel: e.target.value }))}
            />
            <p>{t('Native ImageGen selects its image model automatically.')}</p>
            <label htmlFor="image-model">{t('API image model')}</label>
            <input
              id="image-model"
              required
              value={settings.imageModel}
              onChange={(e) => setSettings((s) => ({ ...s, imageModel: e.target.value }))}
            />
            <label htmlFor="text-model">{t('API planning & review model')}</label>
            <input
              id="text-model"
              required
              value={settings.textModel}
              onChange={(e) => setSettings((s) => ({ ...s, textModel: e.target.value }))}
            />
          </details>
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              {' '}
              {t('Save settings')}{' '}
            </button>
            <button type="button" disabled={busy} onClick={() => void checkConnection()}>
              <CircleCheck size={16} /> {t('Test connection')}{' '}
            </button>
          </div>
        </form>
        {connection && (
          <p className={`connection-result ${connection.ok ? 'green' : 'red'}`}>{text(connection.message)}</p>
        )}
        <p className="form-note">
          {' '}
          {t(
            'Checks saved settings without generating an image. For Codex, sign in with ChatGPT using codex login. API mode requires separate credits.',
          )}{' '}
        </p>
      </details>
    </div>
  );
}
