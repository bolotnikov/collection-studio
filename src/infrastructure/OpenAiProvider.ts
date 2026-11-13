import {
  CompositionPlanningContracts,
  type CompositionBlueprint,
} from '../shared/CompositionPlanningContracts';
import { CompositionPlanningPrompts } from '../application/prompts/CompositionPlanningPrompts';
import type { ArtDirectionPort } from '../application/ArtDirectionPort';
import { PromptCatalog } from '../application/prompts/PromptCatalog';
import { SetContract } from '../shared/SetContract';
import type { Plan } from '../shared/Contracts';
import { PromptBuilder } from '../application/PromptBuilder';
import fsp from 'node:fs/promises';
import path from 'node:path';
import OpenAI, { toFile } from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { Contracts, type Brief, type Card, type Profile, type Variant } from '../shared/Contracts';
import type { GenerationPort, ImageResult } from '../application/GenerationPort';

export class OpenAiProvider implements GenerationPort, ArtDirectionPort {
  private readonly client: OpenAI;
  constructor(
    apiKey: string,
    readonly imageModel: string,
    readonly textModel: string,
    private readonly prompts = new PromptCatalog(),
    requestFetch?: typeof fetch,
  ) {
    this.client = new OpenAI({ apiKey, maxRetries: 0, timeout: 240_000, fetch: requestFetch });
  }
  async check(): Promise<string> {
    await this.client.models.retrieve(this.imageModel);
    await this.client.models.retrieve(this.textModel);
    return 'Key accepted; models are accessible. Available credit is checked on the first generation request.';
  }
  async suggestArtDirection(prompt: string) {
    const response = await this.client.responses.parse({
      model: this.textModel,
      store: false,
      input: [{ role: 'user', content: prompt }],
      text: { format: zodTextFormat(Contracts.artDirectionResult, 'art_direction') },
    });
    if (!response.output_parsed) throw new Error('Art direction was not returned.');
    return response.output_parsed;
  }
  async plan(brief: Brief, profile: Profile, referencePaths: string[] = [], correction = '') {
    const response = await this.client.responses.parse({
      model: this.textModel,
      store: false,
      input: [
        {
          role: 'system',
          content: PromptBuilder.planning(brief, profile, correction),
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: JSON.stringify({ theme: brief.theme, wishes: brief.wishes }) },
            ...(await Promise.all(referencePaths.map((p) => this.inputImage(p)))),
          ],
        },
      ],
      text: {
        format: zodTextFormat(
          profile.visualCatalog ? Contracts.preparedProductionPlan : Contracts.productionPlan,
          'collection_plan',
        ),
      },
    });
    if (!response.output_parsed) throw new Error('Planner did not return a structured plan.');
    return response.output_parsed;
  }
  async proposeSubjects(brief: Brief, profile: Profile, references: string[], correction: string) {
    const response = await this.client.responses.parse({
      model: this.textModel,
      store: false,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: CompositionPlanningPrompts.subjects(brief, profile, correction) },
            ...(await Promise.all(references.map((file) => this.inputImage(file)))),
          ],
        },
      ],
      text: { format: zodTextFormat(CompositionPlanningContracts.concepts, 'semantic_concepts') },
    });
    if (!response.output_parsed) throw new Error('Semantic concepts were not returned.');
    return response.output_parsed;
  }
  async describeComposition(
    brief: Brief,
    profile: Profile,
    blueprints: CompositionBlueprint[],
    references: string[],
    correction: string,
  ) {
    const response = await this.client.responses.parse({
      model: this.textModel,
      store: false,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: CompositionPlanningPrompts.details(brief, profile, blueprints, correction),
            },
            ...(await Promise.all(references.map((file) => this.inputImage(file)))),
          ],
        },
      ],
      text: { format: zodTextFormat(CompositionPlanningContracts.details, 'composition_details') },
    });
    if (!response.output_parsed) throw new Error('Slot descriptions were not returned.');
    return response.output_parsed;
  }
  async reviewPlan(brief: Brief, variant: Plan['variants'][number], profile: Profile, references: string[]) {
    const response = await this.client.responses.parse({
      model: this.textModel,
      store: false,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: PromptBuilder.planReview(brief, variant, profile) },
            ...(await Promise.all(references.map((p) => this.inputImage(p)))),
          ],
        },
      ],
      text: { format: zodTextFormat(SetContract.review, 'plan_review') },
    });
    if (!response.output_parsed) throw new Error('Plan review was not returned.');
    return response.output_parsed;
  }
  async image(prompt: string, referencePaths: string[], quality: Brief['quality']): Promise<ImageResult> {
    const response = await this.client.images.edit({
      model: this.imageModel,
      image: await Promise.all(
        referencePaths.map(async (file) =>
          toFile(await fsp.readFile(file), path.basename(file), { type: 'image/png' }),
        ),
      ),
      prompt: this.prompts.render('OpenAiProvider.image', { prompt: prompt }),
      n: 1,
      quality,
      size: '1024x1024',
      output_format: 'png',
      background: 'opaque',
    });
    const data = response.data?.[0]?.b64_json;
    if (!data) throw new Error('Generator did not return an image.');
    return {
      bytes: Buffer.from(data, 'base64'),
      requestId: response._request_id ?? null,
      usage: response.usage ? { ...response.usage } : null,
    };
  }
  private async inputImage(file: string) {
    return {
      type: 'input_image' as const,
      image_url: `data:image/png;base64,${(await fsp.readFile(file)).toString('base64')}`,
      detail: 'auto' as const,
    };
  }
  async review(card: Card, imagePath: string, referencePaths: string[], profile: Profile, brief?: Brief) {
    const response = await this.client.responses.parse({
      model: this.textModel,
      store: false,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: PromptBuilder.cardReview(card, profile, brief),
            },
            await this.inputImage(imagePath),
            ...(await Promise.all(referencePaths.map((p) => this.inputImage(p)))),
          ],
        },
      ],
      text: {
        format: zodTextFormat(
          profile.activeArtContract?.composition ? Contracts.compositionReview : Contracts.review,
          'card_review',
        ),
      },
    });
    if (!response.output_parsed) throw new Error('Card review was not returned.');
    const review = response.output_parsed;
    return review;
  }
  async reviewSet(
    variant: Variant,
    sheet: string,
    profile: Profile,
    referencePaths: string[] = [],
    brief?: Brief,
  ) {
    const response = await this.client.responses.parse({
      model: this.textModel,
      store: false,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: PromptBuilder.setReview(variant, profile, brief),
            },
            await this.inputImage(sheet),
            ...(await Promise.all(referencePaths.map((p) => this.inputImage(p)))),
          ],
        },
      ],
      text: { format: zodTextFormat(Contracts.detailedSetReview, 'set_review') },
    });
    if (!response.output_parsed) throw new Error('Set review was not returned.');
    const review = response.output_parsed;
    return review;
  }
}
