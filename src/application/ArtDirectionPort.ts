import type { ArtDirectionResult } from '../shared/Contracts';

export interface ArtDirectionPort {
  suggestArtDirection(prompt: string): Promise<ArtDirectionResult>;
}
