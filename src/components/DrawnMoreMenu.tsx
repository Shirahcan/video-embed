import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx, useVideoUi } from '../theme';
import { Control } from './DrawnControl';
import { MoreIcon, StandardScreenIcon } from './icons';

/** A bar control that moved into More because the call is too narrow for it (B1). */
export interface MoreAction {
  key: string;
  title: string;
  icon: ReactNode;
  pressed?: boolean;
  /** A count the bar showed on the control (unread chat); More carries it while it is folded. */
  badge?: number;
  onSelect: () => void;
}

/** One on/off choice in More (noise, blur, mirror, pop out on tab switch). */
export interface MoreSwitch {
  key: string;
  on: boolean;
  title: string;
  detail: string;
  icon: ReactNode;
  onToggle: () => void;
}

/**
 * The drawn screen's More menu: the switches first, then "Use the standard call screen". It closes
 * on Escape and on a click anywhere else; a switch leaves it open so the person sees it flip.
 */
export function DrawnMoreMenu({ switches, onUseStandard, actions = [] }: { switches: MoreSwitch[]; onUseStandard: () => void; actions?: MoreAction[] }) {
  const { labels } = useVideoUi();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const standardDetailId = useId();
  const badge = actions.reduce((sum, a) => sum + (a.badge ?? 0), 0);

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
    <span className="ve-drawn__menu" ref={ref}>
      <span className="ve-ctl-badged">
        <Control label={labels.drawnMoreShort} ariaLabel={labels.drawnMore} expanded={open} onClick={() => setOpen((o) => !o)} icon={<MoreIcon />} />
        {badge > 0 ? <span className="ve-ctl-badge" aria-hidden="true">{badge > 9 ? '9+' : badge}</span> : null}
      </span>
      {open ? (
        <span className="ve-drawn__menu-list" role="menu" aria-label={labels.drawnMore}>
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              className={cx('ve-drawn__menu-item', a.pressed && 've-drawn__menu-item--on')}
              onClick={() => {
                setOpen(false);
                a.onSelect();
              }}
            >
              <span className="ve-drawn__menu-icon">{a.icon}</span>
              <span className="ve-drawn__menu-text">
                <span className="ve-drawn__menu-title">{a.title}</span>
              </span>
              {a.badge ? <span className="ve-drawn__menu-count">{a.badge > 9 ? '9+' : a.badge}</span> : null}
            </button>
          ))}
          {actions.length > 0 ? <span className="ve-drawn__menu-sep" role="separator" /> : null}
          {switches.map((s) => (
            <button key={s.key} type="button" role="menuitemcheckbox" aria-checked={s.on} className="ve-drawn__menu-item" onClick={s.onToggle}>
              <span className="ve-drawn__menu-icon">{s.icon}</span>
              <span className="ve-drawn__menu-text">
                <span className="ve-drawn__menu-title">{s.title}</span>
                <span className="ve-drawn__menu-detail">{s.detail}</span>
              </span>
              <span className={cx('ve-switch', s.on && 've-switch--on')} aria-hidden="true" />
            </button>
          ))}
          {switches.length > 0 ? <span className="ve-drawn__menu-sep" role="separator" /> : null}
          <button
            type="button"
            role="menuitem"
            className="ve-drawn__menu-item"
            aria-label={labels.drawnUseStandard}
            aria-describedby={standardDetailId}
            onClick={() => {
              setOpen(false);
              onUseStandard();
            }}
          >
            <span className="ve-drawn__menu-icon"><StandardScreenIcon /></span>
            <span className="ve-drawn__menu-text">
              <span className="ve-drawn__menu-title">{labels.drawnUseStandard}</span>
              <span className="ve-drawn__menu-detail" id={standardDetailId}>{labels.drawnUseStandardDetail}</span>
            </span>
          </button>
        </span>
      ) : null}
    </span>
  );
}
