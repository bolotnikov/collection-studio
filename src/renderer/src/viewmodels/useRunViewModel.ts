import { useState } from 'react';
import { DeliveryReadiness } from '../../../domain/DeliveryReadiness';
import type { Run, StudioApi } from '../../../shared/Contracts';
import { Assets } from '../Assets';

export function useRunViewModel(
  run: Run,
  api: StudioApi,
  perform: (action: () => Promise<unknown>) => Promise<void>,
  onLibraryChanged: () => Promise<void>,
) {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [tab, setTab] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [budget, setBudget] = useState(run.brief.maxImageCalls);
  const variant =
    run.variants.find((v) => v.id === tab) ??
    run.variants.find((v) => v.id === run.selectedVariantId) ??
    run.variants[0];
  const card = variant?.cards.find((c) => c.id === cardId);
  const evidence = card ? Assets.selected(card)?.evidence : undefined;
  const total = run.brief.variants * 10,
    done = run.variants.flatMap((v) => v.cards).filter((c) => c.selectedAttemptId).length;
  const active = Assets.active(run);
  const complete = DeliveryReadiness.accepts(run, variant);
  const action = (task: () => Promise<unknown>) => void perform(task);
  return {
    diagnosticsOpen,
    setDiagnosticsOpen,
    exportDiagnostics: () => action(() => api.exportDiagnostics(run.id)),
    exportExecutionLog: () => action(() => api.exportExecutionLog(run.id)),
    tab,
    setTab,
    cardId,
    setCardId,
    instruction,
    setInstruction,
    budget,
    setBudget,
    variant,
    card,
    evidence,
    total,
    done,
    active,
    complete,
    pause: () => action(() => api.pause(run.id)),
    resume: () => action(() => api.resume(run.id)),
    exportSet: () => variant && action(() => api.exportRun(run.id, variant.id)),
    selectVariant: () => variant && action(() => api.selectVariant(run.id, variant.id)),
    updateBudget: () => action(() => api.setBudget(run.id, budget)),
    selectAttempt: (id: string) => card && action(() => api.selectAttempt(run.id, card.id, id)),
    approve: () =>
      card &&
      action(async () => {
        await api.approveReference(run.id, card.id);
        await onLibraryChanged();
      }),
    toggleLock: () => card && action(() => api.lock(run.id, card.id, !card.locked)),
    retry: () => card && action(() => api.retry(run.id, card.id, instruction)),
  };
}
