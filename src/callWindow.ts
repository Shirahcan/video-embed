import { useEffect, useState } from 'react';

/**
 * When a call can be joined, as the product's API states it (video-service's numbers, applied by
 * video-client's CallWindow on the server). A screen compares the clock to these two instants and
 * never to a rule of its own: Portify alone had four ("10 minutes before", "30 before", "only at
 * the start", "an hour after") before this (owner 2026-10-06).
 */
export interface CallWindowTimes {
  opensAt?: string | null;
  closesAt?: string | null;
}

export type CallWindowPhase = 'unknown' | 'before' | 'open' | 'closed';

export function callWindowPhase(times: CallWindowTimes, nowMs: number): CallWindowPhase {
  const opens = times.opensAt ? Date.parse(times.opensAt) : NaN;
  const closes = times.closesAt ? Date.parse(times.closesAt) : NaN;
  if (Number.isNaN(opens) || Number.isNaN(closes)) return 'unknown';
  if (nowMs < opens) return 'before';
  if (nowMs > closes) return 'closed';
  return 'open';
}

export function isCallJoinable(times: CallWindowTimes, nowMs: number): boolean {
  return callWindowPhase(times, nowMs) === 'open';
}

/** The next instant the phase changes, or null when it never will. */
function nextBoundary(times: CallWindowTimes, nowMs: number): number | null {
  const opens = times.opensAt ? Date.parse(times.opensAt) : NaN;
  const closes = times.closesAt ? Date.parse(times.closesAt) : NaN;
  if (!Number.isNaN(opens) && nowMs < opens) return opens;
  if (!Number.isNaN(closes) && nowMs <= closes) return closes + 1;
  return null;
}

/**
 * The phase now, re-read exactly when it changes (the room opens, the room closes), so a Join
 * button appears on its own while someone waits on the page.
 */
export function useCallWindowPhase(times: CallWindowTimes): CallWindowPhase {
  const { opensAt, closesAt } = times;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    // From the clock as last read: a boundary already passed fires at once and corrects it.
    const next = nextBoundary({ opensAt, closesAt }, nowMs);
    if (next === null) return undefined;
    // setTimeout caps near 24.8 days; re-check daily for a far boundary.
    const timer = setTimeout(() => setNowMs(Date.now()), Math.min(Math.max(next - nowMs, 0) + 50, 86_400_000));
    return () => clearTimeout(timer);
  }, [opensAt, closesAt, nowMs]);

  return callWindowPhase({ opensAt, closesAt }, nowMs);
}
