import { Pencil, LoaderCircle, Check, X } from 'lucide-react';
import type { Bootstrap, StudioApi } from '../../shared/Contracts';
import { useLocalization } from './i18n/LocalizationContext';
import { useStyleRulesViewModel } from './viewmodels/useStyleRulesViewModel';

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
          <h2>{t('Rendering rules')}</h2>
          <p>{t('Shared rendering rules applied to every new set.')}</p>
        </div>
        {!vm.editing && (
          <button onClick={vm.edit}>
            <Pencil size={14} />
            {t('Edit rules')}
          </button>
        )}
      </div>
      {current.preservedCustomFields?.length ? (
        <p className="form-note">
          {t(
            'Custom rules were preserved during migration. Review and save them to confirm the canonical text.',
          )}
        </p>
      ) : null}
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
            lang="ru"
            spellCheck={false}
            rows={10}
            value={vm.rendering}
            disabled={vm.busy}
            onChange={(event) => vm.setRendering(event.target.value)}
          />
          <p className="form-note">{t('One rule per line. These exact rules are used by the generator.')}</p>
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
            <ul lang="ru">
              {current.rendering.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>
          </section>
        </>
      )}
      {(data.profile.requirements ?? [])
        .filter((section) => section.id !== 'set-structure')
        .map((section) => (
          <section className="rule-block" key={section.id}>
            <h3>{text(section.title)}</h3>
            <ul lang="ru">
              {section.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </section>
        ))}
    </section>
  );
}
