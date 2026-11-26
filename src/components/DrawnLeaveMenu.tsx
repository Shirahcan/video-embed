import { useEffect, useRef, useState } from 'react';
import { useVideoUi } from '../theme';
import { Control } from './DrawnControl';
import { EndCallIcon, ExitIcon, LeaveIcon } from './icons';

/**
 * The drawn screen's Leave (call-screen-features L1, owner 2026-11-26). A guest leaves at once. A
 * host chooses first, the way Google Meet asks: **Leave the call** (the others carry on) or **End
 * the call for everyone**. Asking before, not after, means nobody is stranded in a half-left room.
 */
export function DrawnLeaveMenu({ onLeave, onEndForEveryone }: { onLeave: () => void; onEndForEveryone?: () => void }) {
  const { labels } = useVideoUi();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

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

  if (!onEndForEveryone) {
    return <Control label={labels.drawnLeave} ariaLabel={labels.drawnLeave} danger onClick={onLeave} icon={<LeaveIcon />} />;
  }

  return (
    <span className="ve-drawn__menu" ref={ref}>
      <Control label={labels.drawnLeave} ariaLabel={labels.drawnLeave} danger expanded={open} onClick={() => setOpen((o) => !o)} icon={<LeaveIcon />} />
      {open ? (
        <span className="ve-drawn__menu-list ve-drawn__menu-list--end" role="menu" aria-label={labels.drawnLeave}>
          <button
            type="button"
            role="menuitem"
            className="ve-drawn__menu-item"
            onClick={() => {
              setOpen(false);
              onLeave();
            }}
          >
            <span className="ve-drawn__menu-icon"><ExitIcon /></span>
            <span className="ve-drawn__menu-text">
              <span className="ve-drawn__menu-title">{labels.drawnLeaveOnly}</span>
              <span className="ve-drawn__menu-detail">{labels.drawnLeaveOnlyDetail}</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="ve-drawn__menu-item ve-drawn__menu-item--danger"
            onClick={() => {
              setOpen(false);
              onEndForEveryone();
            }}
          >
            <span className="ve-drawn__menu-icon"><EndCallIcon /></span>
            <span className="ve-drawn__menu-text">
              <span className="ve-drawn__menu-title">{labels.endForEveryone}</span>
              <span className="ve-drawn__menu-detail">{labels.drawnEndDetail}</span>
            </span>
          </button>
        </span>
      ) : null}
    </span>
  );
}
