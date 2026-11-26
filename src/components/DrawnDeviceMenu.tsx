import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DeviceChoice, DeviceKind } from '../drawnDevices';
import { cx, useVideoUi } from '../theme';
import { CheckIcon, ChevronUpIcon } from './icons';

export interface DeviceSection {
  kind: DeviceKind;
  heading: string;
  choices: DeviceChoice[];
  selected: string | null;
}

/**
 * The small arrow on a control (Google Meet's pattern) and the list it opens: one section per kind
 * (the microphone's arrow also lists speakers), the device in use ticked. Closes on Escape, on a
 * click elsewhere, and once a device is chosen.
 */
export function DrawnDeviceMenu({ label, sections, onChoose, children }: {
  label: string;
  sections: DeviceSection[];
  onChoose: (kind: DeviceKind, id: string) => void;
  /** The control the arrow belongs to. */
  children: ReactNode;
}) {
  const { labels } = useVideoUi();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const shown = sections.filter((s) => s.choices.length > 0);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <span className="ve-drawn__menu ve-ctl-group" ref={ref}>
      {children}
      {shown.length > 0 ? (
        <button
          type="button"
          className="ve-ctl-caret"
          aria-label={label}
          title={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronUpIcon width={14} height={14} />
        </button>
      ) : null}
      {open ? (
        <span className="ve-drawn__menu-list ve-devices" role="menu" aria-label={label}>
          {shown.map((section) => (
            <span key={section.kind} className="ve-devices__section" role="group" aria-label={section.heading}>
              <span className="ve-devices__heading" aria-hidden="true">{section.heading}</span>
              {section.choices.map((d) => {
                const on = d.id === section.selected || (section.kind === 'speaker' && !section.selected && d.id === '');
                return (
                  <button
                    key={d.id || 'default'}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    className={cx('ve-drawn__menu-item ve-devices__item', on && 've-devices__item--on')}
                    onClick={() => {
                      setOpen(false);
                      onChoose(section.kind, d.id);
                    }}
                  >
                    <span className="ve-devices__check" aria-hidden="true">{on ? <CheckIcon width={16} height={16} /> : null}</span>
                    <span className="ve-devices__name">{d.label || labels.drawnDefaultDevice}</span>
                  </button>
                );
              })}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
