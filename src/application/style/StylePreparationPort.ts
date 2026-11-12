import type { Brief, Card, Profile, Variant } from '../../shared/Contracts';
import type { StyleEvidence } from '../../shared/StyleContracts';
export interface PreparedStyle {
  prompt: string;
  references: string[];
  evidence: StyleEvidence;
}
export interface StylePreparationPort {
  initialize(
    shouldStop?: () => boolean,
    onProgress?: (indexed: number, total: number) => Promise<void>,
  ): Promise<void>;
  prepare(
    brief: Brief,
    card: Card,
    variant: Variant,
    profile: Profile,
    correction?: string,
  ): Promise<PreparedStyle>;
}
