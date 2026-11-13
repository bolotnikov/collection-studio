import { useState } from 'react';
import type { Bootstrap, Settings, StudioApi } from '../../../shared/Contracts';
import { GenerationRepairContracts } from '../../../shared/GenerationRepairContracts';

export function useSettingsViewModel(
  data: Bootstrap,
  api: StudioApi,
  perform: (action: () => Promise<unknown>) => Promise<void>,
  refresh: () => Promise<void>,
) {
  const [settings, setSettings] = useState<Settings>(data.settings);
  const [connection, setConnection] = useState<{ ok: boolean; message: string } | null>(
    data.codexMessage ? { ok: data.codexReady, message: data.codexMessage } : null,
  );
  const setRepairLimit = (field: 'maxCardRegenerations' | 'maxSetRegenerationRounds', input: number) => {
    const value = GenerationRepairContracts.limit.safeParse(input);
    if (value.success) setSettings((settings) => ({ ...settings, [field]: value.data }));
  };
  const saveSettings = () =>
    perform(async () => {
      await api.saveSettings(settings);
      await refresh();
      setConnection({ ok: true, message: 'Settings saved.' });
    });
  const checkConnection = () =>
    perform(async () => {
      setConnection(await api.checkConnection());
      await refresh();
    });
  return {
    settings,
    setSettings,
    setRepairLimit,
    connection,
    saveSettings,
    checkConnection,
  };
}
