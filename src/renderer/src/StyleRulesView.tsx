import { Pencil, LoaderCircle, Check, X } from 'lucide-react';
import type { Bootstrap, StudioApi } from '../../shared/Contracts';
import { useLocalization } from './i18n/LocalizationContext';
import { useStyleRulesViewModel } from './viewmodels/useStyleRulesViewModel';
import { Assets } from './Assets';

export function StyleRulesView({
  data,
  api,
  refresh,
}: {
  data: Bootstrap;
  api: StudioApi;
  refresh: () => Promise<void>;
}) {
  const { t, text } = useLocalization();
  const vm = useStyleRulesViewModel(data.styleRules, api, refresh);
  const current = data.styleRules;
  return (
    <section className="generation-rules">
      <div className="section-heading">
        <div>
          <h2>{t('Rendering and composition')}</h2>
          <p>
            {t('Applied to every new set. Edit the rules to control rendering and category composition.')}
          </p>
        </div>
        {!vm.editing && (
          <button onClick={vm.edit}>
            <Pencil size={14} />
            {t('Edit rules')}
          </button>
        )}
      </div>
      {vm.editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void vm.save();
          }}
        >
          <label htmlFor="rendering-rules">{t('Rendering rules')}</label>
          <textarea
            id="rendering-rules"
            lang="en"
            spellCheck={false}
            rows={10}
            value={vm.rendering}
            disabled={vm.busy}
            onChange={(event) => vm.setRendering(event.target.value)}
          />
          <p className="form-note">
            {t('One English rule per line. These exact rules are used by the generator.')}
          </p>
          {(['1', '2', '3', '4'] as const).map((category) => (
            <div className="category-rule-editor" key={category}>
              <label htmlFor={`category-rule-${category}`}>
                {t('Category')} {category}
              </label>
              <textarea
                id={`category-rule-${category}`}
                lang="en"
                spellCheck={false}
                rows={3}
                required
                minLength={5}
                maxLength={2000}
                disabled={vm.busy}
                value={vm.categories[category]}
                onChange={(event) => vm.setCategories({ ...vm.categories, [category]: event.target.value })}
              />
            </div>
          ))}
          {vm.error && (
            <p className="inline-error" role="alert">
              {text(vm.error)}
            </p>
          )}
          <div className="actions">
            <button className="primary" type="submit" disabled={vm.busy}>
              {vm.busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}{' '}
              {t(vm.busy ? 'Saving…' : 'Save rules')}
            </button>
            <button type="button" disabled={vm.busy} onClick={vm.cancel}>
              <X size={14} />
              {t('Cancel')}
            </button>
          </div>
        </form>
      ) : (
        <>
          <section className="rule-block">
            <h3>{t('Rendering rules')}</h3>
            <ul lang="en">
              {current.rendering.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>
          </section>
          <section className="rule-block">
            <h3>{t('Composition categories')}</h3>
            <div className="composition-rule-grid">
              {(['1', '2', '3', '4'] as const).map((category) => {
                const example = data.profile.knowledge?.images.find(
                  (image) => image.role === 'category-example' && image.category === category,
                );
                return (
                  <article key={category}>
                    <h4>
                      <span className="rule-number">{category}</span>
                      {t('Category')} {category}
                    </h4>
                    <p lang="en">{current.categories[category]}</p>
                    {example && (
                      <img
                        loading="lazy"
                        src={Assets.knowledge(example.filename)}
                        alt={`${t('Category')} ${category}`}
                      />
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
      {(data.profile.requirements ?? []).map((section) => (
        <section className="rule-block" key={section.id}>
          <h3>{text(section.title)}</h3>
          <ul lang="en">
            {section.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
