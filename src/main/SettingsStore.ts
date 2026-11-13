import fs from 'node:fs/promises';
import path from 'node:path';
import { Contracts, type Settings } from '../shared/Contracts';

export class SettingsStore {
  private value: Settings = Contracts.settings.parse({});
  constructor(private readonly directory: string) {}
  async init(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    try {
      this.value = Contracts.settings.parse(
        JSON.parse(await fs.readFile(path.join(this.directory, 'settings.json'), 'utf8')),
      );
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  get settings(): Settings {
    return { ...this.value };
  }
  async save(settings: Settings): Promise<void> {
    const value = Contracts.settings.parse(settings);
    await fs.writeFile(path.join(this.directory, 'settings.json.tmp'), JSON.stringify(value, null, 2));
    await fs.rename(
      path.join(this.directory, 'settings.json.tmp'),
      path.join(this.directory, 'settings.json'),
    );
    this.value = value;
  }
}
