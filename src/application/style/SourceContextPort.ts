import type { Brief, Card, Profile, Variant } from '../../shared/Contracts';
import type { KnowledgeEvidence } from '../../shared/KnowledgeContracts';
export interface SourceContext {
  profile: Profile;
  referencePaths: string[];
  evidence: KnowledgeEvidence;
}
export interface SourceContextPort {
  prepare(
    stage: KnowledgeEvidence['stage'],
    brief: Brief,
    profile: Profile,
    variant?: Variant,
    card?: Card,
  ): Promise<SourceContext>;
}
