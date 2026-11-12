import type { Run, Profile } from '../shared/Contracts';
import type { StylePreparationPort } from './style/StylePreparationPort';
import type { SourceContextPort } from './style/SourceContextPort';
export type ActiveRun = {
  run: Run;
  stop: boolean;
  profile: Profile;
  preparation?: StylePreparationPort;
  sourceContext?: SourceContextPort;
};
