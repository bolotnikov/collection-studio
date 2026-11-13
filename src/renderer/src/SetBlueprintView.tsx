import { useState } from 'react';
import { Image } from 'lucide-react';
import type { ArtContract } from '../../shared/SetContract';
import type { Profile } from '../../shared/Contracts';
import { useLocalization } from './i18n/LocalizationContext';
import { Modal } from './Modal';
import { SlotRequirements } from './SlotRequirements';
import { ReferenceImages } from './ReferenceImages';
import { ReferencePresentation } from './viewmodels/ReferencePresentation';

type Composition = NonNullable<ArtContract['composition']>;
export function SetBlueprintView({
  composition,
  subjects,
  profile,
  proposed = false,
}: {
  composition?: Composition;
  subjects: string[];
  profile: Profile;
  proposed?: boolean;
}) {
  const { t } = useLocalization();
  const [index, select] = useState<number | null>(null);
  if (!composition) return null;
  const target = composition.targets.find((slot) => slot.index === index);
  return (
    <section className="set-blueprint">
      <div className="cards-grid planned-cards">
        {composition.targets.map((slot) => (
          <button className="card-tile" key={slot.index} onClick={() => select(slot.index)}>
            <div className="card-art">
              <div className="image-placeholder">
                <Image size={24} />
                <span>{t(proposed ? 'Preparing the set plan' : 'Queued')}</span>
              </div>
              <span className="card-number">{String(slot.index + 1).padStart(2, '0')}</span>
            </div>
            <div className="card-caption">
              <strong>{subjects[slot.index]}</strong>
              <span>
                {t('Category')} {slot.category}
              </span>
            </div>
          </button>
        ))}
      </div>
      {target && (
        <Modal
          title={`${t('Slot')} ${target.index + 1} · ${subjects[target.index]}`}
          onClose={() => select(null)}
        >
          <SlotRequirements target={target} showObserved={false} />
          {Boolean(target.referenceIds?.length) && (
            <>
              <h3>{t('Planning references')}</h3>
              <ReferenceImages references={ReferencePresentation.planned(profile, target)} />
              <details>
                <summary>
                  {t('Matching candidates')} · {target.referenceIds?.length}
                </summary>
                <ReferenceImages references={ReferencePresentation.candidates(profile, target)} />
              </details>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
