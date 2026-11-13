import { Lock, Plus, X } from 'lucide-react';
import type { CompositionTarget } from '../../shared/CompositionContract';
import type { SlotTagEdit } from '../../shared/SlotTagContracts';
import { useSlotTagEditor } from './viewmodels/useSlotTagEditor';
import { useLocalization } from './i18n/LocalizationContext';
import { Modal } from './Modal';

export function SlotTagEditor({
  target,
  revision,
  disabled,
  save,
  onPendingChange,
}: {
  target: CompositionTarget;
  revision: number;
  disabled: boolean;
  save: (edit: SlotTagEdit) => Promise<void>;
  onPendingChange: (pending: boolean) => void;
}) {
  const { t, text } = useLocalization();
  const model = useSlotTagEditor(target, revision, save, onPendingChange);
  const actions = (
    <div className="actions">
      <button disabled={model.saving} onClick={model.reset}>
        {t('Cancel')}
      </button>
      <button
        className="primary"
        disabled={disabled || model.saving || !model.dirty || !model.valid}
        onClick={() => void model.save()}
      >
        {t('Save tags')}
      </button>
    </div>
  );
  return (
    <div className="slot-tag-editor">
      <div className="pattern-chips editable-tags">
        {model.groups.flatMap((group) => {
          const value = model.facets[group.key];
          const option = group.values.find((entry) => entry.value === value);
          return option
            ? [
                <span key={group.key} className={group.fixed ? 'fixed-tag' : 'editable-tag'}>
                  {text(option.label)}
                  {group.fixed ? (
                    <Lock size={11} aria-label={t('Required by category')} />
                  ) : (
                    <button
                      disabled={disabled || model.saving}
                      onClick={() => model.remove(group.key)}
                      aria-label={t('Remove tag: {tag}', { tag: text(option.label) })}
                      title={t('Remove tag')}
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>,
              ]
            : [];
        })}
        <button
          className="add-slot-tag"
          disabled={disabled || model.saving}
          onClick={() => model.setOpen(true)}
        >
          <Plus size={13} />
          {t('Add tag')}
        </button>
      </div>
      {model.dirty && (
        <div className="slot-tag-save">
          {actions}
          <p className="form-note">{t('Save tag changes before regenerating the image.')}</p>
        </div>
      )}
      {model.error && (
        <p role="alert" className="inline-error">
          {text(model.error)}
        </p>
      )}
      {revision > 0 && <p className="form-note">{t('Manual tag revision {number}', { number: revision })}</p>}
      {model.open && (
        <Modal
          title={t('Edit slot tags')}
          onClose={() => {
            if (!model.saving) model.reset();
          }}
        >
          <p className="form-note">
            {t(
              'Tags are requirements. Removing a tag makes that property unrestricted; put prohibitions in the revision instructions.',
            )}
          </p>
          <p className="form-note">
            {t('Category and character restrictions remain fixed. Changes do not regenerate the image.')}
          </p>
          <div className="slot-tag-options">
            {model.groups.map((group) => (
              <fieldset key={group.key}>
                <legend>
                  {text(group.label)}
                  {group.fixed && <Lock size={11} />}
                </legend>
                <div className="pattern-chips">
                  {group.values.map((option) => (
                    <button
                      key={option.value}
                      disabled={disabled || model.saving || group.fixed}
                      aria-pressed={model.facets[group.key] === option.value}
                      onClick={() => model.select(group.key, option.value)}
                    >
                      {text(option.label)}
                    </button>
                  ))}
                  {!group.fixed && model.facets[group.key] !== undefined && (
                    <button disabled={model.saving} onClick={() => model.remove(group.key)}>
                      {t('No requirement')}
                    </button>
                  )}
                </div>
              </fieldset>
            ))}
          </div>
          {model.error && (
            <p role="alert" className="inline-error">
              {text(model.error)}
            </p>
          )}
          {actions}
        </Modal>
      )}
    </div>
  );
}
