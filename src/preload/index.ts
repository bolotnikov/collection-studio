import { contextBridge, ipcRenderer } from 'electron';
import type { StudioApi, Run } from '../shared/Contracts';

const api: StudioApi = {
  getKnowledge: () => ipcRenderer.invoke('studio:getKnowledge'),
  saveKnowledge: (edit) => ipcRenderer.invoke('studio:saveKnowledge', edit),
  removeKnowledge: (kind, id) => ipcRenderer.invoke('studio:removeKnowledge', kind, id),
  importKnowledge: (input) => ipcRenderer.invoke('studio:importKnowledge', input),
  getCatalogStatus: () => ipcRenderer.invoke('studio:getCatalogStatus'),
  importReference: () => ipcRenderer.invoke('studio:importReference'),
  editReference: (input) => ipcRenderer.invoke('studio:editReference', input),
  analyzeReference: (id) => ipcRenderer.invoke('studio:analyzeReference', id),
  saveStyleRules: (input) => ipcRenderer.invoke('studio:saveStyleRules', input),
  suggestArtDirection: (request) => ipcRenderer.invoke('studio:suggestArtDirection', request),
  getSystemLanguages: () => ipcRenderer.invoke('studio:getSystemLanguages'),
  setLanguage: (locale) => ipcRenderer.invoke('studio:setLanguage', locale),
  saveProductionPolicy: (policy) => ipcRenderer.invoke('studio:saveProductionPolicy', policy),
  approveReference: (runId, cardId) => ipcRenderer.invoke('studio:approveReference', runId, cardId),
  removeReference: (id) => ipcRenderer.invoke('studio:removeReference', id),
  setAppearance: (theme) => ipcRenderer.invoke('studio:setAppearance', theme),
  bootstrap: () => ipcRenderer.invoke('studio:bootstrap'),
  start: (brief) => ipcRenderer.invoke('studio:start', brief),
  pause: (id) => ipcRenderer.invoke('studio:pause', id),
  deleteRun: (id) => ipcRenderer.invoke('studio:deleteRun', id),
  resume: (id) => ipcRenderer.invoke('studio:resume', id),
  retry: (run, card, instruction) => ipcRenderer.invoke('studio:retry', run, card, instruction),
  selectAttempt: (run, card, attempt) => ipcRenderer.invoke('studio:selectAttempt', run, card, attempt),
  lock: (run, card, locked) => ipcRenderer.invoke('studio:lock', run, card, locked),
  selectVariant: (run, variant) => ipcRenderer.invoke('studio:selectVariant', run, variant),
  setBudget: (run, maximum) => ipcRenderer.invoke('studio:setBudget', run, maximum),
  previewDelivery: (run, variant) => ipcRenderer.invoke('studio:previewDelivery', run, variant),
  exportDiagnostics: (run) => ipcRenderer.invoke('studio:exportDiagnostics', run),
  exportExecutionLog: (run) => ipcRenderer.invoke('studio:exportExecutionLog', run),
  exportRun: (run, variant) => ipcRenderer.invoke('studio:export', run, variant),
  saveSettings: (settings, key) => ipcRenderer.invoke('studio:saveSettings', settings, key),
  checkConnection: () => ipcRenderer.invoke('studio:checkConnection'),
  onRun: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, run: Run) => callback(run);
    ipcRenderer.on('studio:run', listener);
    return () => ipcRenderer.removeListener('studio:run', listener);
  },
};
contextBridge.exposeInMainWorld('studio', api);
