import type { Brief, Profile } from '../shared/Contracts';
import type {
  CompositionBlueprint,
  CompositionDetails,
  SemanticProposal,
  SlotPlan,
  AssignedSubjects,
} from '../shared/CompositionPlanningContracts';

export interface CompositionPlanningPort {
  designSlotSet(
    brief: Brief,
    profile: Profile,
    slots: SlotPlan[],
    references: string[],
    correction: string,
  ): Promise<AssignedSubjects>;
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
