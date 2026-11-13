import type { Profile } from '../shared/Contracts';
import { StyleContracts, type ProductionPolicy } from '../shared/StyleContracts';
import canonical from '../../resources/canonical-style-rules.json';
import modes from '../../resources/content-modes.json';

export class GenerationContentPolicy {
  static scopeRules(rules: readonly string[]): string[] {
    return rules.map((rule) => (modes.ordinaryClauses.includes(rule) ? modes.scopedClause : rule));
  }

  static apply(profile: Profile, policy: ProductionPolicy | undefined, includeGold: boolean) {
    const activeRules = (rules: readonly string[]) => {
      const scoped = GenerationContentPolicy.scopeRules(rules);
      return includeGold && !scoped.includes(modes.mixedClause) ? [...scoped, modes.mixedClause] : scoped;
    };
    return {
      profile: {
        ...profile,
        categories: includeGold
          ? { ...profile.categories, '5': profile.categories['5'] ?? canonical.categories['5'] }
          : profile.categories,
        rules: activeRules(profile.rules),
        requirements: profile.requirements?.map((section) => ({
          ...section,
          rules: GenerationContentPolicy.scopeRules(section.rules),
        })),
      },
      policy:
        !policy && !includeGold
          ? undefined
          : {
              ...(policy ?? StyleContracts.policy.parse({})),
              rules: activeRules((policy ?? StyleContracts.policy.parse({})).rules),
            },
    };
  }
}
