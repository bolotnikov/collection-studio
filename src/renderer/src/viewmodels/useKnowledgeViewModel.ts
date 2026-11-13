import { useEffect, useRef, useState } from 'react';
import type { StudioApi } from '../../../shared/Contracts';
import type {
  KnowledgeKind,
  KnowledgeEdit,
  KnowledgeSnapshot,
} from '../../../shared/KnowledgeEditorContracts';

export function useKnowledgeViewModel(api: StudioApi, refresh: () => Promise<void>) {
  const [data, setData] = useState<KnowledgeSnapshot | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ kind: KnowledgeKind; id: string }[]>([]);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  const alive = useRef(true);
  const load = async () => {
    const next = await api.getKnowledge();
    if (alive.current) setData(next);
    return next;
  };
  useEffect(() => {
    alive.current = true;
    void load().catch((error: unknown) => setError(error instanceof Error ? error.message : String(error)));
    return () => {
      alive.current = false;
    };
  }, [api]);
  useEffect(() => {
    if (!busy && data?.job.status !== 'running') return;
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      void api.getKnowledge().then(
        async (next) => {
          if (!current) return;
          setData(next);
          if (next.job.status !== 'running' && !busy) {
            await refreshRef.current();
          } else timer = setTimeout(poll, 2000);
        },
        (error: unknown) => {
          if (current) {
            setError(String(error));
            timer = setTimeout(poll, 4000);
          }
        },
      );
    };
    timer = setTimeout(poll, 2000);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [api, busy, data?.job.status]);
  const action = async <T>(task: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await task();
      await load();
      await refreshRef.current();
      return result;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      // Imports can persist an image before analysis fails; expose it for correction or removal.
      try {
        await load();
        await refreshRef.current();
      } catch {
        // Keep the original operation error visible.
      }
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return {
    data,
    busy: busy || data?.job.status === 'running',
    error,
    selection: selection.at(-1),
    open: (kind: KnowledgeKind, id: string) => setSelection((items) => [...items, { kind, id }]),
    close: () => setSelection((items) => items.slice(0, -1)),
    save: (edit: KnowledgeEdit) =>
      action(async () => {
        await api.saveKnowledge(edit);
        return true;
      }),
    remove: (kind: KnowledgeKind, id: string) =>
      action(async () => {
        await api.removeKnowledge(kind, id);
        setSelection([]);
      }),
    importCard: () =>
      action(async () => {
        const item = await api.importReference();
        if (item) setSelection([{ kind: 'card', id: item.id }]);
      }),
    importEntity: (input: Parameters<StudioApi['importKnowledge']>[0]) =>
      action(async () => {
        const id = await api.importKnowledge(input);
        if (id) setSelection([{ kind: input.kind, id }]);
        return id;
      }),
  };
}
