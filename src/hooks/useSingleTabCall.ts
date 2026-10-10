import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * One person, one call, one tab. Every tab holds a valid join, so nothing else stops a second
 * join from the same machine, and two live microphones in one room is the echo people report as
 * "the sound was terrible". The holding tab beats a lock in localStorage; another tab that opens
 * the same call stands down until it is told to take over, or until the holder is gone.
 *
 * localStorage rather than BroadcastChannel (absent in older Safari). FAILS OPEN: with storage
 * unavailable (private mode, blocked site data) the person simply joins.
 *
 * A reload or a closed tab never runs React's cleanup, so the lock is also released on
 * `pagehide`: otherwise the reloaded page reads its own old lock as "another tab".
 */

/** The holder refreshes its lock this often. */
const BEAT_MS = 2000;
/** Older than this and the holder is presumed gone (crash, kill, sleep). */
const STALE_MS = 6000;

interface Lock {
  tabId: string;
  ts: number;
}

const keyFor = (callKey: string) => `ve_call_lock:${callKey}`;

function read(callKey: string): Lock | null {
  try {
    const raw = window.localStorage.getItem(keyFor(callKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Lock>;
    return typeof parsed?.tabId === 'string' && typeof parsed?.ts === 'number' ? { tabId: parsed.tabId, ts: parsed.ts } : null;
  } catch {
    return null;
  }
}

function write(callKey: string, lock: Lock): void {
  try {
    window.localStorage.setItem(keyFor(callKey), JSON.stringify(lock));
  } catch {
    /* fail open */
  }
}

function newTabId(): string {
  // crypto.randomUUID is missing on plain-http origins in some browsers.
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export interface SingleTabCall {
  /** Another live tab on this machine holds the call. */
  heldElsewhere: boolean;
  /** Take the call into this tab (the other one stands down). */
  takeOver: () => void;
}

/** `callKey`: the call's room address without its pass (the same in every tab). Null = no guard. */
export function useSingleTabCall(callKey: string | null): SingleTabCall {
  const [tabId] = useState(newTabId);
  // At mount a fresh tab id can own no lock, so "held elsewhere" is simply "a live lock exists".
  const [heldElsewhere, setHeldElsewhere] = useState(() => {
    if (!callKey || typeof window === 'undefined') return false;
    const lock = read(callKey);
    return lock !== null && Date.now() - lock.ts < STALE_MS;
  });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const claim = useCallback(() => {
    if (!callKey) return;
    write(callKey, { tabId, ts: Date.now() });
    setHeldElsewhere(false);
  }, [callKey, tabId]);

  useEffect(() => {
    if (!callKey || typeof window === 'undefined') return undefined;

    const heldByAnother = () => {
      const lock = read(callKey);
      return lock !== null && lock.tabId !== tabId && Date.now() - lock.ts < STALE_MS;
    };
    const release = () => {
      if (read(callKey)?.tabId !== tabId) return;
      try {
        window.localStorage.removeItem(keyFor(callKey));
      } catch {
        /* fail open */
      }
    };

    if (!heldByAnother()) write(callKey, { tabId, ts: Date.now() });

    // One beat for both states: the holder refreshes its lock; a tab that stood down takes the
    // call once the other is gone (its lock goes stale), so nobody stays blocked by a dead tab.
    timer.current = setInterval(() => {
      if (heldByAnother()) {
        setHeldElsewhere(true);
        return;
      }
      claim();
    }, BEAT_MS);

    window.addEventListener('pagehide', release);

    return () => {
      window.removeEventListener('pagehide', release);
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      release();
    };
  }, [callKey, claim, tabId]);

  return { heldElsewhere, takeOver: claim };
}
