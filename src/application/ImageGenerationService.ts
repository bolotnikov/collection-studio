import { randomUUID } from 'node:crypto';
import type { ActiveRun } from './ActiveRun';
import type { GenerationPort } from './GenerationPort';
import { ProductionContext } from './ProductionContext';
import { SetRules } from '../domain/SetRules';
import type { Card, Variant } from '../shared/Contracts';

/** Technical retries spend the request budget, never composition correction allowances. */
export class ImageGenerationService {
  constructor(private readonly context: ProductionContext) {}

  async generate(
    active: ActiveRun,
    provider: GenerationPort,
    variant: Variant,
    card: Card,
    request: { prompt: string; references: string[] },
  ) {
    const run = active.run;
    const started = Date.now();
    while (!active.stop) {
      SetRules.reserveImage(run);
      const imageCall = run.imageCalls;
      card.status = 'generating';
      card.error = null;
      this.context.activity(run, {
        key: card.id,
        kind: 'generation',
        subject: card.subject,
        index: variant.cards.findIndex((item) => item.id === card.id) + 1,
        total: variant.cards.length,
        attempt: card.attempts.length + 1,
      });
      await this.context.publish(run, `Generating: ${card.subject}`);
      if (active.stop) {
        run.imageCalls--;
        break;
      }
      let phase: 'provider' | 'image-storage' = 'provider';
      try {
        const result = await provider.image(request.prompt, request.references, run.brief.quality);
        phase = 'image-storage';
        const id = randomUUID();
        const files = await this.context.images.save(
          this.context.repository.directory(run.id),
          id,
          result.bytes,
        );
        return { result, id, files, elapsedMs: Date.now() - started };
      } catch (error) {
        (card.generationFailures ??= []).push({
          at: new Date().toISOString(),
          imageCall,
          phase,
          error: this.context.errorMessage(error),
        });
        await this.context.publish(run);
        if (!active.stop && run.imageCalls >= run.brief.maxImageCalls)
          throw new Error('Generation limit reached. Results are saved.', { cause: error });
        if (!active.stop)
          await this.context.publish(run, 'Retrying image generation after a technical error');
      }
    }
    card.status = this.context.images.selected(card) ? 'done' : 'pending';
    await this.context.publish(run);
    return undefined;
  }
}
