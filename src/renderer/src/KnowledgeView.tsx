import { CategoryRulesView } from './CategoryRulesView';
import { SetCompositionSummary } from './SetCompositionSummary';
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Bootstrap, StudioApi } from '../../shared/Contracts';
import type { KnowledgeKind } from '../../shared/KnowledgeEditorContracts';
import { useKnowledgeViewModel } from './viewmodels/useKnowledgeViewModel';
import { useLocalization } from './i18n/LocalizationContext';
import { VisualPatterns } from '../../domain/VisualPatterns';
import { Assets } from './Assets';
import { Modal } from './Modal';
import { KnowledgeCardDetails } from './KnowledgeCardDetails';
import { KnowledgeEntityDetails } from './KnowledgeEntityDetails';

export function KnowledgeView({
  api,
  kind,
  refresh,
  workspace,
}: {
  api: StudioApi;
  kind: KnowledgeKind;
  workspace: Bootstrap;
  refresh: () => Promise<void>;
}) {
  const { t, text } = useLocalization();
  const vm = useKnowledgeViewModel(api, refresh);
  const [category, setCategory] = useState('all'),
    [tags, setTags] = useState<string[]>([]),
    [filters, setFilters] = useState(false),
    [importing, setImporting] = useState(false);
  const [title, setTitle] = useState(''),
    [importCategory, setImportCategory] = useState('1'),
    [members, setMembers] = useState<string[]>(Array.from({ length: 10 }, () => ''));
  const [setMode, setSetMode] = useState('ordinary');
  const data = vm.data;
  const cards = useMemo(
    () =>
      data?.library.filter(
        (item) =>
          (category === 'all' || item.category === category) &&
          tags.every((tag) => item.observation && VisualPatterns.tags(item.observation.facets).includes(tag)),
      ) ?? [],
    [data, category, tags],
  );
  if (!data) return <p role="status">{vm.error ? text(vm.error) : t('Loading workspace…')}</p>;
  const observed = data.catalog.cards.filter((card) => data.library.some((item) => item.id === card.id));
  const counts = VisualPatterns.counts(observed);
  const titleText = t(kind === 'card' ? 'Cards' : kind === 'set' ? 'Sets' : 'Categories');
  const selection = vm.selection;
  const selectedCard =
    selection?.kind === 'card' ? data.library.find((item) => item.id === selection.id) : undefined;
  const chosenSets = data.catalog.sets.filter((set) => {
    if (!set.cards.every((member) => data.library.some((card) => card.id === member.id))) return false;
    const gold = set.cards.filter(
      (member) => data.catalog.cards.find((card) => card.id === member.id)?.observation.category === '5',
    ).length;
    return setMode === 'all' || (setMode === 'ordinary' ? gold === 0 : gold > 0 && gold < 10);
  });
  return (
    <section className="knowledge-page">
      <div className="section-heading">
        <h1>{titleText}</h1>
        <div className="actions">
          <button
            disabled={vm.busy}
            onClick={() => (kind === 'card' ? void vm.importCard() : setImporting(true))}
          >
            {t('Add')}
          </button>
        </div>
      </div>
      {vm.error && !selection && !importing && (
        <p role="alert" className="inline-error">
          {text(vm.error)}
        </p>
      )}
      {data.job.status === 'running' && (
        <div role="status" className="knowledge-progress">
          {t('Analyzing…')} {data.job.done}/{data.job.total}
        </div>
      )}
      {data.job.status === 'failed' && <p className="inline-error">{text(data.job.message)}</p>}
      {kind === 'card' ? (
        <>
          <div className="knowledge-filters">
            <label>
              {t('Category')}
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">{t('All categories')}</option>
                {['1', '2', '3', '4', '5', 'unknown'].map((id) => (
                  <option key={id} value={id}>
                    {id === 'unknown' ? t('Unclassified') : `${t('Category')} ${id}`}
                  </option>
                ))}
              </select>
            </label>
            <button aria-expanded={filters} onClick={() => setFilters(!filters)}>
              {t('Patterns')} {tags.length > 0 && `(${tags.length})`}
            </button>
            <span className="muted">
              {cards.length}/{data.library.length}
            </span>
            {(tags.length > 0 || category !== 'all') && (
              <button
                onClick={() => {
                  setTags([]);
                  setCategory('all');
                }}
              >
                {t('Clear filters')}
              </button>
            )}
          </div>
          {tags.length > 0 && (
            <div className="selected-pattern-filters" aria-label={t('Active filters')}>
              {tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTags(tags.filter((value) => value !== tag))}
                  aria-label={t('Remove filter: {name}', { name: text(VisualPatterns.label(tag)) })}
                >
                  <span>{text(VisualPatterns.label(tag))}</span>
                  <X size={13} />
                </button>
              ))}
            </div>
          )}
          {filters && (
            <div className="pattern-filter-groups">
              {VisualPatterns.dimensions.map((axis) => (
                <details key={axis.key} className="pattern-filter-group">
                  <summary>
                    <span>{text(axis.label)}</span>
                    <small>
                      {tags.some((tag) => tag.startsWith(axis.key + ':'))
                        ? text(VisualPatterns.label(tags.find((tag) => tag.startsWith(axis.key + ':')) ?? ''))
                        : t('Any')}
                    </small>
                  </summary>
                  <div className="pattern-filter-options">
                    {axis.values.map((option) => {
                      const tag = `${axis.key}:${option.value}`,
                        count = counts.find((x) => x.tag === tag)?.count ?? 0;
                      return count > 0 ? (
                        <button
                          key={tag}
                          className={tags.includes(tag) ? 'selected' : ''}
                          aria-pressed={tags.includes(tag)}
                          onClick={() =>
                            setTags(
                              tags.includes(tag)
                                ? tags.filter((x) => x !== tag)
                                : [...tags.filter((x) => !x.startsWith(axis.key + ':')), tag],
                            )
                          }
                        >
                          <span>{text(option.label)}</span>
                          <small>{count}</small>
                        </button>
                      ) : null;
                    })}
                  </div>
                </details>
              ))}
            </div>
          )}
          <div className="knowledge-card-grid">
            {cards.map((item) => (
              <button
                key={item.id}
                className="image-only"
                onClick={() => vm.open('card', item.id)}
                aria-label={item.title}
              >
                <img loading="lazy" src={Assets.reference(item.filename)} alt={item.title} />
              </button>
            ))}
          </div>
        </>
      ) : kind === 'set' ? (
        <>
          <details className="knowledge-summary">
            <summary>{t('Set composition ranges')}</summary>
            <label>
              {t('Source selection')}
              <select value={setMode} onChange={(e) => setSetMode(e.target.value)}>
                <option value="ordinary">{t('Ordinary sets')}</option>
                <option value="mixed">{t('Mixed sets')}</option>
                <option value="all">{t('All source sets')}</option>
              </select>
            </label>
            <SetCompositionSummary sets={chosenSets} cards={observed} />
            {workspace.profile.requirements
              ?.filter((section) => section.id === 'set-structure')
              .map((section) => (
                <details className="rule-block" key={section.id}>
                  <summary>{text(section.title)}</summary>
                  <ul>
                    {section.rules.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                </details>
              ))}
          </details>
          <div className="knowledge-sets-grid">
            {data.catalog.sets.map((set) => {
              const image = data.catalog.images.find((image) => image.id === set.id);
              return (
                <button key={set.id} onClick={() => vm.open('set', set.id)}>
                  {image && <img loading="lazy" src={Assets.knowledge(image.filename)} alt={image.title} />}
                  <strong>
                    {image?.title
                      .replace(/\.png$/i, '')
                      .replace(/^\d+_Collection_/, '')
                      .replace(/_/g, ' ') ?? set.analysis.theme}
                  </strong>
                  {!set.cards.every((member) => data.library.some((card) => card.id === member.id)) && (
                    <span>{t('Incomplete')}</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="knowledge-sets-grid">
          {data.catalog.categoryProfiles.map((profile) => {
            const image = data.catalog.categoryExamples.find((image) => image.id === profile.id);
            return (
              <button key={profile.id} onClick={() => vm.open('category', profile.id)}>
                {image && (
                  <img
                    loading="lazy"
                    src={Assets.knowledge(image.filename)}
                    alt={`${t('Category')} ${profile.category}`}
                  />
                )}
                <strong>
                  {t('Category')} {profile.category}
                </strong>
                <span>
                  {observed.filter((card) => card.observation.category === profile.category).length}{' '}
                  {t('cards')}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {selection && (selectedCard || selection.kind !== 'card') && (
        <Modal
          title={
            selection.kind === 'card'
              ? (selectedCard?.title ?? t('Cards'))
              : selection.kind === 'set'
                ? t('Set analysis')
                : t('Category analysis')
          }
          onClose={vm.close}
        >
          {vm.error && (
            <p role="alert" className="inline-error">
              {text(vm.error)}
            </p>
          )}
          {data.job.status === 'running' && (
            <p role="status">
              {t('Analyzing…')} {data.job.done}/{data.job.total}
            </p>
          )}
          {selectedCard ? (
            <KnowledgeCardDetails
              key={selectedCard.id}
              item={selectedCard}
              examples={data.catalog.categoryExamples}
              busy={vm.busy}
              save={(observation) => vm.save({ kind: 'card', id: selectedCard.id, observation })}
              remove={() => void vm.remove('card', selectedCard.id)}
            />
          ) : (
            selection.kind !== 'card' && (
              <KnowledgeEntityDetails
                categoryRules={
                  selection.kind === 'category'
                    ? (() => {
                        const category = data.catalog.categoryProfiles.find(
                          (profile) => profile.id === selection.id,
                        )?.category;
                        return category ? (
                          <CategoryRulesView
                            data={workspace}
                            category={category}
                            api={api}
                            refresh={refresh}
                          />
                        ) : null;
                      })()
                    : undefined
                }
                key={selection.id}
                data={data}
                kind={selection.kind}
                id={selection.id}
                busy={vm.busy}
                save={vm.save}
                remove={() => void vm.remove(selection.kind, selection.id)}
                openCard={(id) => vm.open('card', id)}
              />
            )
          )}
        </Modal>
      )}
      {importing && kind !== 'card' && (
        <Modal
          title={t(kind === 'set' ? 'Add set' : 'Add category examples')}
          onClose={() => setImporting(false)}
        >
          {vm.error && (
            <p role="alert" className="inline-error">
              {text(vm.error)}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void vm
                .importEntity({
                  kind,
                  title,
                  category:
                    kind === 'category'
                      ? (['1', '2', '3', '4', '5'] as const).find((x) => x === importCategory)
                      : undefined,
                  cardIds: kind === 'set' ? members : undefined,
                })
                .then((id) => {
                  if (id) setImporting(false);
                });
            }}
          >
            <label>
              {t('Name')}
              <input value={title} required minLength={2} onChange={(e) => setTitle(e.target.value)} />
            </label>
            {kind === 'category' ? (
              <label>
                {t('Category')}
                <select value={importCategory} onChange={(e) => setImportCategory(e.target.value)}>
                  {['1', '2', '3', '4', '5'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <p>{t('Select ten cards in the same order as the imported sheet.')}</p>
                {members.map((id, index) => (
                  <label key={index}>
                    {index + 1}
                    <select
                      value={id}
                      required
                      onChange={(e) =>
                        setMembers(members.map((value, i) => (i === index ? e.target.value : value)))
                      }
                    >
                      <option value="">{t('Select card')}</option>
                      {data.library
                        .filter((item) => item.observation)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </>
            )}
            <button type="submit" disabled={vm.busy}>
              {t('Choose image and analyze')}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
