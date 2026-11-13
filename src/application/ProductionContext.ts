import path from 'node:path';
import type { Run, Profile, Variant, Card } from '../shared/Contracts';
import type { ActiveRun } from './ActiveRun';
import type { RunStore } from './RunStore';
import type { ImageStore } from './ImageStore';
import type { SourceContext } from './style/SourceContextPort';
/** Explicit services shared by bounded production stages; no provider implementation dependencies. */
export class ProductionContext {
  constructor(
    readonly repository: RunStore,
    readonly images: ImageStore,
    readonly referenceRoot: string,
    readonly publish: (run: Run, message?: string) => Promise<void>,
  ) {}
  activity(run: Run, activity: NonNullable<Run['activities']>[number]): void {
    run.activities = [...(run.activities ?? []).filter((item) => item.key !== activity.key), activity];
  }
  clearActivity(run: Run, key: string): void {
    run.activities = run.activities?.filter((item) => item.key !== key);
  }
  errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return message.replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 1200);
  }
  reviewProfile(active: ActiveRun): Profile {
    return {
      ...active.profile,
      rules: [...new Set([...active.profile.rules, ...(active.run.productionPolicy?.rules ?? [])])],
      reviewStyleThreshold: active.run.productionPolicy?.styleThreshold ?? 4,
    };
  }
  sourceContext(
    active: ActiveRun,
    stage: 'planning' | 'card' | 'set-review',
    variant?: Variant,
    card?: Card,
  ): Promise<SourceContext | undefined> {
    return (
      active.sourceContext?.prepare(stage, active.run.brief, this.reviewProfile(active), variant, card) ??
      Promise.resolve(undefined)
    );
  }
  references(card: Card, profile: Profile): string[] {
    const matched = profile.references.filter((r) => r.category === card.category);
    const other = profile.references.find((r) => r.category !== card.category);
    return [...matched.slice(0, 2), ...(other ? [other] : [])].map((r) =>
      path.join(this.referenceRoot, r.filename),
    );
  }
}
