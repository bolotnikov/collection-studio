import { expect, it, vi } from 'vitest';
import { ReferenceEditorModel } from '../src/renderer/src/viewmodels/ReferenceEditorModel';
import { ReferenceLibraryService } from '../src/application/style/ReferenceLibraryService';
import { StyleContracts } from '../src/shared/StyleContracts';

const item = StyleContracts.libraryItem.parse({
  id: 'image',
  filename: 'image.png',
  title: 'A wooden desk lamp.',
  category: '1',
  sha256: 'fixture',
  source: 'fixture',
});
const proposal = { category: '4' as const, description: 'A brass lamp beside a library window.' };
it('offers editable AI suggestions, saves the chosen metadata once and cancels without writing', async () => {
  const api = {
    importReference: vi.fn(async () => item),
    analyzeReference: vi.fn(async () => proposal),
    editReference: vi.fn(async () => {}),
  };
  const refresh = vi.fn(async () => {});
  const model = new ReferenceEditorModel(api, refresh);
  model.open(item);
  await model.analyze();
  expect(api.analyzeReference).toHaveBeenCalledWith(item.id);
  expect(api.editReference).not.toHaveBeenCalled();
  expect(model.snapshot().category).toBe('4');
  model.setCategory('3');
  model.setDescription('A lamp on a carved wooden desk.');
  await model.save();
  expect(api.editReference).toHaveBeenCalledExactlyOnceWith({
    id: item.id,
    category: '3',
    description: 'A lamp on a carved wooden desk.',
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(model.snapshot().item).toBeNull();
  model.open(item);
  model.setDescription('An unsaved change.');
  model.close();
  expect(api.editReference).toHaveBeenCalledOnce();
});
it('validates before saving and ignores duplicate or late requests after disposal', async () => {
  let release: (value: typeof proposal) => void = () => {};
  const api = {
    importReference: vi.fn(async () => item),
    editReference: vi.fn(async () => {}),
    analyzeReference: vi.fn(
      () =>
        new Promise<typeof proposal>((resolve) => {
          release = resolve;
        }),
    ),
  };
  const model = new ReferenceEditorModel(api, async () => {});
  model.open(item);
  model.setDescription('Не на английском');
  await model.save();
  expect(api.editReference).not.toHaveBeenCalled();
  expect(model.snapshot().error).toContain('English');
  const pending = model.analyze();
  await model.analyze();
  expect(api.analyzeReference).toHaveBeenCalledOnce();
  model.dispose();
  release(proposal);
  await pending;
  expect(model.snapshot().description).toBe('Не на английском');
});
it('opens an imported reference for manual classification without automatically calling AI', async () => {
  const api = {
    importReference: vi.fn(async () => ({ ...item, category: 'unknown' as const })),
    editReference: vi.fn(async () => {}),
    analyzeReference: vi.fn(async () => proposal),
  };
  const model = new ReferenceEditorModel(api, async () => {});
  model.activate();
  await model.import();
  expect(model.snapshot().item?.id).toBe(item.id);
  expect(model.snapshot().category).toBe('');
  expect(api.analyzeReference).not.toHaveBeenCalled();
});
it('keeps visual proposals separate from manual writes and rejects unsuitable reference suggestions', async () => {
  const editMetadata = vi.fn(async () => {});
  const analysis = StyleContracts.analysis.parse({
    eligible: true,
    exclusionReason: '',
    subject: proposal.description,
    materials: [],
    silhouette: '',
    rendering: '',
    lighting: '',
    palette: '',
    background: '',
    category: proposal.category,
    usefulPrinciples: [],
    avoidCopying: [],
  });
  const analyzeReference = vi.fn(async () => analysis);
  const service = new ReferenceLibraryService(
    { get: () => item, editMetadata, importImage: async () => item },
    () => ({ analyzeReference }),
  );
  expect(await service.analyze(item.id)).toEqual(proposal);
  expect(editMetadata).not.toHaveBeenCalled();
  await service.edit({ id: item.id, ...proposal });
  expect(editMetadata).toHaveBeenCalledWith({ id: item.id, ...proposal });
  analysis.eligible = false;
  analysis.exclusionReason = 'Contains a character';
  await expect(service.analyze(item.id)).rejects.toThrow('Contains a character');
  expect(editMetadata).toHaveBeenCalledOnce();
});
