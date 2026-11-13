import { useMemo } from 'react';
import type { CatalogCard, CatalogSet } from '../../shared/VisualCatalogContracts';
import { VisualPatterns } from '../../domain/VisualPatterns';
import { RangeStatistic } from './RangeStatistic';
import { useLocalization } from './i18n/LocalizationContext';

export function SetCompositionSummary({ sets, cards }: { sets: CatalogSet[]; cards: CatalogCard[] }) {
  const { t, text } = useLocalization();
  const rows = useMemo(() => VisualPatterns.ranges(sets, cards).filter((row) => row.max > 0), [sets, cards]);
  if (!sets.length) return <p>{t('No reference sets in this selection.')}</p>;
  return (
    <div className="set-statistics">
      <p className="muted">
        {t('Based on {count} reference sets. Hover over a value for an explanation.', { count: sets.length })}
      </p>
      <div className="range-grid">
        {rows
          .filter((row) => row.tag.startsWith('category:'))
          .map((row) => (
            <RangeStatistic key={row.tag} name={`${t('Category')} ${row.tag.split(':')[1]}`} {...row} />
          ))}
      </div>
      <details className="set-pattern-statistics">
        <summary>{t('Statistics by visual attribute')}</summary>
        <p className="muted">
          {t('Individual attribute counts per set. These ranges do not define slot combinations.')}
        </p>
        <div className="pattern-statistics-groups">
          {VisualPatterns.dimensions.map((axis) => {
            const values = rows.filter((row) => row.tag.startsWith(axis.key + ':'));
            return values.length ? (
              <details key={axis.key}>
                <summary>{text(axis.label)}</summary>
                <div className="range-grid">
                  {values.map((row) => (
                    <RangeStatistic key={row.tag} name={text(VisualPatterns.label(row.tag))} {...row} />
                  ))}
                </div>
              </details>
            ) : null;
          })}
        </div>
      </details>
    </div>
  );
}
