import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { StudioApi } from '../../../shared/Contracts';
import { ReferenceEditorModel } from './ReferenceEditorModel';

export function useReferenceEditor(api: StudioApi, refresh: () => Promise<void>) {
  // The API is stable; the refresh closure delegates to the same workspace feed.
  const model = useMemo(() => new ReferenceEditorModel(api, refresh), [api]);
  useEffect(() => {
    model.activate();
    return () => model.dispose();
  }, [model]);
  const state = useSyncExternalStore(model.subscribe, model.snapshot);
  return { ...state, model };
}
