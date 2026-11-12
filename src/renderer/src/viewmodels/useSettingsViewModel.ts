import { useState } from 'react';
import type { Bootstrap, Settings, StudioApi } from '../../../shared/Contracts';
import { Assets } from '../Assets';

export function useSettingsViewModel(
  data: Bootstrap,
  busy: boolean,
  api: StudioApi,
  perform: (action: () => Promise<unknown>) => Promise<void>,
  refresh: () => Promise<void>,
) {
  const [key, setKey] = useState('');
  const [settings, setSettings] = useState<Settings>(data.settings);
  const [policy, setPolicy] = useState(data.productionPolicy);
  const [policySaved, setPolicySaved] = useState(false);
  const policyBusy = busy || data.runs.some(Assets.active);
  const [connection, setConnection] = useState<{ ok: boolean; message: string } | null>(null);
  const savePolicy = () =>
    perform(async () => {
      await api.saveProductionPolicy(policy);
      await refresh();
      setPolicySaved(true);
    });
  const saveSettings = () =>
    perform(async () => {
      await api.saveSettings(settings, key);
      setKey('');
      await refresh();
      setConnection({ ok: true, message: 'Settings saved.' });
    });
  const checkConnection = () =>
    perform(async () => {
      setConnection(await api.checkConnection());
      await refresh();
    });
  return {
    key,
    setKey,
    settings,
    setSettings,
    policy,
    setPolicy,
    policySaved,
    policyBusy,
    connection,
    savePolicy,
    saveSettings,
    checkConnection,
  };
}
