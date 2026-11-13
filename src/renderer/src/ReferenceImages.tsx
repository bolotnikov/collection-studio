import { useState } from 'react';
import type { ReferenceImage } from './viewmodels/ReferencePresentation';
import { useLocalization } from './i18n/LocalizationContext';
import { Modal } from './Modal';

export function ReferenceImages({ references }: { references: ReferenceImage[] }) {
  const { t, text } = useLocalization();
  const [expanded, setExpanded] = useState<ReferenceImage | null>(null);
  return (
    <>
      <div className="chosen-reference-grid">
        {references.map((reference, index) => (
          <button
            key={`${reference.id}-${index}`}
            onClick={() => setExpanded(reference)}
            aria-label={reference.title}
          >
            <img src={reference.src} alt={reference.title} loading="lazy" />
            <span>
              {reference.number ? `${reference.number}. ` : ''}
              {text(reference.role)}
            </span>
          </button>
        ))}
      </div>
      {expanded && (
        <Modal title={expanded.title} onClose={() => setExpanded(null)}>
          <img className="reference-expanded" src={expanded.src} alt={expanded.title} />
          <p>{text(expanded.role)}</p>
          {expanded.take && (
            <p>
              <strong>{t('Use')}: </strong>
              {expanded.take}
            </p>
          )}
          {expanded.ignore && (
            <p>
              <strong>{t('Do not copy')}: </strong>
              {expanded.ignore}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
