import type { SourceKnowledge } from '../../shared/KnowledgeContracts';
import { Assets } from './Assets';
import { useLocalization } from './i18n/LocalizationContext';

export function SetReferenceView({ corpus }: { corpus: SourceKnowledge }) {
  const { t, text } = useLocalization();
  const title = (name: string) =>
    name
      .replace(/^\d+_(Collection_)?/, '')
      .replace(/_test_\d+(_new)?/, '')
      .replace(/\.png$/i, '')
      .replaceAll('_', ' ')
      .replace('Boyscoute', 'Boy Scout');
  return (
    <section className="set-reference-library">
      <h2>{t('Set references')}</h2>
      <p className="form-note">
        {t(
          'Examples of theme, color rhythm and composition across ten cards. Clean ordinary sets guide the final review.',
        )}
      </p>
      <div className="knowledge-grid">
        {corpus.images
          .filter(
            (image) =>
              image.role === 'collection-example' &&
              (!corpus.cleanSets || corpus.cleanSets.some((sheet) => sheet.sourceImageId === image.id)),
          )
          .map((image) => {
            const clean = corpus.cleanSets?.find((sheet) => sheet.sourceImageId === image.id);
            return (
              <figure key={image.id}>
                <img
                  loading="lazy"
                  src={Assets.knowledge(clean?.filename ?? image.filename)}
                  alt={title(image.title)}
                />
                <figcaption>
                  <strong>{text(title(image.title))}</strong>
                  <span className={`small-badge ${clean?.primaryEligible ? 'primary-reference' : ''}`}>
                    {t(clean?.primaryEligible ? 'Primary reference' : 'Context reference')}
                  </span>
                </figcaption>
                {clean && !clean.primaryEligible && (
                  <p className="form-note">
                    {t(
                      'Contains gold character cards. Used for context, not as an ordinary-set quality target.',
                    )}
                  </p>
                )}
                {clean && (
                  <details>
                    <summary>{t('Original screenshot')}</summary>
                    <img loading="lazy" src={Assets.knowledge(image.filename)} alt={title(image.title)} />
                  </details>
                )}
              </figure>
            );
          })}
      </div>
    </section>
  );
}
