import { Localization } from '../../shared/i18n/Localization';
import { StyleRulesView } from './StyleRulesView';
import { CatalogSettings } from './CatalogSettings';
import { KnowledgeView } from './KnowledgeView';
import { useLocalization } from './i18n/LocalizationContext';
import {
  Paintbrush,
  Layers,
  Plus,
  Library,
  Database,
  ChevronRight,
  Settings2,
  Trash2,
  X,
  LoaderCircle,
  Sun,
  Moon,
} from 'lucide-react';
import type { StudioApi } from '../../shared/Contracts';
import { SettingsView } from './SettingsView';
import { useAppViewModel } from './viewmodels/useAppViewModel';
import { BriefForm } from './BriefForm';
import { RunView } from './RunView';
import { ProjectHistory } from './ProjectHistory';
import { Modal } from './Modal';

export function App({ api }: { api: StudioApi }) {
  const { t, text, preference, setPreference } = useLocalization();
  const {
    data,
    page,
    setPage,
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
    deleting,
    requestDelete,
    cancelDelete,
    deleteProject,
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
        <button
          className="new-set-action"
          aria-current={page === 'new' ? 'page' : undefined}
          onClick={() => setPage('new')}
        >
          <Plus size={18} /> {t('New set')}
        </button>
        <div className="history-heading">
          {' '}
          {t('PROJECTS')} <span>{data.runs.length.toString().padStart(2, '0')}</span>
        </div>
        <ProjectHistory
          runs={data.runs}
          page={page}
          disabled={busy || Boolean(active)}
          onOpen={setPage}
          onDelete={requestDelete}
        />
        <details
          className={`knowledge-navigation ${['cards', 'sets', 'categories', 'style'].includes(page) ? 'is-current' : ''}`}
        >
          <summary>
            <Database size={17} />
            <span>{t('Knowledge base')}</span>
            <ChevronRight size={14} className="knowledge-chevron" />
          </summary>
          <nav aria-label={t('Knowledge base')}>
            {(['cards', 'sets', 'categories'] as const).map((key) => (
              <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>
                <Library size={17} />
                {t(({ cards: 'Cards', sets: 'Sets', categories: 'Categories' } as const)[key])}
              </button>
            ))}
            <button className={page === 'style' ? 'active' : ''} onClick={() => setPage('style')}>
              <Paintbrush size={17} /> {t('Style')}
            </button>
          </nav>
        </details>
        <div className="sidebar-bottom">
          <button onClick={() => setPage('settings')} className={page === 'settings' ? 'active' : ''}>
            <Settings2 size={17} /> {t('Settings')}{' '}
          </button>
          <div className="account">
            <div className="avatar">A</div>
            <div>
              <strong>{t('Local workspace')}</strong>
              <small>
                <span className={`tiny-dot ${data.codexReady ? '' : 'offline'}`} />
                {data.codexReady ? 'Codex · ChatGPT' : t('Codex not connected')}
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
                : ['cards', 'sets', 'categories'].includes(page)
                  ? text({ cards: 'Cards', sets: 'Sets', categories: 'Categories' }[page] ?? '')
                  : page === 'style'
                    ? t('Style')
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
            <select
              className="header-language"
              aria-label={t('Language')}
              value={preference}
              onChange={(event) => setPreference(Localization.preference(event.target.value))}
            >
              <option value="system">{t('Use device language')}</option>
              <option value="en">English</option>
              <option value="ru">Русский</option>
            </select>
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
          {(['cards', 'sets', 'categories'] as const)
            .filter((key) => page === key)
            .map((key) => (
              <KnowledgeView
                workspace={data}
                key={key}
                api={api}
                kind={key === 'cards' ? 'card' : key === 'sets' ? 'set' : 'category'}
                refresh={refresh}
              />
            ))}
          {page === 'style' && (
            <section className="style-page">
              <h1>{t('Style')}</h1>
              <StyleRulesView data={data} api={api} refresh={refresh} />
              <CatalogSettings api={api} refresh={refresh} />
            </section>
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
      {deleting && (
        <Modal title={t('Delete project')} onClose={cancelDelete} compact>
          <div className="delete-project-content">
            <p>
              <strong>{deleting.brief.theme}</strong>
            </p>
            <p>
              {t(
                'The project and its generated images will move to Trash. References saved in the library and exported files will remain.',
              )}
            </p>
            {notice?.error && (
              <p role="alert" className="inline-error">
                {text(notice.text)}
              </p>
            )}
            <div className="actions">
              <button disabled={busy} onClick={cancelDelete}>
                {t('Cancel')}
              </button>
              <button className="danger-button" disabled={busy || Boolean(active)} onClick={deleteProject}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
                {t('Delete project')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
