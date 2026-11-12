import { ReferenceGallery } from './ReferenceGallery';
import { StyleRulesView } from './StyleRulesView';
import { SetReferenceView } from './SetReferenceView';
import { useLocalization } from './i18n/LocalizationContext';
import { Layers, Plus, Library, Settings2, ArrowUpRight, X, LoaderCircle, Sun, Moon } from 'lucide-react';
import type { StudioApi } from '../../shared/Contracts';
import { SettingsView } from './SettingsView';
import { useAppViewModel } from './viewmodels/useAppViewModel';
import { BriefForm } from './BriefForm';
import { RunView } from './RunView';
import { Assets } from './Assets';

export function App({ api }: { api: StudioApi }) {
  const { t, text } = useLocalization();
  const {
    data,
    page,
    setPage,
    libraryView,
    setLibraryView,
    busy,
    notice,
    setNotice,
    theme,
    setTheme,
    perform,
    active,
    current,
    refresh,
    start,
    removeReference,
  } = useAppViewModel(api, t);
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
            <BriefForm api={api} data={data} disabled={busy || Boolean(active)} onStart={start} />
          )}
          {current && (
            <RunView
              key={current.id}
              run={current}
              profile={data.profile}
              busy={busy}
              perform={perform}
              onLibraryChanged={refresh}
              api={api}
            />
          )}
          {page === 'references' && (
            <div className="library-page">
              <div className="eyebrow">{t('ASSETS / SOURCE ART')}</div>
              <h1>{t('Style library')}</h1>
              <p className="lead">
                {' '}
                {t('Manage reference art, set examples and the rules used for generation.')}{' '}
              </p>
              <div className="library-switch" role="group" aria-label={t('Reference collection')}>
                <button
                  aria-pressed={libraryView === 'source'}
                  className={libraryView === 'source' ? 'selected' : ''}
                  onClick={() => setLibraryView('source')}
                >
                  {t('Reference art')} <span>{data.library.length}</span>
                </button>
                {data.profile.knowledge && (
                  <button
                    aria-pressed={libraryView === 'knowledge'}
                    className={libraryView === 'knowledge' ? 'selected' : ''}
                    onClick={() => setLibraryView('knowledge')}
                  >
                    {t('Set references')}
                  </button>
                )}
                <button
                  aria-pressed={libraryView === 'rules'}
                  className={libraryView === 'rules' ? 'selected' : ''}
                  onClick={() => setLibraryView('rules')}
                >
                  {t('Generation rules')}
                </button>
              </div>
              {libraryView === 'knowledge' && data.profile.knowledge && (
                <SetReferenceView corpus={data.profile.knowledge} />
              )}
              {libraryView === 'source' && (
                <ReferenceGallery
                  items={data.library}
                  api={api}
                  refresh={refresh}
                  canAnalyze={data.codexReady}
                  disabled={busy}
                  onRemove={(id) => void removeReference(id)}
                />
              )}
              {libraryView === 'rules' && <StyleRulesView data={data} api={api} refresh={refresh} />}
            </div>
          )}
          {page === 'settings' && (
            <SettingsView
              data={data}
              theme={theme}
              setTheme={setTheme}
              busy={busy}
              perform={perform}
              refresh={refresh}
              api={api}
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
