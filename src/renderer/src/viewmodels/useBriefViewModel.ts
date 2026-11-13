import { useEffect, useMemo, useSyncExternalStore, type FormEvent } from 'react';
import type { Bootstrap, Brief, StudioApi } from '../../../shared/Contracts';
import { BriefViewModel } from './BriefViewModel';

export function useBriefViewModel(data: Bootstrap, onStart: (brief: Brief) => Promise<void>, api: StudioApi) {
  const model = useMemo(() => new BriefViewModel(api), [api]);
  useEffect(() => {
    model.activate();
    return () => model.dispose();
  }, [model]);
  const state = useSyncExternalStore(model.subscribe, model.snapshot);
  const textReady = data.codexReady;
  const ready = data.codexReady && textReady && data.referenceCount > 0 && data.catalogReady !== false;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (state.suggesting) return;
    void onStart({
      theme: state.theme,
      wishes: state.wishes,
      variants: state.variants,
      quality: 'high',
      autoRepair: false,
      includeGold: state.includeGold,
      maxImageCalls: Math.min(150, state.variants * 30),
    });
  };
  return {
    ...state,
    setTheme: model.setTheme,
    setWishes: model.setWishes,
    setVariants: model.setVariants,
    setIncludeGold: model.setIncludeGold,
    ready,
    submit,
    canSuggest: textReady && state.theme.trim().length >= 2 && !state.suggesting,
    suggest: () => model.suggest(),
  };
}
