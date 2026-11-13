import type { Profile, Run } from '../shared/Contracts';

export interface RunStore {
  list(): Promise<Run[]>;
  directory(id: string): string;
  save(run: Run): Promise<void>;
  get(id: string): Promise<Run>;
  saveProfile(id: string, profile: Profile): Promise<void>;
  getProfile(id: string): Promise<Profile>;
  remove(id: string): Promise<void>;
}
