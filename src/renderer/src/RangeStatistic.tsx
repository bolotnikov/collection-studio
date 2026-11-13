import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { useLocalization } from './i18n/LocalizationContext';

export function RangeStatistic({
  name,
  min,
  max,
  average,
}: {
  name: string;
  min: number;
  max: number;
  average: number;
}) {
  const { t, locale } = useLocalization();
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const open = (hovered || focused) && !dismissed;
  const value = average.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(340, window.innerWidth - 24);
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 170)),
        width,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="range-statistic"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => {
          setHovered(true);
          setDismissed(false);
        }}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={() => {
          setFocused(false);
          setHovered(false);
        }}
        onClick={() => setDismissed(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDismissed(true);
        }}
      >
        <span className="range-statistic-label">
          {name}
          <Info size={14} aria-hidden="true" />
        </span>
        <b>{min === max ? min : `${min}–${max}`}</b>
        <small>
          {t('Average')} {value}
        </small>
      </button>
      {open &&
        position &&
        createPortal(
          <div id={id} role="tooltip" className="range-tooltip" style={position}>
            {t('Range explanation: {name}; minimum {min}, maximum {max}, average {average}.', {
              name,
              min,
              max,
              average: value,
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
