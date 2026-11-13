import { Contracts, type StudioApi } from '../../../shared/Contracts';

type State = {
  theme: string;
  wishes: string;
  variants: number;
  includeGold: boolean;
  suggesting: boolean;
  error: string | null;
};

export class BriefViewModel {
  private state: State = {
    theme: '',
    wishes: '',
    variants: 1,
    includeGold: false,
    suggesting: false,
    error: null,
  };
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private active = true;
  constructor(private readonly api: Pick<StudioApi, 'suggestArtDirection'>) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  activate() {
    this.active = true;
  }
  dispose() {
    this.active = false;
    this.revision++;
  }
  setTheme = (theme: string) => {
    this.revision++;
    this.update({ theme, error: null });
  };
  setWishes = (wishes: string) => {
    this.revision++;
    this.update({ wishes, error: null });
  };
  setIncludeGold = (includeGold: boolean) => {
    this.revision++;
    this.update({ includeGold, error: null });
  };
  setVariants = (variants: number) => this.update({ variants });
  async suggest(): Promise<void> {
    if (this.state.suggesting || !this.active) return;
    const revision = this.revision;
    this.update({ suggesting: true, error: null });
    try {
      const request = Contracts.artDirectionRequest.parse({
        theme: this.state.theme,
        wishes: this.state.wishes,
        includeGold: this.state.includeGold,
      });
      const result = Contracts.artDirectionResult.parse(await this.api.suggestArtDirection(request));
      if (this.active && revision === this.revision) this.update({ wishes: result.text });
    } catch (error) {
      if (this.active && revision === this.revision)
        this.update({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (this.active) this.update({ suggesting: false });
    }
  }
  private update(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
