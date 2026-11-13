import { useEffect, useRef, useState } from 'react';
import type { CompositionTarget } from '../../../shared/CompositionContract';
import { SlotTagContracts, type SlotTagEdit, type SlotTagFacets } from '../../../shared/SlotTagContracts';
import { SlotTagRules } from '../../../domain/SlotTagRules';
import { VisualPatterns } from '../../../domain/VisualPatterns';

export function useSlotTagEditor(
  target: CompositionTarget,
  revision: number,
  save: (edit: SlotTagEdit) => Promise<void>,
  onPendingChange: (pending: boolean) => void,
) {
  const initial = () =>
    SlotTagContracts.facets.parse(
      Object.fromEntries(
        Object.entries({ ...target.required, ...target.appearance }).filter(
          ([key]) => key !== 'characterCount',
        ),
      ),
    );
  const [state, setState] = useState(() => ({ facets: initial(), baseline: initial(), revision }));
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      onPendingChange(false);
    };
  }, [onPendingChange]);
  const dirty = SlotTagContracts.axis.options.some((key) => state.facets[key] !== state.baseline[key]);
  useEffect(() => {
    onPendingChange(dirty || saving);
  }, [dirty, saving, onPendingChange]);
  const fixed = SlotTagRules.fixed(target);
  const groups = VisualPatterns.dimensions.flatMap((dimension) => {
    const axis = SlotTagContracts.axis.safeParse(dimension.key);
    return axis.success ? [{ ...dimension, key: axis.data, fixed: fixed[axis.data] !== undefined }] : [];
  });
  let validationError: string | null = null;
  try {
    SlotTagRules.validate(target, state.facets);
  } catch (error) {
    validationError = error instanceof Error ? error.message : 'Invalid slot tags.';
  }
  const update = (facets: SlotTagFacets) => {
    setSaveError(null);
    setState((value) => ({ ...value, facets }));
  };
  const reset = () => {
    setState({ facets: initial(), baseline: initial(), revision });
    setSaveError(null);
    setOpen(false);
  };
  return {
    facets: state.facets,
    groups,
    fixed,
    open,
    setOpen,
    saving,
    dirty,
    valid: !validationError,
    error: saveError ?? validationError,
    select: (key: keyof SlotTagFacets, value: string) => {
      if (fixed[key] !== undefined) return;
      update(SlotTagContracts.facets.parse({ ...state.facets, [key]: value }));
    },
    remove: (key: keyof SlotTagFacets) => {
      if (fixed[key] !== undefined) return;
      const facets = { ...state.facets };
      delete facets[key];
      if (key === 'backdrop' && facets.pattern !== 'none') delete facets.pattern;
      update(facets);
    },
    reset,
    save: async () => {
      if (!dirty || saving || validationError) return;
      setSaving(true);
      setSaveError(null);
      try {
        await save({ expectedRevision: state.revision, facets: state.facets });
        if (alive.current) {
          setState((value) => ({ ...value, baseline: value.facets, revision: value.revision + 1 }));
          setOpen(false);
        }
      } catch (error) {
        if (alive.current) setSaveError(error instanceof Error ? error.message : String(error));
      } finally {
        if (alive.current) setSaving(false);
      }
    },
  };
}
