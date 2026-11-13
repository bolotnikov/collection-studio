import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useLocalization } from './i18n/LocalizationContext';

export function Modal({
  title,
  onClose,
  children,
  compact = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useLocalization();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`result-modal${compact ? ' compact-modal' : ''}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="result-modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label={t('Close')} onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
