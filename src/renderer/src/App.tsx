import { Localization } from '../../shared/i18n/Localization';
import { useLocalization } from './i18n/LocalizationContext';
import { useEffect, useState } from 'react';
import {
  Layers,
  Plus,
  Library,
  Settings2,
  ArrowUpRight,
  CircleCheck,
  X,
  FolderOpen,
  LoaderCircle,
  KeyRound,
  Sun,
  Moon,
} from 'lucide-react';
import type { Bootstrap, Settings } from '../../shared/Contracts';
import { BriefForm } from './BriefForm';
import { RunView } from './RunView';
import { Assets } from './Assets';

export function App() {
  const { t, text } = useLocalization();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [page, setPage] = useState('new');
  const [libraryView, setLibraryView] = useState<'source' | 'approved'>('source');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    localStorage.getItem('collection-studio-theme') === 'light' ? 'light' : 'dark',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('collection-studio-theme', theme);
    void window.studio.setAppearance(theme).catch((error) => setNotice({ text: String(error), error: true }));
  }, [theme]);
  useEffect(() => {
    const unsubscribe = window.studio.onRun((run) =>
      setData((current) =>
        current
          ? {
              ...current,
              runs: [run, ...current.runs.filter((r) => r.id !== run.id)].sort((a, b) =>
                b.createdAt.localeCompare(a.createdAt),
              ),
            }
          : current,
      ),
    );
    window.studio
      .bootstrap()
      .then(setData)
      .catch((error) => setNotice({ text: String(error), error: true }));
    return unsubscribe;
  }, []);
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      if (typeof result === 'string') setNotice({ text: t('Saved: {path}', { path: result }), error: false });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : String(error), error: true });
    } finally {
      setBusy(false);
    }
  };
  const active = data?.runs.find(Assets.active);
  const current = data?.runs.find((r) => r.id === page);
  if (!data)
    return (
      <div className="loading">
        <Layers size={36} />
        <h2>Collection Studio</h2>
        <p>{notice?.text ?? t('Loading workspace…')}</p>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Layers size={24} />
          </div>
          <div>
            collection<span>STUDIO</span>
          </div>
        </div>
        <div className="workspace-label">{t('PROJECT')}</div>
        <nav>
          <button className={page === 'new' ? 'active' : ''} onClick={() => setPage('new')}>
            <Plus size={18} /> {t('New set')}
            <span className="nav-shortcut">＋</span>
          </button>
          <button className={page === 'references' ? 'active' : ''} onClick={() => setPage('references')}>
            <Library size={18} /> {t('Style library')}{' '}
          </button>
        </nav>
        <div className="history-heading">
          {' '}
          {t('SETS')} <span>{data.runs.length.toString().padStart(2, '0')}</span>
        </div>
        <div className="history-list">
          {data.runs.length === 0 ? (
            <p className="history-empty">
              {' '}
              {t('No collections yet.')} <br /> {t('Create a collection to begin.')}{' '}
            </p>
          ) : (
            data.runs.map((r) => (
              <button key={r.id} className={page === r.id ? 'active' : ''} onClick={() => setPage(r.id)}>
                <span className={`run-dot ${r.status}`} />
                <div>
                  <strong>{r.brief.theme}</strong>
                  <small>
                    {text(Assets.status(r))} ·{' '}
                    {r.variants.flatMap((v) => v.cards).filter((c) => c.selectedAttemptId).length}/
                    {r.brief.variants * 10}
                  </small>
                </div>
                <ArrowUpRight size={13} />
              </button>
            ))
          )}
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setPage('settings')} className={page === 'settings' ? 'active' : ''}>
            <Settings2 size={17} /> {t('Settings')}{' '}
          </button>
          <div className="account">
            <div className="avatar">A</div>
            <div>
              <strong>{t('Local workspace')}</strong>
              <small>
                <span
                  className={`tiny-dot ${(data.settings.provider === 'codex' ? data.codexReady : data.hasKey) ? '' : 'offline'}`}
                />
                {data.settings.provider === 'codex'
                  ? data.codexReady
                    ? 'Codex · ChatGPT'
                    : t('Codex not connected')
                  : data.hasKey
                    ? t('OpenAI API connected')
                    : t('API not configured')}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            {' '}
            {t('Workspace')} <span className="slash">/</span>{' '}
            <strong>
              {page === 'new'
                ? t('New set')
                : page === 'references'
                  ? t('Style library')
                  : page === 'settings'
                    ? t('Settings')
                    : current?.brief.theme}
            </strong>
          </span>
          <span className="top-status">
            {active ? (
              <>
                <LoaderCircle size={13} className="spin" /> {t('Processing')}{' '}
              </>
            ) : (
              <>
                <span className="tiny-dot" /> {t('Ready')}{' '}
              </>
            )}
            <div className="theme-switch" role="group" aria-label={t('Appearance')}>
              <button
                aria-pressed={theme === 'dark'}
                className={theme === 'dark' ? 'selected' : ''}
                onClick={() => setTheme('dark')}
              >
                <Moon size={13} /> {t('Dark')}{' '}
              </button>
              <button
                aria-pressed={theme === 'light'}
                className={theme === 'light' ? 'selected' : ''}
                onClick={() => setTheme('light')}
              >
                <Sun size={13} /> {t('Light')}{' '}
              </button>
            </div>
          </span>
        </header>
        <div className="main-content">
          {notice && (
            <div role="alert" className={`notice ${notice.error ? 'error' : 'success'}`}>
              <span>{text(notice.text)}</span>
              <button
                className="icon-button"
                aria-label={t('Dismiss notification')}
                onClick={() => setNotice(null)}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === 'new' && (
            <BriefForm
              data={data}
              disabled={busy || Boolean(active)}
              onStart={async (brief) =>
                perform(async () => {
                  const run = await window.studio.start(brief);
                  setData((d) => (d ? { ...d, runs: [run, ...d.runs.filter((r) => r.id !== run.id)] } : d));
                  setPage(run.id);
                })
              }
            />
          )}
          {current && (
            <RunView
              key={current.id}
              run={current}
              profile={data.profile}
              busy={busy}
              perform={perform}
              onLibraryChanged={async () => setData(await window.studio.bootstrap())}
            />
          )}
          {page === 'references' && (
            <div className="library-page">
              <div className="eyebrow">{t('ASSETS / SOURCE ART')}</div>
              <h1>{t('Style library')}</h1>
              <p className="lead">
                {' '}
                {t(
                  'Original source art stays the style authority. Your approved images add useful examples.',
                )}{' '}
              </p>
              <div className="library-switch" role="group" aria-label={t('Reference collection')}>
                <button
                  aria-pressed={libraryView === 'source'}
                  className={libraryView === 'source' ? 'selected' : ''}
                  onClick={() => setLibraryView('source')}
                >
                  {t('Source art')} <span>{data.anchorReferences.length}</span>
                </button>
                <button
                  aria-pressed={libraryView === 'approved'}
                  className={libraryView === 'approved' ? 'selected' : ''}
                  onClick={() => setLibraryView('approved')}
                >
                  {t('Approved examples')} <span>{data.userReferences.length}</span>
                </button>
              </div>
              {libraryView === 'source' && (
                <>
                  <h2>{t('Source art')}</h2>
                  <p className="form-note">
                    {t(
                      'The source archive is searched during preparation. Category labels appear after analysis.',
                    )}
                  </p>
                  <div className="library-grid">
                    {data.anchorReferences.map((r) => (
                      <figure key={r.id}>
                        <img loading="lazy" src={Assets.reference(r.filename)} alt={text(r.title)} />
                        <figcaption>
                          <strong>{text(r.title)}</strong>
                          <span>
                            {r.tags.includes('exclude:ordinary-card-generation')
                              ? t('Excluded from generation')
                              : r.category === 'unknown'
                                ? t('Pending analysis')
                                : `${t('Category')} ${r.category}`}
                          </span>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </>
              )}
              {libraryView === 'approved' && (
                <section className="curated-library">
                  <h2>
                    {t('Approved examples')} <span className="muted">{data.userReferences.length}</span>
                  </h2>
                  {data.userReferences.length === 0 ? (
                    <p className="lead">
                      {t('Approve a generated card and save it here from its detail view.')}
                    </p>
                  ) : (
                    <div className="library-grid">
                      {data.userReferences.map((reference) => (
                        <figure key={reference.id}>
                          <img
                            loading="lazy"
                            src={Assets.reference(reference.filename)}
                            alt={reference.title}
                          />
                          <figcaption>
                            <strong>{reference.title}</strong>
                            <span>
                              {t('Category')} {reference.category}
                            </span>
                            <button
                              disabled={busy || Boolean(active)}
                              onClick={() =>
                                void perform(async () => {
                                  await window.studio.removeReference(reference.id);
                                  setData(await window.studio.bootstrap());
                                })
                              }
                            >
                              {t('Remove from library')}
                            </button>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </section>
              )}
              <details className="library-guidance">
                <summary>{t('Rendering rules')}</summary>
                <div className="library-rules">
                  <div>
                    <h2>{t('Rendering rules')}</h2>
                    <ul>
                      {data.profile.rules.map((r) => (
                        <li key={r}>{text(r)}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h2>{t('Composition categories')}</h2>
                    {Object.entries(data.profile.categories).map(([n, d]) => (
                      <p key={n}>
                        <b>{n.padStart(2, '0')}</b> {text(d)}
                      </p>
                    ))}
                  </div>
                </div>
              </details>
            </div>
          )}
          {page === 'settings' && (
            <SettingsView
              data={data}
              theme={theme}
              setTheme={setTheme}
              busy={busy}
              perform={perform}
              refresh={async () => setData(await window.studio.bootstrap())}
            />
          )}
        </div>
        <footer className="app-footer">
          <span>COLLECTION STUDIO</span>
          <span>{t('Reference-guided card production')}</span>
        </footer>
      </main>
    </div>
  );
}

function SettingsView({
  data,
  theme,
  setTheme,
  busy,
  perform,
  refresh,
}: {
  data: Bootstrap;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  busy: boolean;
  perform: (action: () => Promise<unknown>) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const { t, text, preference, setPreference } = useLocalization();
  const [key, setKey] = useState('');
  const [settings, setSettings] = useState<Settings>(data.settings);
  const [policy, setPolicy] = useState(data.productionPolicy);
  const [rules, setRules] = useState<string>(data.productionPolicy.rules.join('\n'));
  const [policySaved, setPolicySaved] = useState(false);
  const policyBusy = busy || data.runs.some(Assets.active);
  const [connection, setConnection] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="settings-page">
      <div className="eyebrow">{t('PREFERENCES')}</div>
      <h1>{t('Workspace settings')}</h1>
      <p className="lead">{t('Generation providers and local storage.')}</p>
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
        <h2>{t('Style production')}</h2>
        <p>{t('Every card is verified. Failed checks trigger revisions within these limits.')}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void perform(async () => {
              await window.studio.saveProductionPolicy({
                ...policy,
                rules: rules
                  .split('\n')
                  .map((rule) => rule.trim())
                  .filter(Boolean),
              });
              await refresh();
              setPolicySaved(true);
            });
          }}
        >
          <div className="form-pair">
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
            <div>
              <label htmlFor="reference-limit">{t('Reference images per request')}</label>
              <input
                id="reference-limit"
                type="number"
                min={4}
                max={12}
                required
                value={policy.referenceLimit}
                onChange={(e) => setPolicy({ ...policy, referenceLimit: Number(e.target.value) })}
              />
            </div>
          </div>
          <label htmlFor="style-threshold">{t('Minimum style score')}</label>
          <select
            id="style-threshold"
            value={policy.styleThreshold}
            onChange={(e) => setPolicy({ ...policy, styleThreshold: Number(e.target.value) })}
          >
            <option value={4}>4 / 5</option>
            <option value={5}>5 / 5</option>
          </select>
          <details className="advanced">
            <summary>{t('Additional art rules')}</summary>
            <p>{t('One rule per line. Assignment requirements and original anchors always apply.')}</p>
            <textarea
              rows={7}
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              aria-label={t('Additional art rules')}
            />
          </details>
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
            void perform(async () => {
              await window.studio.saveSettings(settings, key);
              setKey('');
              await refresh();
              setConnection({ ok: true, message: t('Settings saved.') });
            });
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
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  setConnection(await window.studio.checkConnection());
                  await refresh();
                })
              }
            >
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
      <details className="settings-card data-settings">
        <summary>
          <FolderOpen size={18} />
          {t('Data and resources')}
        </summary>
        <h2>
          <FolderOpen size={20} /> {t('Data and resources')}{' '}
        </h2>
        <p>{t('Results and production history are stored on this computer.')}</p>
        <code className="data-path">{data.dataPath}</code>
        <p>
          {' '}
          {t('Prepared references:')} {data.referenceCount} / {data.profile.references.length}
          {t('. Profile:')} {text(data.profile.name)}.
        </p>
        <p className="form-note">
          {' '}
          {t(
            'Each set export includes ten PNG cards, masters, a contact sheet, versions and a production report.',
          )}{' '}
        </p>
      </details>
    </div>
  );
}
