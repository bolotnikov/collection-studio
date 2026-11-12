import path from 'node:path';
import type { Brief, Card, Profile } from '../shared/Contracts';
import type { PreparedStyle } from './style/StylePreparationPort';
import type { SourceContext } from './style/SourceContextPort';
import { PromptCatalog } from './prompts/PromptCatalog';

/** Binds image roles to the actual provider input order, including a bounded revision base. */
export class GenerationRequestBuilder {
  build(input: {
    prompt: string;
    profile: Profile;
    brief: Brief;
    card: Card;
    references: string[];
    prepared?: PreparedStyle;
    sourceContext?: SourceContext;
    instruction: string;
    previous?: { id: string; path: string };
  }): { prompt: string; references: string[]; reviewManifest?: Profile['inputManifest'] } {
    const { profile, sourceContext, prepared } = input;
    const references = [...input.references, ...(sourceContext?.referencePaths ?? [])];
    const prompts = new PromptCatalog(profile.promptCatalog);
    if (!prompts.values['generation.context.v1']) return { prompt: input.prompt, references };
    if (prepared && prepared.references.length !== prepared.evidence.references.length)
      throw new Error('Generation reference evidence must match the attached images.');
    const attachments = input.references.map((file, index) => {
      const evidence = prepared?.evidence.references[index];
      const original = profile.references.find((item) => item.filename === path.basename(file));
      const category = evidence?.category ?? original?.category;
      return {
        image: index + 1,
        id: evidence?.id ?? original?.id,
        role:
          evidence?.origin === 'user'
            ? 'supplemental'
            : category === input.card.category
              ? 'original-category'
              : 'original-rendering',
        category,
        take: evidence?.take,
        ignore: evidence?.ignore,
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
      reviewManifest: [
        { image: 1, role: 'candidate' },
        ...[...attachments, ...sourceAttachments].map((attachment) => ({
          ...attachment,
          image: attachment.image + 1,
        })),
      ],
      prompt: prompts.render('generation.context.v1', {
        prompt: input.prompt,
        producerRequirements: { theme: input.brief.theme, wishes: input.brief.wishes },
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
