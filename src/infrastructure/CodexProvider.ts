import { PromptCatalog } from '../application/prompts/PromptCatalog';
import { SetContract } from '../shared/SetContract';
import type { Plan } from '../shared/Contracts';
import { PromptBuilder } from '../application/PromptBuilder';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { Contracts, type Brief, type Card, type Profile, type Variant } from '../shared/Contracts';
import type { GenerationPort } from '../application/GenerationPort';
import { CodexRunner } from './CodexRunner';

export class CodexProvider implements GenerationPort {
  constructor(
    private readonly runner: CodexRunner,
    private readonly prompts = new PromptCatalog(),
  ) {}
  async plan(brief: Brief, profile: Profile, referencePaths: string[] = [], correction = '') {
    return (
      await this.runner.run(
        PromptBuilder.planning(brief, profile, correction),
        Contracts.productionPlan,
        referencePaths,
      )
    ).value;
  }
  async reviewPlan(brief: Brief, variant: Plan['variants'][number], profile: Profile, references: string[]) {
    return (
      await this.runner.run(PromptBuilder.planReview(brief, variant, profile), SetContract.review, references)
    ).value;
  }
  async image(prompt: string, references: string[], quality: Brief['quality']) {
    const schema = z.object({ success: z.boolean(), tool: z.string(), message: z.string() });
    const result = await this.runner.run(
      this.prompts.render('CodexProvider.image', { prompt: prompt, quality: quality }),
      schema,
      references,
      true,
    );
    if (!result.value.success || !result.value.tool.includes('image_gen'))
      throw new Error(result.value.message || 'Codex did not confirm image generation.');
    const bytes = await fs.readFile(path.join(result.folder, 'image.png'));
    return {
      bytes,
      requestId: result.threadId,
      usage: {
        ...result.usage,
        provider: 'codex',
        jobFolder: path.basename(result.folder),
        qualityRequested: quality,
        qualityControl: 'prompt-only',
      },
    };
  }
  async review(card: Card, imagePath: string, references: string[], profile: Profile, brief?: Brief) {
    const prompt = PromptBuilder.cardReview(card, profile, brief);
    const review = (await this.runner.run(prompt, Contracts.review, [imagePath, ...references])).value;
    return review;
  }
  async reviewSet(
    variant: Variant,
    sheet: string,
    profile: Profile,
    referencePaths: string[] = [],
    brief?: Brief,
  ) {
    const prompt = PromptBuilder.setReview(variant, profile, brief);
    const review = (await this.runner.run(prompt, Contracts.detailedSetReview, [sheet, ...referencePaths]))
      .value;
    return review;
  }
}
