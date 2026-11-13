import { useEffect, useState } from 'react';
import type { StudioApi } from '../../../shared/Contracts';
import type { DeliveryPreview } from '../../../shared/DeliveryContracts';

export function useDeliveryViewModel(api: StudioApi, runId: string, variantId: string, selection: string) {
  const [state, setState] = useState<{ key: string; previews: DeliveryPreview[]; error: string | null }>({
    key: '',
    previews: [],
    error: null,
  });
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const exportPreview = async (preview: DeliveryPreview) => {
    setSaving(true);
    setExportError(null);
    setSavedPath(null);
    try {
      setSavedPath(await api.exportDeliveryPreview(runId, variantId, preview));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  const [expanded, setExpanded] = useState<DeliveryPreview | null>(null);
  const key = `${runId}:${variantId}:${selection}:${retry}`;
  useEffect(() => {
    let current = true;
    setExpanded(null);
    void api.previewDelivery(runId, variantId).then(
      (previews) => {
        if (current) setState({ key, previews, error: null });
      },
      (error: unknown) => {
        if (current)
          setState({ key, previews: [], error: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [api, runId, variantId, key]);
  return {
    saving,
    exportError,
    savedPath,
    exportPreview,
    previews: state.key === key ? state.previews : [],
    error: state.key === key ? state.error : null,
    loading: state.key !== key,
    expanded,
    setExpanded,
    retry: () => setRetry((value) => value + 1),
  };
}
