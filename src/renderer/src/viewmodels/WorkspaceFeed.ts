import type { Bootstrap, Run, StudioApi } from '../../../shared/Contracts';

/** Owns the desktop subscription and prevents late snapshots from losing run events. */
export class WorkspaceFeed {
  private generation = 0;
  private unsubscribe: (() => void) | null = null;
  private data: Bootstrap | null = null;
  private readonly updates = new Map<string, Run>();
  constructor(
    private readonly api: Pick<StudioApi, 'bootstrap' | 'onRun'>,
    private readonly publish: (data: Bootstrap) => void,
    private readonly fail: (error: unknown) => void,
  ) {}
  connect(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.api.onRun((run) => {
      this.updates.set(run.id, run);
      if (this.data) this.accept(this.data);
    });
    void this.refresh().catch((error) => {
      if (this.unsubscribe) this.fail(error);
    });
  }
  async refresh(): Promise<void> {
    const generation = ++this.generation;
    const data = await this.api.bootstrap();
    if (this.unsubscribe && generation === this.generation) this.accept(data);
  }
  private accept(data: Bootstrap): void {
    const runs = new Map(data.runs.map((run) => [run.id, run]));
    for (const [id, run] of this.updates) {
      const stored = runs.get(id);
      if (!stored || stored.updatedAt <= run.updatedAt) runs.set(id, run);
    }
    this.data = { ...data, runs: [...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
    this.publish(this.data);
  }
  dispose(): void {
    this.generation++;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.updates.clear();
    this.data = null;
  }
}
