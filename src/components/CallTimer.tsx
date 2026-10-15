import { useEffect, useState } from 'react';
import { cx, useVideoUi } from '../theme';

export interface CallTimerProps {
  /**
   * When the call started (ISO 8601): its first join, from the product's backend, so everyone in
   * the call reads the same time. Absent or unreadable = since this person joined.
   */
  startedAt?: string | null;
  className?: string;
}

/** `m:ss` under an hour, `h:mm:ss` from then on. */
export function formatCallElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');

  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * How long the call has been going, like any call app's running clock (owner 2026-10-15: "a proper
 * meeting timer, similar to an ongoing call timer"). Daily Prebuilt has none, so the kit draws it
 * for every product. Only the elapsed time: the booked end is ScheduledEndCue's.
 */
export function CallTimer({ startedAt = null, className }: CallTimerProps) {
  const { labels } = useVideoUi();
  // Read once, outside render: the moment this person's call frame joined.
  const [joinedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(id);
  }, []);

  const parsed = startedAt ? Date.parse(startedAt) : Number.NaN;
  const from = Number.isNaN(parsed) ? joinedAt : parsed;
  const time = formatCallElapsed((now - from) / 1000);

  return (
    <span className={cx('ve-timer', className)} role="timer" aria-label={labels.callElapsed(time)}>
      <span className="ve-timer__dot" aria-hidden="true" />
      <span aria-hidden="true">{time}</span>
    </span>
  );
}
