import { WorkspaceFeed } from './WorkspaceFeed';
import { useEffect, useState, useMemo } from 'react';
import type { Bootstrap, Brief, StudioApi } from '../../../shared/Contracts';
import type { Localization } from '../../../shared/i18n/Localization';
import { Assets } from '../Assets';

export function useAppViewModel(api: StudioApi, t: Localization['t']) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [page, setPage] = useState('new');
  const [libraryView, setLibraryView] = useState<'source' | 'approved' | 'knowledge'>('source');
  const [busy, setBusy] = useState(false);
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
  };
}
