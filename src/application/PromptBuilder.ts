import { PromptCatalog } from './prompts/PromptCatalog';
import type { Brief, Plan, Card, Profile, Variant } from '../shared/Contracts';
import { SetComposition } from '../domain/SetComposition';

export class PromptBuilder {
  static cardReview(card: Card, profile: Profile, brief?: Brief): string {
    return PromptCatalog.render(
      'review.card',
      {
        reviewRubric: PromptBuilder.reviewRubric(profile),
        sourceContext: PromptBuilder.sourceContext(profile, card.category),
        producerRequirements: JSON.stringify(brief ? { theme: brief.theme, wishes: brief.wishes } : {}),
        subject: card.subject,
        description:
          profile.promptCatalog?.['generation.context.v1'] || !profile.promptCatalog
            ? JSON.stringify({ description: card.description, role: card.role, visual: card.visual ?? null })
            : card.description,
        category: card.category,
        categoryRules: profile.categories[card.category],
        styleRules: JSON.stringify({
          rendering: profile.rules,
          acceptanceMinimumStyle: profile.reviewStyleThreshold ?? 4,
        }),
      },
      profile.promptCatalog,
    );
  }
  static setReview(variant: Variant, profile: Profile, brief?: Brief): string {
    return PromptCatalog.render(
      'review.set',
      {
        reviewRubric: PromptBuilder.reviewRubric(profile),
        sourceContext: PromptBuilder.sourceContext(profile, undefined, 'set-review'),
        setReviewRubric: PromptBuilder.setReviewRubric(profile),
        producerRequirements: JSON.stringify(brief ? { theme: brief.theme, wishes: brief.wishes } : {}),
        setTitle: variant.title,
        setConcept: variant.concept,
        cards: JSON.stringify(
          variant.cards.map((c) => ({
            id: c.id,
            subject: c.subject,
            category: c.category,
            role: c.role,
            visual: c.visual,
          })),
        ),
        rules: JSON.stringify({
          rendering: profile.rules,
          categories: profile.categories,
          acceptanceMinimumStyle: profile.reviewStyleThreshold ?? 4,
        }),
      },
      profile.promptCatalog,
    );
  }
  static planning(brief: Brief, profile: Profile, correction = ''): string {
    return PromptCatalog.render(
      'PromptBuilder.planning',
      {
        sourceContext: this.sourceContext(profile),
        setCount: brief.variants,
        categories: JSON.stringify(
          profile.visualCatalog
            ? {
                definitions: profile.categories,
                sourceComposition: SetComposition.catalogSummary(
                  profile.visualCatalog,
                  Boolean(brief.includeGold),
                ),
              }
            : profile.categories,
        ),
        rules: JSON.stringify(profile.rules),
        brief: JSON.stringify(brief),
        correction: correction,
      },
      profile.promptCatalog,
    );
  }
  static planReview(brief: Brief, variant: Plan['variants'][number], profile: Profile): string {
    return PromptCatalog.render(
      'PromptBuilder.planReview',
      {
        sourceContext: this.sourceContext(profile),
        brief: JSON.stringify(brief),
        proposedSet: JSON.stringify(variant),
        rules: JSON.stringify({ rendering: profile.rules, categories: profile.categories }),
      },
      profile.promptCatalog,
    );
  }

  static sourceContext(
    profile: Profile,
    category?: Card['category'],
    stage: 'planning' | 'card' | 'set-review' = category ? 'card' : 'planning',
  ): string {
    if (!profile.knowledge && !profile.requirements && !profile.inputManifest) return '';
    const documents =
      profile.knowledge?.documents.filter((d) =>
        ['assignment', 'collection-structure', 'composition-rules'].includes(d.role),
      ) ?? [];
    const evidence = profile.knowledgeContext;
    const analysis =
      profile.requirements && evidence
        ? {
            stage: evidence.stage,
            guidance: evidence.guidance,
            images: evidence.images
              .filter(
                (image) =>
                  (image.category !== '5' || image.attached || category === '5') &&
                  (!category || image.role !== 'category-example' || image.category === category),
              )
              .map((image) => ({
                id: image.id,
                role: image.role,
                category: image.category,
                attached: image.attached,
                reason: image.reason,
                analysis: image.analysis,
              })),
            cleanSets: evidence.cleanSets?.map((sheet) => ({
              sourceImageId: sheet.sourceImageId,
              layout: sheet.layout,
              reason: sheet.reason,
              attached: sheet.attached,
              slots: sheet.cards.map((card) => ({ slot: card.slot, use: card.use })),
            })),
          }
        : (evidence ?? null);
    return PromptCatalog.render(
      'PromptBuilder.sourceContext',
      {
        documents: JSON.stringify(
          profile.requirements?.filter((section) => !section.stages || section.stages.includes(stage)) ??
            documents,
        ),
        analysis: JSON.stringify(
          profile.inputManifest?.length ||
            (profile.promptCatalog?.['generation.context.v1'] && stage !== 'card')
            ? { source: analysis, inputOrder: profile.inputManifest ?? this.sourceInputOrder(profile, stage) }
            : analysis,
        ),
      },
      profile.promptCatalog,
    );
  }

  private static sourceInputOrder(profile: Profile, stage: string) {
    const evidence = profile.knowledgeContext;
    const originals = profile.references
      .slice(0, evidence ? 4 : 8)
      .map((reference) => ({ id: reference.id, role: 'original-rendering', category: reference.category }));
    const source = [
      ...(evidence?.cleanSets ?? [])
        .filter((sheet) => sheet.attached)
        .map((sheet) => ({ id: sheet.sourceImageId, role: 'primary-clean-set' })),
      ...(evidence?.images ?? [])
        .filter((image) => image.attached)
        .map((image) => ({ id: image.id, role: image.role, category: image.category })),
    ];
    const ordered =
      stage === 'set-review'
        ? [
            { role: 'candidate-set' },
            ...(evidence?.cleanSets?.length ? [...source, ...originals] : [...originals, ...source]),
          ]
        : [...originals, ...source];
    return ordered.map((reference, index) => ({ image: index + 1, ...reference }));
  }

  static setReviewRubric(profile?: Profile): string {
    return PromptCatalog.render('PromptBuilder.setReviewRubric', {}, profile?.promptCatalog);
  }

  static reviewRubric(profile?: Profile): string {
    return (
      PromptCatalog.render('PromptBuilder.reviewRubric', {}, profile?.promptCatalog) +
      (profile?.activeArtContract
        ? '\n' +
          PromptCatalog.render(
            'review.artContract',
            { contract: profile.activeArtContract },
            profile.promptCatalog,
          )
        : '')
    );
  }

  static build(card: Card, variant: Variant, profile: Profile, correction = ''): string {
    return PromptCatalog.render(
      'PromptBuilder.build',
      {
        sourceContext: PromptBuilder.sourceContext(profile, card.category),
        setTitle: variant.title,
        setConcept: variant.concept,
        artContract: JSON.stringify(variant.artContract ?? null),
        setCards: JSON.stringify(
          variant.cards.map((c) => ({
            subject: c.subject,
            category: c.category,
            role: c.role,
          })),
        ),
        cardVisualRequirements: JSON.stringify(card.visual ?? null),
        subject: card.subject,
        description: card.description,
        role: card.role,
        category: card.category,
        categoryRules: profile.categories[card.category],
        rules: profile.rules.join('\n'),
        correction: correction
          ? PromptCatalog.render('correction.card', { correction }, profile.promptCatalog)
          : '',
      },
      profile.promptCatalog,
    );
  }
}
