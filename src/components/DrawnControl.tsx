import type { ReactNode } from 'react';
import { cx } from '../theme';

/** One round control on the drawn screen's bar: an icon in a disc, its short name under it. */
export function Control({ label, ariaLabel, icon, onClick, pressed, expanded, off = false, danger = false, shortcut }: {
  label: string;
  ariaLabel: string;
  icon: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  expanded?: boolean;
  off?: boolean;
  danger?: boolean;
  /** Its keyboard shortcut as shown ("Ctrl+D"), named in the tooltip (F6). */
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      className={cx('ve-ctl', off && 've-ctl--off', danger && 've-ctl--danger')}
      aria-label={ariaLabel}
      title={shortcut ? `${ariaLabel} (${shortcut})` : ariaLabel}
      aria-keyshortcuts={shortcut ? shortcut.replace('⌘', 'Meta+').replace('Ctrl+', 'Control+') : undefined}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      onClick={onClick}
    >
      <span className="ve-ctl__disc">{icon}</span>
      <span className="ve-ctl__label" aria-hidden="true">{label}</span>
    </button>
  );
}
