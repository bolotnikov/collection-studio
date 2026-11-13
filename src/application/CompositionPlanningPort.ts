import type { Brief, Profile } from '../shared/Contracts';
import type {
  CompositionBlueprint,
  CompositionDetails,
  SemanticProposal,
} from '../shared/CompositionPlanningContracts';

export interface CompositionPlanningPort {
  proposeSubjects(
    brief: Brief,
    profile: Profile,
    references: string[],
    correction: string,
  ): Promise<SemanticProposal>;
  describeComposition(
    brief: Brief,
    profile: Profile,
    blueprints: CompositionBlueprint[],
    references: string[],
    correction: string,
  ): Promise<CompositionDetails>;
}
