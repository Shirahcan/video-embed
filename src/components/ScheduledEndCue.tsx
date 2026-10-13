import { useEffect, useState } from 'react';
import { cx, useVideoUi } from '../theme';

export interface ScheduledEndCueProps {
  /**
   * When the meeting was BOOKED to end (ISO 8601). Not the room's close: the room stays open
   * past it (its after-window, any extension), and the cue is about the time the people agreed.
   */
  scheduledEnd: string;
  /** The countdown starts this many minutes before the end. */
  countdownMinutes?: number;
  /** Something the viewer can do at the end (a host keeping the room open longer), when allowed. */
  action?: { label: string; onSelect: () => void };
  className?: string;
}

/** Whole seconds until the end, from a clock read outside render. */
function secondsLeft(endMs: number): number {
  return Math.ceil((endMs - Date.now()) / 1000);
}

function mmss(seconds: number): string {
  const s = Math.max(0, seconds);

  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Where the call stands against its booked time: a quiet countdown over the last few minutes,
 * then "you are at the end of the scheduled meeting time" (owner 2026-10-13). Nothing before that.
 * The seconds are not announced to a screen reader; the minute and the end are.
 */
export function ScheduledEndCue({ scheduledEnd, countdownMinutes = 5, action, className }: ScheduledEndCueProps) {
  const { labels, classNames } = useVideoUi();
  const endMs = Date.parse(scheduledEnd);
  const [left, setLeft] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (Number.isNaN(endMs)) return undefined;
    const tick = () => setLeft(secondsLeft(endMs));
    tick();
    const id = setInterval(tick, 1000);

    return () => clearInterval(id);
  }, [endMs]);

  if (left === null || left > countdownMinutes * 60) {
    return null;
  }

  if (left > 0) {
    const minutes = Math.ceil(left / 60);

    return (
      <div className={cx('ve-banner ve-banner--time', className)}>
        <span>
          <span aria-hidden="true">{labels.endCueCountdown(mmss(left))}</span>
          <span className="ve-sr-only" role="status" aria-live="polite">{labels.endCueMinutes(minutes)}</span>
        </span>
      </div>
    );
  }

  if (dismissed) {
    return null;
  }

  return (
    <div className={cx('ve-banner ve-banner--time ve-banner--end', className)} role="status" aria-live="polite">
      <span>{labels.endCueReached}</span>
      {action ? (
        <button type="button" className={cx('ve-btn', classNames.button)} onClick={action.onSelect}>{action.label}</button>
      ) : null}
      <button type="button" className={cx('ve-btn', classNames.button)} onClick={() => setDismissed(true)}>{labels.dismiss}</button>
    </div>
  );
}
