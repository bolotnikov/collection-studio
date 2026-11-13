import { useEffect, useState, type ReactNode } from 'react';
import type { KnowledgeSnapshot, KnowledgeEdit } from '../../shared/KnowledgeEditorContracts';
import { VisualCatalogContracts } from '../../shared/VisualCatalogContracts';
import { VisualPatterns } from '../../domain/VisualPatterns';
import { Assets } from './Assets';
import { useLocalization } from './i18n/LocalizationContext';

export function KnowledgeEntityDetails({
  data,
  kind,
  id,
  busy,
  save,
  remove,
  openCard,
  categoryRules,
}: {
  data: KnowledgeSnapshot;
  kind: 'set' | 'category';
  categoryRules?: ReactNode;
  id: string;
  busy: boolean;
  save: (edit: KnowledgeEdit) => Promise<boolean | undefined>;
  remove: () => void;
  openCard: (id: string) => void;
}) {
  const { t, text } = useLocalization();
  const image = data.catalog.images.find((x) => x.id === id);
  const set = data.catalog.sets.find((x) => x.id === id),
    category = data.catalog.categoryProfiles.find((x) => x.id === id);
  const [editing, setEditing] = useState(false),
    [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(set?.analysis),
    [profile, setProfile] = useState(category);
  useEffect(() => {
    if (!editing) {
      setAnalysis(set?.analysis);
      setProfile(category);
    }
  }, [set, category, editing]);
  const cards =
    kind === 'set'
      ? (set?.cards.flatMap((member) => {
          const card = data.catalog.cards.find((c) => c.id === member.id);
          return card ? [card] : [];
        }) ?? [])
      : data.catalog.cards.filter(
          (card) =>
            card.observation.category === category?.category &&
            data.library.some((item) => item.id === card.id),
        );
  return (
    <div className="knowledge-entity-detail">
      <div className="actions">
        <button disabled={busy} onClick={() => setEditing(!editing)}>
          {t('Edit')}
        </button>
        <button disabled={busy} onClick={remove}>
          {t('Delete')}
        </button>
      </div>
      {kind === 'set' && set?.cards.some((member) => !data.library.some((card) => card.id === member.id)) && (
        <p role="status">
          {t('This source set is excluded from generation because a member card was removed.')}
        </p>
      )}
      {categoryRules}
      {image && (
        <img className="knowledge-set-image" src={Assets.knowledge(image.filename)} alt={image.title} />
      )}
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const parsed =
              kind === 'set'
                ? VisualCatalogContracts.setAnalysis.safeParse(analysis)
                : VisualCatalogContracts.categoryProfile.safeParse(profile);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? 'Invalid analysis');
              return;
            }
            const edit: KnowledgeEdit =
              kind === 'set'
                ? { kind, id, analysis: VisualCatalogContracts.setAnalysis.parse(parsed.data) }
                : { kind, id, profile: VisualCatalogContracts.categoryProfile.parse(parsed.data) };
            void save(edit).then((saved) => {
              if (saved) setEditing(false);
            });
          }}
        >
          {kind === 'set' && analysis ? (
            <>
              {(['theme', 'story', 'paletteRhythm', 'backgroundRhythm', 'scaleAndCameraRhythm'] as const).map(
                (key) => (
                  <label key={key}>
                    {text(
                      {
                        theme: 'Тема',
                        story: 'Концепция',
                        paletteRhythm: 'Ритм палитры',
                        backgroundRhythm: 'Ритм фонов',
                        scaleAndCameraRhythm: 'Масштаб и ракурсы',
                      }[key],
                    )}
                    <textarea
                      value={analysis[key]}
                      onChange={(e) => setAnalysis({ ...analysis, [key]: e.target.value })}
                    />
                  </label>
                ),
              )}
              <label>
                {t('Classification notes')}
                <textarea
                  value={analysis.cautions.join('\n')}
                  onChange={(e) =>
                    setAnalysis({ ...analysis, cautions: e.target.value.split('\n').filter(Boolean) })
                  }
                />
              </label>
              <label>
                {t('Card roles')}
                <textarea
                  rows={10}
                  value={analysis.semanticRoles.join('\n')}
                  onChange={(e) => setAnalysis({ ...analysis, semanticRoles: e.target.value.split('\n') })}
                />
              </label>
            </>
          ) : (
            profile && (
              <>
                <label>
                  {t('Composition patterns')}
                  <textarea
                    rows={8}
                    value={profile.permittedVariations.join('\n')}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        permittedVariations: e.target.value.split('\n').filter(Boolean),
                      })
                    }
                  />
                </label>
                <label>
                  {t('Classification notes')}
                  <textarea
                    rows={5}
                    value={profile.cautions.join('\n')}
                    onChange={(e) =>
                      setProfile({ ...profile, cautions: e.target.value.split('\n').filter(Boolean) })
                    }
                  />
                </label>
              </>
            )
          )}
          {error && <p className="inline-error">{text(error)}</p>}
          <button className="primary" disabled={busy} type="submit">
            {t('Save')}
          </button>
        </form>
      ) : (
        <>
          {set && kind === 'set' && (
            <dl>
              {[
                ['Концепция', set.analysis.story],
                ['Ритм фонов', set.analysis.backgroundRhythm],
                ['Ритм палитры', set.analysis.paletteRhythm],
                ['Масштаб и ракурсы', set.analysis.scaleAndCameraRhythm],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{text(label ?? '')}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {set && kind === 'set' && set.analysis.cautions.length > 0 && (
            <details>
              <summary>{t('Classification notes')}</summary>
              <ul>
                {set.analysis.cautions.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </details>
          )}
          {category && kind === 'category' && (
            <>
              <h3>{t('Composition patterns')}</h3>
              <ul>
                {category.permittedVariations.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              {category.cautions.length > 0 && (
                <details>
                  <summary>{t('Classification notes')}</summary>
                  <ul>
                    {category.cautions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </>
      )}
      {kind === 'set' && (
        <div className="pattern-chips">
          {(['1', '2', '3', '4', '5'] as const).map((category) => {
            const count = cards.filter((card) => card.observation.category === category).length;
            return count ? (
              <span key={category}>
                {t('Category')} {category} · {count}/{cards.length}
              </span>
            ) : null;
          })}
        </div>
      )}
      <h3>{t('Pattern distribution')}</h3>
      <div className="pattern-chips">
        {VisualPatterns.counts(cards).map(({ tag, count }) => (
          <span key={tag}>
            {text(VisualPatterns.label(tag))} · {count}/{cards.length}
          </span>
        ))}
      </div>
      <h3>{t('Cards')}</h3>
      <div className="knowledge-member-grid">
        {cards.map((card, index) => (
          <article key={card.id}>
            <button
              className="image-only"
              disabled={!data.library.some((item) => item.id === card.id)}
              onClick={() => openCard(card.id)}
            >
              <img loading="lazy" src={Assets.reference(card.filename)} alt={card.observation.subject} />
            </button>
            <p>
              {kind === 'set' ? `${index + 1} · ` : ''}
              {t('Category')} {card.observation.category}
            </p>
            {kind === 'set' && <p>{set?.analysis.semanticRoles[index]}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
