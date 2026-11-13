import { useEffect, useRef } from 'react';
import { X, Sparkles, LoaderCircle } from 'lucide-react';
import type { ReferenceEditorModel } from './viewmodels/ReferenceEditorModel';
import { Assets } from './Assets';
import { useLocalization } from './i18n/LocalizationContext';

export function ReferenceEditor({
  model,
  state,
  canAnalyze,
}: {
  model: ReferenceEditorModel;
  state: ReturnType<ReferenceEditorModel['snapshot']>;
  canAnalyze: boolean;
}) {
  const { t, text } = useLocalization();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  if (!state.item) return null;
  return (
    <dialog
      className="reference-editor"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        model.close();
      }}
      aria-labelledby="reference-editor-title"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void model.save();
        }}
      >
        <div className="section-heading">
          <h2 id="reference-editor-title">{t('Edit reference')}</h2>
          <button
            type="button"
            className="icon-button"
            disabled={Boolean(state.busy)}
            onClick={model.close}
            aria-label={t('Close')}
          >
            <X size={18} />
          </button>
        </div>
        <img
          className="reference-editor-preview"
          src={Assets.reference(state.item.filename)}
          alt={state.item.title}
        />
        <div className="reference-editor-controls">
          <button
            type="button"
            disabled={Boolean(state.busy) || !canAnalyze}
            onClick={() => void model.analyze()}
          >
            {state.busy === 'analyze' ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}{' '}
            {t(state.busy === 'analyze' ? 'Analyzing…' : 'Auto-detect with AI')}
          </button>
          <label htmlFor="reference-category">{t('Composition category')}</label>
          <select
            id="reference-category"
            value={state.category}
            disabled={Boolean(state.busy)}
            required
            onChange={(event) => {
              const value = event.target.value;
              if (
                value === '' ||
                value === '1' ||
                value === '2' ||
                value === '3' ||
                value === '4' ||
                value === '5'
              )
                model.setCategory(value);
            }}
          >
            <option value="" disabled>
              {t('Choose a category')}
            </option>
            {(['1', '2', '3', '4', '5'] as const).map((category) => (
              <option key={category} value={category}>
                {t('Category')} {category}
              </option>
            ))}
          </select>
          <label htmlFor="reference-description">{t('Reference description')}</label>
          <textarea
            id="reference-description"
            lang="ru"
            spellCheck={false}
            rows={5}
            required
            minLength={3}
            maxLength={2000}
            value={state.description}
            disabled={Boolean(state.busy)}
            onChange={(event) => model.setDescription(event.target.value)}
          />
          <p className="form-note">
            {t('Describe the subject. Saved category and description guide reference retrieval.')}
          </p>
          {state.error && (
            <p className="inline-error" role="alert">
              {text(state.error)}
            </p>
          )}
          <div className="actions">
            <button className="primary" type="submit" disabled={Boolean(state.busy)}>
              {state.busy === 'save' && <LoaderCircle size={14} className="spin" />}
              {t('Save changes')}
            </button>
            <button type="button" disabled={Boolean(state.busy)} onClick={model.close}>
              {t('Cancel')}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
