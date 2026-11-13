import { useState, useEffect } from 'react';
import { DeliveryReadiness } from '../../../domain/DeliveryReadiness';
import type { Run, StudioApi, Profile } from '../../../shared/Contracts';
import { Assets } from '../Assets';
import { ReferencePresentation } from './ReferencePresentation';
import { SetComposition } from '../../../domain/SetComposition';

export function useRunViewModel(
  run: Run,
  api: StudioApi,
  perform: (action: () => Promise<unknown>) => Promise<void>,
  onLibraryChanged: () => Promise<void>,
  initialProfile: Profile,
) {
  const [profile, setProfile] = useState(initialProfile);
  const [referencesReady, setReferencesReady] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void api.getRunProfile(run.id).then(
      (value) => {
        if (current) {
          setProfile(value);
          setReferencesReady(true);
        }
      },
      (error: unknown) => {
        if (current) setReferenceError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      current = false;
    };
  }, [api, run.id]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [tab, setTabIndex] = useState<number | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [budget, setBudget] = useState(run.brief.maxImageCalls);
  const tabs = Array.from({ length: run.brief.variants }, (_, index) => ({
    index,
    title:
      run.variants[index]?.title ??
      run.compositionDraft?.blueprints?.[index]?.title ??
      run.compositionDraft?.assignedSubjects?.variants.find((entry) => entry.variantIndex === index)?.title,
    selectedForDelivery: run.variants[index]?.id === run.selectedVariantId,
  }));
  const selectedIndex =
    tab !== null && tabs[tab]
      ? tab
      : Math.max(
          0,
          run.variants.findIndex((v) => v.id === run.selectedVariantId),
        );
  const variant = run.variants[selectedIndex];
  const blueprint = run.compositionDraft?.blueprints?.[selectedIndex];
  const slotPlan = run.compositionDraft?.slotPlans?.[selectedIndex];
  const setTab = (index: number) => {
    if (!tabs[index]) return;
    setTabIndex(index);
    setCardId(null);
    setInstruction('');
  };
  const card = variant?.cards.find((c) => c.id === cardId);
  const evidence = card ? Assets.selected(card)?.evidence : undefined;
  const target = card && variant ? SetComposition.target(variant, card) : undefined;
  const usedReferences =
    referencesReady && card ? ReferencePresentation.used(profile, run, card, Assets.selected(card)) : [];
  const plannedReferences = referencesReady ? ReferencePresentation.planned(profile, target) : [];
  const referenceCandidates = referencesReady ? ReferencePresentation.candidates(profile, target) : [];
  const total = run.brief.variants * 10,
    done = run.variants.flatMap((v) => v.cards).filter((c) => c.selectedAttemptId).length;
  const active = Assets.active(run);
  const complete = DeliveryReadiness.accepts(run, variant);
  const action = (task: () => Promise<unknown>) => void perform(task);
  return {
    profile,
    referencesReady,
    referenceError,
    usedReferences,
    plannedReferences,
    referenceCandidates,
    comparisonReference:
      usedReferences.find((reference) => reference.role === 'Composition reference') ?? usedReferences[0],
    diagnosticsOpen,
    setDiagnosticsOpen,
    exportDiagnostics: () => action(() => api.exportDiagnostics(run.id)),
    exportExecutionLog: () => action(() => api.exportExecutionLog(run.id)),
    tabs,
    selectedIndex,
    blueprint,
    slotPlan,
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
