import { PromptCatalog } from './prompts/PromptCatalog';
import type { Brief, Plan, Card, Profile, Variant } from '../shared/Contracts';

export class PromptBuilder {
  static cardReview(card: Card, profile: Profile, brief?: Brief): string {
    return PromptCatalog.render(
      'review.card',
      {
        reviewRubric: PromptBuilder.reviewRubric(profile),
        sourceContext: PromptBuilder.sourceContext(profile),
        producerRequirements: JSON.stringify(brief ? { theme: brief.theme, wishes: brief.wishes } : {}),
        subject: card.subject,
        description: card.description,
        category: card.category,
        categoryRules: profile.categories[card.category],
        styleRules: JSON.stringify(profile.rules),
      },
      profile.promptCatalog,
    );
  }
  static setReview(variant: Variant, profile: Profile, brief?: Brief): string {
    return PromptCatalog.render(
      'review.set',
      {
        reviewRubric: PromptBuilder.reviewRubric(profile),
        sourceContext: PromptBuilder.sourceContext(profile),
        setReviewRubric: PromptBuilder.setReviewRubric(profile),
        producerRequirements: JSON.stringify(brief ? { theme: brief.theme, wishes: brief.wishes } : {}),
        setTitle: variant.title,
        setConcept: variant.concept,
        cards: JSON.stringify(
          variant.cards.map((c) => ({ id: c.id, subject: c.subject, category: c.category })),
        ),
        rules: JSON.stringify(profile.rules),
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
        categories: JSON.stringify(profile.categories),
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
        rules: JSON.stringify(profile.rules),
      },
      profile.promptCatalog,
    );
  }

  static sourceContext(profile: Profile): string {
    if (!profile.knowledge) return '';
    const documents = profile.knowledge.documents.filter((d) =>
      ['assignment', 'collection-structure', 'composition-rules'].includes(d.role),
    );
    return PromptCatalog.render(
      'PromptBuilder.sourceContext',
      { documents: JSON.stringify(documents), analysis: JSON.stringify(profile.knowledgeContext ?? null) },
      profile.promptCatalog,
    );
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
        sourceContext: PromptBuilder.sourceContext(profile),
        setTitle: variant.title,
        setConcept: variant.concept,
        artContract: JSON.stringify(variant.artContract ?? null),
        setCards: JSON.stringify(
          variant.cards.map((c) => ({
            subject: c.subject,
            category: c.category,
            role: c.role,
            visual: c.visual,
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
