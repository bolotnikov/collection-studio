import { Plus, Pencil, LoaderCircle } from 'lucide-react';
import type { StudioApi } from '../../shared/Contracts';
import { useReferenceEditor } from './viewmodels/useReferenceEditor';
import { ReferenceEditor } from './ReferenceEditor';
import { useState } from 'react';
import type { LibraryItem } from '../../shared/StyleContracts';
import { LibraryFilter, type CategoryFilter } from './viewmodels/LibraryFilter';
import { Assets } from './Assets';
import { useLocalization } from './i18n/LocalizationContext';

export function ReferenceGallery({
  items,
  onRemove,
  disabled = false,
  api,
  refresh,
  canAnalyze,
}: {
  items: LibraryItem[];
  api: StudioApi;
  refresh: () => Promise<void>;
  canAnalyze: boolean;
  onRemove?: (id: string) => void;
  disabled?: boolean;
}) {
  const { t, text } = useLocalization();
  const editor = useReferenceEditor(api, refresh);
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const label = (category: CategoryFilter) =>
    category === 'all'
      ? t('All categories')
      : category === 'excluded'
        ? t('Excluded from generation')
        : category === 'unknown'
          ? t('Pending analysis')
          : `${t('Category')} ${category}`;
  return (
    <section className="reference-gallery">
      <div className="library-toolbar">
        <button
          type="button"
          disabled={disabled || Boolean(editor.busy)}
          onClick={() => void editor.model.import()}
        >
          {editor.busy === 'import' ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />}{' '}
          {t('Add reference')}
        </button>
      </div>
      {editor.error && !editor.item && (
        <p className="inline-error" role="alert">
          {text(editor.error)}
        </p>
      )}
      {editor.item && <ReferenceEditor model={editor.model} state={editor} canAnalyze={canAnalyze} />}

      <div className="category-filters" role="group" aria-label={t('Filter by composition category')}>
        {LibraryFilter.categories
          .filter(
            (category) =>
              category === 'all' ||
              ['1', '2', '3', '4'].includes(category) ||
              LibraryFilter.count(items, category) > 0,
          )
          .map((category) => (
            <button
              key={category}
              type="button"
              aria-label={label(category)}
              title={label(category)}
              aria-pressed={filter === category}
              className={filter === category ? 'selected' : ''}
              onClick={() => setFilter(category)}
            >
              {category === 'all'
                ? t('All categories')
                : category === 'excluded'
                  ? t('Excluded')
                  : category === 'unknown'
                    ? t('Unclassified')
                    : category}
              <span>{LibraryFilter.count(items, category)}</span>
            </button>
          ))}
      </div>
      {LibraryFilter.groups(items, filter).map((group) => (
        <section className="reference-group" key={group.category}>
          <h2>
            {label(group.category)} <span className="muted">{group.items.length}</span>
          </h2>
          <div className="library-grid">
            {group.items.map((item) => (
              <figure key={item.id}>
                <div className="reference-image">
                  <img loading="lazy" src={Assets.reference(item.filename)} alt={text(item.title)} />
                  <span
                    className={`category-badge ${group.category}`}
                    title={label(group.category)}
                    aria-label={label(group.category)}
                  >
                    {group.category === 'excluded'
                      ? '×'
                      : group.category === 'unknown'
                        ? '?'
                        : group.category}
                  </span>
                </div>
                <figcaption>
                  <strong lang="en">{item.title}</strong>
                  <button
                    type="button"
                    disabled={disabled || Boolean(editor.busy)}
                    onClick={() => editor.model.open(item)}
                  >
                    <Pencil size={13} /> {t('Edit reference')}
                  </button>
                  {onRemove && item.origin === 'user' && (
                    <button disabled={disabled} onClick={() => onRemove(item.id)}>
                      {t('Remove from library')}
                    </button>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
      {!LibraryFilter.groups(items, filter).length && (
        <p className="empty-library">{t('No references in this category.')}</p>
      )}
    </section>
  );
}
