import type { Attempt, Card, Variant } from '../shared/Contracts';

export interface ImageStore {
  save(folder: string, attemptId: string, bytes: Buffer): Promise<{ master: string; preview: string }>;
  selected(card: Card): Attempt | undefined;
  sheet(folder: string, variant: Variant): Promise<string>;
}
