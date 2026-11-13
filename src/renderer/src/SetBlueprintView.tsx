import { useState } from 'react';
import type { ArtContract } from '../../shared/SetContract';
import type { Profile } from '../../shared/Contracts';
import { useLocalization } from './i18n/LocalizationContext';
import { Modal } from './Modal';
import { SlotRequirements } from './SlotRequirements';

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
  const title =
    composition.selection?.sourceSetTitle ??
    profile.knowledge?.images.find((image) => image.id === composition.sourceSetIds[0])?.title;
  const target = composition.targets.find((slot) => slot.index === index);
  return (
    <section className="set-blueprint">
      <h3>{t(proposed ? 'Proposed composition' : 'Selected composition')}</h3>
      {composition.aggregate ? (
        <p>
          {t('Composition based on {count} reference sets', { count: composition.aggregate.sourceSetCount })}
        </p>
      ) : (
        <p>
          {t('Source set')}: <strong>{title ?? t('Source prototype')}</strong>
        </p>
      )}
      <div className="pattern-chips">
        {['1', '2', '3', '4', '5'].map((category) => {
          const count = composition.targets.filter((target) => target.category === category).length;
          return count ? (
            <span key={category}>
              {t('Category')} {category} · {count}
            </span>
          ) : null;
        })}
      </div>
      <details open={proposed || undefined}>
        <summary>{t('Ten planned slots')}</summary>
        <div className="blueprint-slots">
          {composition.targets.map((slot) => (
            <button key={slot.index} onClick={() => select(slot.index)}>
              <span>{String(slot.index + 1).padStart(2, '0')}</span>
              <strong>{subjects[slot.index]}</strong>
              <small>
                {t('Category')} {slot.category}
              </small>
            </button>
          ))}
        </div>
      </details>
      {target && (
        <Modal
          title={`${t('Slot')} ${target.index + 1} · ${subjects[target.index]}`}
          onClose={() => select(null)}
        >
          <SlotRequirements target={target} />
        </Modal>
      )}
    </section>
  );
}
