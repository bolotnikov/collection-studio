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
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { Contracts, type Brief, type Card, type Profile, type Variant } from '../shared/Contracts';
import type { GenerationPort } from '../application/GenerationPort';
import { CodexRunner } from './CodexRunner';
import { GenerationRepairContracts } from '../shared/GenerationRepairContracts';

export class CodexProvider implements GenerationPort, ArtDirectionPort {
  constructor(
    private readonly runner: CodexRunner,
    private readonly prompts = new PromptCatalog(),
    private readonly planner: CodexRunner = runner,
  ) {}
  async verifyComposition(prompt: string, imagePath: string, references: string[]) {
    return (
      await this.runner.run(
        prompt,
        Contracts.repairableCompositionObservation,
        [imagePath, ...references],
        false,
        'CodexProvider.verifyComposition',
      )
    ).value;
  }
  async verifySetComposition(prompt: string, contactSheet: string) {
    return (
      await this.runner.run(
        prompt,
        GenerationRepairContracts.setObservation,
        [contactSheet],
        false,
        'CodexProvider.verifySetComposition',
      )
    ).value;
  }
  async designSlotSet(
    brief: Brief,
    profile: Profile,
    slots: import('../shared/CompositionPlanningContracts').SlotPlan[],
    references: string[],
    correction: string,
  ) {
    return (
      await this.planner.run(
        CompositionPlanningPrompts.design(brief, profile, slots, correction, references),
        profile.subjectUniqueness === 'batch-unique-v1' && brief.variants > 1
          ? CompositionPlanningContracts.batchAssignedSubjects
          : CompositionPlanningContracts.assignedSubjects,
        references,
        false,
        'CodexProvider.designSlotSet',
      )
    ).value;
  }
  async suggestArtDirection(prompt: string) {
    return (
      await this.runner.run(
        prompt,
        Contracts.artDirectionResult,
        [],
        false,
        'CodexProvider.suggestArtDirection',
      )
    ).value;
  }
  async plan(brief: Brief, profile: Profile, referencePaths: string[] = [], correction = '') {
    return (
      await this.planner.run(
        PromptBuilder.planning(brief, profile, correction),
        profile.visualCatalog ? Contracts.preparedProductionPlan : Contracts.productionPlan,
        referencePaths,
        false,
        'CodexProvider.plan',
      )
    ).value;
  }
  async proposeSubjects(brief: Brief, profile: Profile, references: string[], correction: string) {
    return (
      await this.planner.run(
        CompositionPlanningPrompts.subjects(brief, profile, correction),
        CompositionPlanningContracts.conceptProposal,
        references,
        false,
        'CodexProvider.proposeSubjects',
      )
    ).value;
  }
  async describeComposition(
    brief: Brief,
    profile: Profile,
    blueprints: CompositionBlueprint[],
    references: string[],
    correction: string,
  ) {
    return (
      await this.planner.run(
        CompositionPlanningPrompts.details(brief, profile, blueprints, correction),
        CompositionPlanningContracts.descriptionProposal,
        references,
        false,
        'CodexProvider.describeComposition',
      )
    ).value;
  }
  async reviewPlan(brief: Brief, variant: Plan['variants'][number], profile: Profile, references: string[]) {
    return (
      await this.runner.run(
        PromptBuilder.planReview(brief, variant, profile, references),
        SetContract.review,
        references,
        false,
        'CodexProvider.reviewPlan',
      )
    ).value;
  }
  async image(prompt: string, references: string[], quality: Brief['quality']) {
    const historicalQuality = this.prompts.values['CodexProvider.image']?.includes('{{quality}}');
    const schema = z.object({ success: z.boolean(), tool: z.string(), message: z.string() });
    const result = await this.runner.run(
      this.prompts.render('CodexProvider.image', { prompt, ...(historicalQuality ? { quality } : {}) }),
      schema,
      references,
      true,
      'CodexProvider.image',
    );
    if (!result.usage?.imageArtifact && (!result.value.success || !result.value.tool.includes('image_gen')))
      throw new Error(result.value.message || 'Codex did not confirm image generation.');
    const bytes = await fs.readFile(path.join(result.folder, 'image.png'));
    return {
      bytes,
      requestId: result.threadId,
      usage: {
        ...result.usage,
        provider: 'codex',
        jobFolder: path.basename(result.folder),
        ...(historicalQuality ? { qualityRequested: quality } : {}),
        qualityControl: historicalQuality ? 'prompt-only' : 'native',
      },
    };
  }
  async review(card: Card, imagePath: string, references: string[], profile: Profile, brief?: Brief) {
    const prompt = PromptBuilder.cardReview(card, profile, brief);
    const review = (
      await this.runner.run(
        prompt,
        profile.activeArtContract?.composition ? Contracts.compositionReview : Contracts.review,
        [imagePath, ...references],
        false,
        'CodexProvider.review',
      )
    ).value;
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
    const review = (
      await this.runner.run(
        prompt,
        Contracts.detailedSetReview,
        [sheet, ...referencePaths],
        false,
        'CodexProvider.reviewSet',
      )
    ).value;
    return review;
  }
}
