import type { Profile, Run } from '../shared/Contracts';
import { ExecutionJournal } from './ExecutionJournal';
import { ExecutionLogNarrator } from './ExecutionLogNarrator';

/** Exports stored evidence only; rendering never starts a provider request. */
export class ExecutionLogExporter {
  constructor(private readonly journal: ExecutionJournal) {}
  async render(run: Run, profile: Profile): Promise<string> {
    return new ExecutionLogNarrator().render(run, profile, await this.journal.entries(run.id));
  }
  async diagnostics(run: Run, profile: Profile): Promise<string> {
    return JSON.stringify(
      ExecutionJournal.sanitize({
        schema: 'collection-studio-diagnostics-v2',
        exportedAt: new Date().toISOString(),
        run,
        profile,
        journal: await this.journal.entries(run.id),
      }),
      null,
      2,
    );
  }
}
