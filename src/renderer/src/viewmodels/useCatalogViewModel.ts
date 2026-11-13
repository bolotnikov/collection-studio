import { useEffect, useRef, useState } from 'react';
import type { StudioApi } from '../../../shared/Contracts';
import type { CatalogState } from '../../../shared/CatalogState';

export function useCatalogViewModel(api: StudioApi, refresh: () => Promise<void>) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  const [state, setState] = useState<CatalogState | null>(null);
  const previous = useRef<CatalogState['status'] | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await api.getCatalogStatus();
        if (!alive) return;
        setState(next);
        const before = previous.current;
        previous.current = next.status;
        if (next.status === 'ready' && before && before !== 'ready') await refreshRef.current();
        if (alive) timer = setTimeout(() => void poll(), 2000);
      } catch (error) {
        if (alive)
          setState({
            status: 'failed',
            stage: '',
            done: 0,
            total: 0,
            message: error instanceof Error ? error.message : String(error),
          });
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [api]);
  return { state };
}
