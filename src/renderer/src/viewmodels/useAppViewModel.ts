import { WorkspaceFeed } from './WorkspaceFeed';
import { useEffect, useState, useMemo } from 'react';
import type { Bootstrap, Brief, Run, StudioApi } from '../../../shared/Contracts';
import type { Localization } from '../../../shared/i18n/Localization';
import { Assets } from '../Assets';

export function useAppViewModel(api: StudioApi, t: Localization['t']) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [page, setPage] = useState('new');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Run | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    localStorage.getItem('collection-studio-theme') === 'light' ? 'light' : 'dark',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('collection-studio-theme', theme);
    void api.setAppearance(theme).catch((error) => setNotice({ text: String(error), error: true }));
  }, [theme]);
  const feed = useMemo(
    () => new WorkspaceFeed(api, setData, (error) => setNotice({ text: String(error), error: true })),
    [api],
  );
  useEffect(() => {
    feed.connect();
    return () => feed.dispose();
  }, [feed]);
  useEffect(() => {
    if (data?.catalogReady !== false) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const status = await api.getCatalogStatus();
        if (!alive) return;
        setData((current) => (current ? { ...current, catalogState: status } : current));
        if (status.status === 'ready') await feed.refresh();
        else if (status.status === 'failed') setNotice({ text: status.message, error: true });
        else timer = setTimeout(() => void poll(), 2000);
      } catch (error) {
        if (alive) setNotice({ text: String(error), error: true });
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [api, feed, data?.catalogReady, data?.catalogState?.status]);
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
  const refresh = () => feed.refresh();
  const deleteProject = () =>
    perform(async () => {
      if (!deleting) return;
      await api.deleteRun(deleting.id);
      feed.forget(deleting.id);
      if (page === deleting.id) setPage('new');
      setDeleting(null);
      setNotice({ text: t('Project moved to Trash.'), error: false });
      await refresh();
    });
  const start = (brief: Brief) =>
    perform(async () => {
      const run = await api.start(brief);
      setData((d) => (d ? { ...d, runs: [run, ...d.runs.filter((r) => r.id !== run.id)] } : d));
      setPage(run.id);
    });
  const removeReference = (id: string) =>
    perform(async () => {
      await api.removeReference(id);
      await refresh();
    });
  return {
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
    requestDelete: (run: Run) => setDeleting(run),
    cancelDelete: () => {
      if (!busy) setDeleting(null);
    },
    deleteProject,
    removeReference,
  };
}
