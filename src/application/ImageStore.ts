import type { SheetLayout } from '../shared/SetSheetLayout';
import type { Attempt, Card, Variant } from '../shared/Contracts';

export interface ImageStore {
  save(
    folder: string,
    attemptId: string,
    bytes: Buffer,
  ): Promise<{ master: string; preview: string; hashes?: { master: string; preview: string } }>;
  selected(card: Card): Attempt | undefined;
  sheet(folder: string, variant: Variant, layout?: SheetLayout): Promise<string>;
}
