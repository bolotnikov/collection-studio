import { useEffect, useState } from 'react';
import type { LibraryItem } from '../../shared/StyleContracts';
import { VisualCatalogContracts, type CardObservation } from '../../shared/VisualCatalogContracts';
import { VisualPatterns } from '../../domain/VisualPatterns';
import { Assets } from './Assets';
import { useLocalization } from './i18n/LocalizationContext';
import { PatternChips } from './PatternChips';

export function KnowledgeCardDetails({
  item,
  examples,
  busy,
  save,
  remove,
}: {
  item: LibraryItem;
  examples: { id: string; category: string | null }[];
  busy: boolean;
  save: (observation: CardObservation) => Promise<boolean | undefined>;
  remove: () => void;
}) {
  const { t, text } = useLocalization();
  const initial = item.observation;
  const [editing, setEditing] = useState(!initial);
  const [draft, setDraft] = useState<CardObservation>(
    initial ?? {
      category: item.metadata?.category ?? '1',
      subject: item.title,
      confidence: 1,
      categoryRationale: 'Классификация задана пользователем.',
      exemplarIds: examples.slice(0, 1).map((x) => x.id),
      alternatives: [],
      uncertainties: [],
      facets: {
        support: 'none',
        backdrop: 'plain',
        pattern: 'none',
        depth: 'flat',
        contextDensity: 'none',
        camera: 'three-quarter',
        subjectScale: 'large',
        characterCount: 0,
        palette: [],
        materials: [],
        silhouette: 'Простой читаемый силуэт',
        rendering: 'Стилизованная объёмная иллюстрация',
        lighting: 'Мягкий направленный свет',
      },
    },
  );
  const [error, setError] = useState('');
  useEffect(() => {
    if (!editing && initial) setDraft(initial);
  }, [initial, editing]);
  return (
    <div className="knowledge-card-detail">
      <img className="knowledge-detail-image" src={Assets.reference(item.filename)} alt={item.title} />
      <div className="knowledge-detail-body">
        <div className="actions">
          <button disabled={busy} onClick={() => setEditing(!editing)}>
            {t('Edit')}
          </button>
          <button disabled={busy} onClick={remove}>
            {t('Delete')}
          </button>
        </div>
        {!editing && initial ? (
          <>
            <h3>{initial.subject}</h3>
            <p>
              {t('Category')} {initial.category}
            </p>
            <PatternChips facets={initial.facets} />
            <p>{initial.categoryRationale}</p>
            <dl>
              <dt>{t('Materials')}</dt>
              <dd>{initial.facets.materials.join(', ')}</dd>
              <dt>{t('Rendering rules')}</dt>
              <dd>{initial.facets.rendering}</dd>
              <dt>{t('Lighting')}</dt>
              <dd>{initial.facets.lighting}</dd>
              {initial.environment && (
                <>
                  <dt>{t('Major background shapes')}</dt>
                  <dd>{initial.environment.majorShapes.join('; ')}</dd>
                  <dt>{t('Secondary background objects')}</dt>
                  <dd>{initial.environment.secondaryObjects.join('; ') || t('No separate objects')}</dd>
                  <dt>{t('Small background details')}</dt>
                  <dd>{initial.environment.smallDetails.join('; ') || '—'}</dd>
                  <dt>{t('Background placement')}</dt>
                  <dd>{initial.environment.layout}</dd>
                </>
              )}
            </dl>
            {initial.uncertainties.length > 0 && (
              <details>
                <summary>{t('Classification notes')}</summary>
                <ul>
                  {initial.uncertainties.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = VisualCatalogContracts.observation.safeParse(draft);
              if (!parsed.success) {
                setError(parsed.error.issues[0]?.message ?? 'Invalid observation');
                return;
              }
              void save(parsed.data).then((saved) => {
                if (saved) setEditing(false);
              });
            }}
          >
            <label>
              {t('Description')}
              <textarea
                required
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              />
            </label>
            <label>
              {t('Category')}
              <select
                value={draft.category}
                onChange={(e) => {
                  const category = VisualCatalogContracts.category.parse(e.target.value);
                  setDraft({
                    ...draft,
                    category,
                    exemplarIds: examples.filter((x) => x.category === category).map((x) => x.id),
                  });
                }}
              >
                {['1', '2', '3', '4', '5'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <div className="pattern-edit-grid">
              {VisualPatterns.dimensions.map((axis) => {
                const values: Record<string, unknown> = { ...draft.facets };
                return (
                  <label key={axis.key}>
                    {text(axis.label)}
                    <select
                      value={typeof values[axis.key] === 'string' ? String(values[axis.key]) : ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          facets: { ...draft.facets, [axis.key]: e.target.value || undefined },
                        })
                      }
                    >
                      <option value="">{t('Not specified')}</option>
                      {axis.values.map((option) => (
                        <option key={option.value} value={option.value}>
                          {text(option.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
            {draft.environment ? (
              <fieldset>
                <legend>{t('Background observations')}</legend>
                {(['majorShapes', 'secondaryObjects', 'smallDetails'] as const).map((key) => (
                  <label key={key}>
                    {t(
                      (
                        {
                          majorShapes: 'Major background shapes',
                          secondaryObjects: 'Secondary background objects',
                          smallDetails: 'Small background details',
                        } as const
                      )[key],
                    )}
                    <textarea
                      value={draft.environment?.[key].join('\n')}
                      onChange={(e) => {
                        if (draft.environment)
                          setDraft({
                            ...draft,
                            environment: {
                              ...draft.environment,
                              [key]: e.target.value.split('\n').filter(Boolean),
                            },
                          });
                      }}
                    />
                  </label>
                ))}
                <label>
                  {t('Background placement')}
                  <textarea
                    value={draft.environment.layout}
                    onChange={(e) => {
                      if (draft.environment)
                        setDraft({ ...draft, environment: { ...draft.environment, layout: e.target.value } });
                    }}
                  />
                </label>
                <button type="button" onClick={() => setDraft({ ...draft, environment: undefined })}>
                  {t('Remove background description')}
                </button>
              </fieldset>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    environment: { majorShapes: [], secondaryObjects: [], smallDetails: [], layout: '' },
                  })
                }
              >
                {t('Describe environment background')}
              </button>
            )}
            <label>
              {t('Character count')}
              <input
                type="number"
                min={0}
                max={10}
                value={draft.facets.characterCount}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    facets: { ...draft.facets, characterCount: e.currentTarget.valueAsNumber },
                  })
                }
              />
            </label>
            <label>
              {t('Materials')}
              <input
                value={draft.facets.materials.join(', ')}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    facets: {
                      ...draft.facets,
                      materials: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </label>
            <label>
              {t('Palette')}
              <input
                value={draft.facets.palette.join(', ')}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    facets: {
                      ...draft.facets,
                      palette: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </label>
            {(['silhouette', 'rendering', 'lighting'] as const).map((key) => (
              <label key={key}>
                {text({ silhouette: 'Силуэт', rendering: 'Отрисовка', lighting: 'Освещение' }[key])}
                <textarea
                  value={draft.facets[key]}
                  onChange={(e) => setDraft({ ...draft, facets: { ...draft.facets, [key]: e.target.value } })}
                />
              </label>
            ))}
            <label>
              {t('Classification notes')}
              <textarea
                value={draft.categoryRationale}
                onChange={(e) => setDraft({ ...draft, categoryRationale: e.target.value })}
              />
            </label>
            {error && <p className="inline-error">{text(error)}</p>}
            <button className="primary" disabled={busy} type="submit">
              {t('Save')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
