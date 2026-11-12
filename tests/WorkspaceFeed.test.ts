import { expect, it, vi } from 'vitest';
import { WorkspaceFeed } from '../src/renderer/src/viewmodels/WorkspaceFeed';
import type { Bootstrap, Run } from '../src/shared/Contracts';
import { Contracts } from '../src/shared/Contracts';
import { StyleContracts } from '../src/shared/StyleContracts';
import profile from '../resources/style-profile.json';

it('owns one subscription, retains live updates during bootstrap, and ignores results after disposal', async () => {
  let resolve: (data: Bootstrap) => void = () => {};
  let callback: (run: Run) => void = () => {};
  const unsubscribe = vi.fn();
  const api = {
    bootstrap: () =>
      new Promise<Bootstrap>((done) => {
        resolve = done;
      }),
    onRun: (listener: (run: Run) => void) => {
      callback = listener;
      return unsubscribe;
    },
  };
  const publish = vi.fn();
  const fail = vi.fn();
  const feed = new WorkspaceFeed(api, publish, fail);
  const run = Contracts.run.parse({
    id: '00000000-0000-4000-8000-000000000001',
    createdAt: '2026-11-12',
    updatedAt: '2026-11-12',
    brief: { theme: 'test', wishes: '', quality: 'low', maxImageCalls: 10, autoRepair: true },
    status: 'paused',
    stage: 'paused',
    imageCalls: 0,
    variants: [],
    imageModel: 'fixture',
    textModel: 'fixture',
    events: [],
    selectedVariantId: null,
  });
  const data: Bootstrap = {
    runs: [],
    profile: Contracts.profile.parse(profile),
    settings: Contracts.settings.parse({ imageModel: 'fixture', textModel: 'fixture' }),
    hasKey: false,
    codexReady: false,
    referenceCount: 8,
    dataPath: '/fixture',
    productionPolicy: StyleContracts.policy.parse({}),
    userReferences: [],
    anchorReferences: [],
  };
  feed.connect();
  feed.connect();
  callback(run);
  resolve(data);
  await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
  expect(publish.mock.calls[0]?.[0].runs).toEqual([run]);
  const pending = feed.refresh();
  feed.dispose();
  feed.dispose();
  resolve(data);
  await pending;
  expect(publish).toHaveBeenCalledOnce();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(fail).not.toHaveBeenCalled();
});
