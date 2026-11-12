import type { StudioApi } from '../../../shared/Contracts';
import { StyleContracts, type LibraryItem, type ReferenceMetadata } from '../../../shared/StyleContracts';

type State = {
  item: LibraryItem | null;
  category: ReferenceMetadata['category'] | '';
  description: string;
  busy: 'import' | 'analyze' | 'save' | null;
  error: string | null;
};
/** Owns editor lifetime so late requests cannot reopen or overwrite another reference. */
export class ReferenceEditorModel {
  private state: State = { item: null, category: '', description: '', busy: null, error: null };
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private disposed = false;
  constructor(
    private readonly api: Pick<StudioApi, 'importReference' | 'editReference' | 'analyzeReference'>,
    private readonly refresh: () => Promise<void>,
  ) {}
  snapshot = () => this.state;
  activate() {
    this.disposed = false;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private patch(update: Partial<State>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...update };
    this.listeners.forEach((listener) => listener());
  }
  open = (item: LibraryItem) => {
    if (this.state.busy) return;
    this.revision++;
    this.patch({
      item,
      category: item.metadata?.category ?? (item.category === 'unknown' ? '' : item.category),
      description: item.metadata?.description ?? item.title,
      error: null,
    });
  };
  close = () => {
    if (!this.state.busy) {
      this.revision++;
      this.patch({ item: null, error: null });
    }
  };
  setCategory = (category: State['category']) => {
    if (!this.state.busy) this.patch({ category });
  };
  setDescription = (description: string) => {
    if (!this.state.busy) this.patch({ description });
  };
  private async action(busy: NonNullable<State['busy']>, task: (revision: number) => Promise<void>) {
    if (this.state.busy || this.disposed) return;
    const revision = this.revision;
    this.patch({ busy, error: null });
    try {
      await task(revision);
    } catch (error) {
      if (revision === this.revision)
        this.patch({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.patch({ busy: null });
    }
  }
  import = () =>
    this.action('import', async () => {
      const item = await this.api.importReference();
      if (!item || this.disposed) return;
      await this.refresh();
      this.patch({
        item,
        category: item.metadata?.category ?? (item.category === 'unknown' ? '' : item.category),
        description: item.metadata?.description ?? item.title,
      });
    });
  analyze = () => {
    const item = this.state.item;
    if (!item) return Promise.resolve();
    return this.action('analyze', async (revision) => {
      const result = await this.api.analyzeReference(item.id);
      if (revision === this.revision)
        this.patch({ category: result.category, description: result.description });
    });
  };
  save = () => {
    const item = this.state.item;
    if (!item) return Promise.resolve();
    return this.action('save', async (revision) => {
      const parsed = StyleContracts.referenceEdit.safeParse({
        id: item.id,
        category: this.state.category,
        description: this.state.description,
      });
      if (!parsed.success) {
        this.patch({ error: parsed.error.issues[0]?.message ?? 'Invalid reference metadata.' });
        return;
      }
      await this.api.editReference(parsed.data);
      await this.refresh();
      if (revision === this.revision) this.patch({ item: null });
    });
  };
  dispose() {
    this.disposed = true;
    this.revision++;
    this.listeners.clear();
  }
}
