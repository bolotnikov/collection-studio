import { useState } from 'react';
import type { StudioApi } from '../../../shared/Contracts';
import { StyleRuleContracts, type StyleRuleSettings } from '../../../shared/StyleRuleContracts';

export function useStyleRulesViewModel(
  settings: StyleRuleSettings,
  api: StudioApi,
  refresh: () => Promise<void>,
) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(''),
    [categories, setCategories] = useState(settings.categories);
  const edit = () => {
    setRendering(settings.rendering.join('\n'));
    setCategories({ ...settings.categories });
    setError(null);
    setEditing(true);
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = StyleRuleContracts.edit.safeParse({
        rendering: rendering
          .split('\n')
          .map((rule) => rule.trim())
          .filter(Boolean),
        categories,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Invalid rules.');
        return;
      }
      await api.saveStyleRules(parsed.data);
      await refresh();
      setEditing(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return {
    editing,
    busy,
    error,
    rendering,
    setRendering,
    categories,
    setCategories,
    edit,
    save,
    cancel: () => setEditing(false),
  };
}
