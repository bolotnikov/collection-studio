import fs from 'node:fs/promises';
import path from 'node:path';
import { safeStorage } from 'electron';
import dotenv from 'dotenv';
import { Contracts, type Settings } from '../shared/Contracts';

export class SettingsStore {
  private key = '';
  private value: Settings = Contracts.settings.parse({
    imageModel: 'gpt-image-2',
    textModel: 'gpt-4.1-mini',
  });
  constructor(private readonly directory: string) {}
  async init(projectPath?: string): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    try {
      this.value = Contracts.settings.parse(
        JSON.parse(await fs.readFile(path.join(this.directory, 'settings.json'), 'utf8')),
      );
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    if (await safeStorage.isAsyncEncryptionAvailable()) {
      try {
        this.key = (
          await safeStorage.decryptStringAsync(await fs.readFile(path.join(this.directory, 'credential.bin')))
        ).result;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
    }
    if (projectPath) {
      try {
        const env = dotenv.parse(await fs.readFile(path.join(projectPath, '.env')));
        if (env.OPENAI_API_KEY) {
          this.key = env.OPENAI_API_KEY;
          await this.storeCredential(this.key);
        }
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
    }
  }
  get settings(): Settings {
    return { ...this.value };
  }
  get hasKey(): boolean {
    return this.key.length > 0;
  }
  credential(): string {
    if (!this.key) throw new Error('Add an API key in Settings.');
    return this.key;
  }
  private async storeCredential(key: string): Promise<void> {
    if (!(await safeStorage.isAsyncEncryptionAvailable()))
      throw new Error('System credential encryption is unavailable.');
    await fs.writeFile(
      path.join(this.directory, 'credential.bin'),
      await safeStorage.encryptStringAsync(key),
      { mode: 0o600 },
    );
  }
  async save(settings: Settings, newKey: string): Promise<void> {
    const value = Contracts.settings.parse(settings);
    if (newKey.trim()) {
      await this.storeCredential(newKey.trim());
      this.key = newKey.trim();
    }
    await fs.writeFile(path.join(this.directory, 'settings.json.tmp'), JSON.stringify(value, null, 2));
    await fs.rename(
      path.join(this.directory, 'settings.json.tmp'),
      path.join(this.directory, 'settings.json'),
    );
    this.value = value;
  }
}
