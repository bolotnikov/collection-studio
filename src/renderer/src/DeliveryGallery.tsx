import { LoaderCircle, Maximize2 } from 'lucide-react';
import type { Run, StudioApi, Variant } from '../../shared/Contracts';
import { Assets } from './Assets';
import { Modal } from './Modal';
import { useLocalization } from './i18n/LocalizationContext';
import { useDeliveryViewModel } from './viewmodels/useDeliveryViewModel';

export function DeliveryGallery({ api, run, variant }: { api: StudioApi; run: Run; variant: Variant }) {
  const { t, text } = useLocalization();
  const { previews, loading, error, retry, expanded, setExpanded } = useDeliveryViewModel(
    api,
    run.id,
    variant.id,
    variant.cards.map((card) => card.selectedAttemptId).join(':'),
  );
  const names = {
    orange: 'Orange window',
    pink: 'Pink window',
    violet: 'Violet window',
    blue: 'Blue window',
  } as const;
  return (
    <section className="delivery-gallery">
      <h3>{t('In-game previews')}</h3>
      {loading && (
        <p className="delivery-loading">
          <LoaderCircle className="spin" size={16} />
          {t('Preparing four previews…')}
        </p>
      )}
      {error && (
        <div>
          <p className="inline-error">{text(error)}</p>
          <button onClick={retry}>{t('Retry previews')}</button>
        </div>
      )}
      <div className="delivery-grid">
        {previews.map((preview) => (
          <button
            className="delivery-preview"
            key={preview.id}
            onClick={() => setExpanded(preview)}
            aria-label={t(names[preview.id])}
          >
            <img src={Assets.image(run, preview.filename)} alt={t(names[preview.id])} />
            <span>
              {t(names[preview.id])}
              <Maximize2 size={14} />
            </span>
          </button>
        ))}
      </div>
      {previews.length > 0 && (
        <p className="form-note">
          {t(
            'Original template captions and counters are retained. All four previews are included in the export.',
          )}
        </p>
      )}
      {expanded && (
        <Modal title={t(names[expanded.id])} onClose={() => setExpanded(null)}>
          <img
            className="delivery-expanded"
            src={Assets.image(run, expanded.filename)}
            alt={t(names[expanded.id])}
          />
        </Modal>
      )}
    </section>
  );
}
