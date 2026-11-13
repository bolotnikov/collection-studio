import fs from 'node:fs/promises';
import path from 'node:path';
import { Contracts, type Run, type Profile } from '../shared/Contracts';
import type { RunStore } from '../application/RunStore';
import { ExecutionJournal } from './ExecutionJournal';

export class RunRepository implements RunStore {
  private writes: Promise<void> = Promise.resolve();
  constructor(
    readonly root: string,
    private readonly trash: (directory: string) => Promise<void>,
    private readonly journal?: ExecutionJournal,
  ) {}
  directory(id: string): string {
    return path.join(this.root, Contracts.id.parse(id));
  }
  async save(run: Run): Promise<void> {
    run.updatedAt = new Date().toISOString();
    const snapshot = JSON.stringify(run, null, 2);
    const operation = this.writes.then(() => this.write(run.id, snapshot));
    this.writes = operation.catch(() => {});
    return operation;
  }
  private async write(id: string, snapshot: string): Promise<void> {
    const folder = this.directory(id);
    await fs.mkdir(folder, { recursive: true });
    const file = path.join(folder, 'run.json');
    let changes: unknown[] = [];
    if (this.journal) {
      let previous: unknown = null;
      try {
        previous = JSON.parse(await fs.readFile(file, 'utf8'));
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      const current: unknown = JSON.parse(snapshot);
      changes = ExecutionJournal.changes(previous, current);
    }
    await fs.writeFile(file + '.tmp', snapshot);
    await fs.rename(file + '.tmp', file);
    if (changes.length) await this.journal?.record(id, 'Production workflow', 'state.changed', changes);
  }
  async get(id: string): Promise<Run> {
    return Contracts.run.parse(
      JSON.parse(await fs.readFile(path.join(this.directory(id), 'run.json'), 'utf8')),
    );
  }
  async remove(id: string): Promise<void> {
    const folder = this.directory(id);
    const operation = this.writes.then(() => this.trash(folder));
    this.writes = operation.catch(() => {});
    await operation;
  }
  async saveProfile(id: string, profile: Profile): Promise<void> {
    const file = path.join(this.directory(id), 'style-profile.json');
    try {
      await fs.copyFile(
        file,
        path.join(this.directory(id), 'style-profile.initial.json'),
        fs.constants.COPYFILE_EXCL,
      );
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && ['ENOENT', 'EEXIST'].includes(String(error.code))))
        throw error;
    }
    await fs.writeFile(file + '.tmp', JSON.stringify(profile, null, 2));
    await fs.rename(file + '.tmp', file);
  }
  async getProfile(id: string): Promise<Profile> {
    return Contracts.profile.parse(
      JSON.parse(await fs.readFile(path.join(this.directory(id), 'style-profile.json'), 'utf8')),
    );
  }
  async list(): Promise<Run[]> {
    await fs.mkdir(this.root, { recursive: true });
    const runs: Run[] = [];
    for (const entry of await fs.readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !Contracts.id.safeParse(entry.name).success) continue;
      runs.push(await this.get(entry.name));
    }
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async recover(): Promise<void> {
    for (const run of await this.list()) {
      if (['planning', 'generating', 'reviewing'].includes(run.status)) {
        run.status = 'paused';
        run.stage =
          'Run interrupted. Finished images are saved; an unfinished request may have consumed usage.';
        for (const v of run.variants)
          for (const c of v.cards) {
            if (c.status === 'generating') {
              c.status = 'failed';
              c.error = 'Request outcome is unknown after restart.';
            }
            if (c.status === 'reviewing') c.status = 'done';
          }
        await this.save(run);
      }
    }
  }
}
