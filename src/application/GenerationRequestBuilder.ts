import path from 'node:path';
import type { CompositionTarget } from '../shared/CompositionContract';
import type { Brief, Card, Profile } from '../shared/Contracts';
import type { PreparedStyle } from './style/StylePreparationPort';
import type { SourceContext } from './style/SourceContextPort';
import { PromptCatalog } from './prompts/PromptCatalog';
import { EnvironmentBackdrops } from '../domain/EnvironmentBackdrops';
import { ManualSlotTagPrompts } from './prompts/ManualSlotTagPrompts';
import type { Variant } from '../shared/Contracts';

/** Binds image roles to the actual provider input order, including a bounded revision base. */
export class GenerationRequestBuilder {
  build(input: {
    prompt: string;
    target?: CompositionTarget;
    profile: Profile;
    brief: Brief;
    card: Card;
    variant?: Variant;
    references: string[];
    prepared?: PreparedStyle;
    sourceContext?: SourceContext;
    instruction: string;
    manualTagInstruction?: string;
    previous?: { id: string; path: string };
  }): {
    prompt: string;
    references: string[];
    reviewManifest?: Profile['inputManifest'];
    generationManifest?: Profile['inputManifest'];
  } {
    const { profile, sourceContext, prepared } = input;
    const references = [...input.references, ...(sourceContext?.referencePaths ?? [])];
    const prompts = new PromptCatalog(profile.promptCatalog);
    const basePrompt =
      input.target?.appearance && prompts.values['generation.appearance.v1']
        ? input.prompt +
          '\n' +
          prompts.render('generation.appearance.v1', { appearance: input.target.appearance })
        : input.prompt;
    const prompt =
      basePrompt +
      (input.variant
        ? ManualSlotTagPrompts.render(
            profile,
            input.variant,
            [input.card],
            input.manualTagInstruction ?? input.instruction,
          )
        : '');
    if (!prompts.values['generation.context.v1']) return { prompt, references };
    if (prepared && prepared.references.length !== prepared.evidence.references.length)
      throw new Error('Generation reference evidence must match the attached images.');
    const attachments = input.references.map((file, index) => {
      const evidence = prepared?.evidence.references[index];
      const original = [...(profile.library ?? []), ...profile.references].find(
        (item) => item.filename === path.basename(file),
      );
      const category = evidence?.category ?? original?.category;
      return {
        image: index + 1,
        id: evidence?.id ?? original?.id,
        role:
          evidence?.origin === 'user'
            ? 'supplemental'
            : category === input.card.category &&
                (!evidence?.purposes || evidence.purposes.includes('category'))
              ? 'original-category'
              : 'original-rendering',
        category,
        take: evidence?.take,
        ignore: evidence?.ignore,
        background: EnvironmentBackdrops.evidence(
          profile.library?.find((item) => item.id === original?.id)?.observation,
        ),
      };
    });
    const sourceImages = sourceContext?.evidence.images.filter((image) => image.attached) ?? [];
    const sourceAttachments = (sourceContext?.referencePaths ?? []).map((_file, index) => ({
      image: input.references.length + index + 1,
      id: sourceImages[index]?.id,
      role: sourceImages[index]?.role ?? 'source-context',
      category: sourceImages[index]?.category,
    }));
    const previous = input.instruction.trim() ? input.previous : undefined;
    const previousCandidate = previous
      ? { image: references.length + 1, id: previous.id, role: 'previous-candidate' }
      : null;
    if (previous) references.push(previous.path);
    return {
      generationManifest: [
        ...attachments,
        ...sourceAttachments,
        ...(previousCandidate ? [previousCandidate] : []),
      ],
      reviewManifest: [
        { image: 1, role: 'candidate' },
        ...[...attachments, ...sourceAttachments].map((attachment) => ({
          ...attachment,
          image: attachment.image + 1,
        })),
      ],
      prompt: prompts.render('generation.context.v1', {
        prompt,
        producerRequirements: {
          theme: input.brief.theme,
          wishes: input.brief.wishes,
          currentSetState: profile.compositionState,
        },
        attachments: [
          ...attachments,
          ...sourceAttachments,
          ...(previousCandidate ? [previousCandidate] : []),
        ],
        revision: { instruction: input.instruction, previousCandidate },
      }),
      references,
    };
  }
}
