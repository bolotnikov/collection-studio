import type { Bootstrap, StudioApi } from '../../shared/Contracts';
import { useLocalization } from './i18n/LocalizationContext';
import { useStyleRulesViewModel } from './viewmodels/useStyleRulesViewModel';

export function CategoryRulesView({
  data,
  category,
  api,
  refresh,
}: {
  data: Bootstrap;
  category: '1' | '2' | '3' | '4' | '5';
  api: StudioApi;
  refresh: () => Promise<void>;
}) {
  const { t, text } = useLocalization();
  const vm = useStyleRulesViewModel(data.styleRules, api, refresh);
  return (
    <section className="rule-block">
      <div className="section-heading">
        <h3>{t('Category generation rule')}</h3>
        {!vm.editing && <button onClick={vm.edit}>{t('Edit rules')}</button>}
      </div>
      {vm.editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void vm.save();
          }}
        >
          <label htmlFor={`category-definition-${category}`}>
            {t('Category')} {category}
          </label>
          <textarea
            id={`category-definition-${category}`}
            lang="ru"
            rows={6}
            required
            minLength={5}
            maxLength={2000}
            disabled={vm.busy}
            value={vm.categories[category] ?? ''}
            onChange={(event) => vm.setCategories({ ...vm.categories, [category]: event.target.value })}
          />
          {vm.error && (
            <p className="inline-error" role="alert">
              {text(vm.error)}
            </p>
          )}
          <div className="actions">
            <button type="submit" disabled={vm.busy}>
              {t('Save rules')}
            </button>
            <button type="button" disabled={vm.busy} onClick={vm.cancel}>
              {t('Cancel')}
            </button>
          </div>
        </form>
      ) : (
        <p className="canonical-category-rule" lang="ru">
          {data.styleRules.categories[category]}
        </p>
      )}
    </section>
  );
}
