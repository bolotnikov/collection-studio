import type { SourceKnowledge } from '../../shared/KnowledgeContracts';
import { Assets } from './Assets';
import { useLocalization } from './i18n/LocalizationContext';

export function SourceKnowledgeView({ corpus }: { corpus: SourceKnowledge }) {
  const { t } = useLocalization();
  return (
    <section>
      <p className="form-note">
        {t(
          'Source documents remain authoritative. Visual analyses are interpretations, not replacements for the rules.',
        )}
      </p>
      {corpus.documents.map((document) => (
        <details className="library-guidance" key={document.id}>
          <summary>{document.title}</summary>
          <p className="form-note">
            {t(
              ['assignment', 'collection-structure', 'composition-rules'].includes(document.role)
                ? 'Used in planning, generation and verification'
                : 'Reference inventory or delivery context',
            )}
          </p>
          <pre className="source-document">{document.text}</pre>
          <a href={document.source} target="_blank" rel="noreferrer">
            {t('Original source')}
          </a>
        </details>
      ))}
      <h2>{t('Original collection sets')}</h2>
      <p className="form-note">
        {t('Analyzed as complete sets; relevant examples guide planning and whole-set verification.')}
      </p>
      <div className="knowledge-grid">
        {corpus.images
          .filter((i) => i.role === 'collection-example')
          .map((image) => (
            <figure key={image.id}>
              <img loading="lazy" src={Assets.knowledge(image.filename)} alt={image.title} />
              <figcaption>{image.title}</figcaption>
            </figure>
          ))}
      </div>
      <h2>{t('Composition examples')}</h2>
      <div className="knowledge-grid">
        {corpus.images
          .filter((i) => i.role === 'category-example')
          .map((image) => (
            <figure key={image.id}>
              <img
                loading="lazy"
                src={Assets.knowledge(image.filename)}
                alt={`${t('Category')} ${image.category}`}
              />
              <figcaption>
                {t('Category')} {image.category}
                {image.category === '5' ? ` · ${t('Exclusion example only')}` : ''}
              </figcaption>
            </figure>
          ))}
      </div>
      <p className="form-note">
        {t('Four result templates are retained for delivery and never used as generation style references.')}
      </p>
    </section>
  );
}
