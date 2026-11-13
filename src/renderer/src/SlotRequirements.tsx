import type { CompositionTarget, CompositionRequirements } from '../../shared/CompositionContract';
import { PatternChips } from './PatternChips';
import { SetComposition } from '../../domain/SetComposition';
import { useLocalization } from './i18n/LocalizationContext';
import { SlotTagEditor } from './SlotTagEditor';

export function SlotRequirements({
  target,
  observed,
  showObserved = true,
  editor,
}: {
  target?: CompositionTarget;
  observed?: CompositionRequirements;
  showObserved?: boolean;
  editor?: Omit<Parameters<typeof SlotTagEditor>[0], 'target'>;
}) {
  const { t } = useLocalization();
  return (
    <section className="slot-requirements">
      <h3>{t('Planned slot tags')}</h3>
      {target ? (
        <>
          <p>
            {t('Category')} {target.category}
          </p>
          {editor ? (
            <SlotTagEditor key={`${target.index}/${editor.revision}`} target={target} {...editor} />
          ) : (
            <PatternChips facets={{ ...target.required, ...target.appearance }} />
          )}
          {target.required.characterCount !== undefined && (
            <p>{t('Acting characters: {count}', { count: target.required.characterCount })}</p>
          )}
          {Object.keys(target.preferred).length > 0 && (
            <details>
              <summary>{t('Composition preferences')}</summary>
              <PatternChips facets={target.preferred} />
            </details>
          )}
        </>
      ) : (
        <p className="muted">{t('This historical run has no slot tag contract.')}</p>
      )}
      {showObserved && (
        <>
          <h3>{t('Detected in selected image')}</h3>
          {observed ? (
            <>
              <PatternChips facets={observed} />
              {observed.characterCount !== undefined && (
                <p>{t('Acting characters: {count}', { count: observed.characterCount })}</p>
              )}
              {target && (
                <p className={SetComposition.matches(observed, target.required) ? 'green' : 'amber'}>
                  {t(
                    SetComposition.matches(observed, target.required)
                      ? 'Required tags match'
                      : 'Required tags differ',
                  )}
                </p>
              )}
            </>
          ) : (
            <p className="muted">{t('Visual tags appear after this image is verified.')}</p>
          )}
        </>
      )}
    </section>
  );
}
