import { useEffect, useState } from 'react';

/**
 * What a tab remembers about its call, so the call can keep up with the person beyond the page.
 *
 * - **This tab was in call X** (sessionStorage: per tab, survives a reload, gone when the tab
 *   closes). A product reads `wasInCallRecently(key)` after a reload and takes the person straight
 *   back to the call instead of making them find the Join button again.
 * - **A call is running in another tab** (the one-tab guard's locks in localStorage). Any page can
 *   say so with `useCallInAnotherTab()`, not only the page of that call.
 *
 * Every read FAILS SAFE: no storage (private mode, blocked site data) reads as "nothing remembered".
 */

const MEMORY_KEY = 've_in_call';
/** A reload within this long counts as "still in the call". */
export const REJOIN_WINDOW_MS = 2 * 60 * 1000;

interface Memory {
  key: string;
  ts: number;
}

function readMemory(): Memory | null {
  try {
    const raw = window.sessionStorage.getItem(MEMORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Memory>;
    return typeof parsed?.key === 'string' && typeof parsed?.ts === 'number' ? { key: parsed.key, ts: parsed.ts } : null;
  } catch {
    return null;
  }
}

/** This tab is in the call `key` now (also stamped as the page goes away, so a reload reads it fresh). */
export function rememberInCall(key: string): void {
  try {
    window.sessionStorage.setItem(MEMORY_KEY, JSON.stringify({ key, ts: Date.now() }));
  } catch {
    /* fail safe */
  }
}

/** The person left the call on purpose (or it is over): a reload must not take them back. */
export function forgetInCall(key?: string): void {
  try {
    if (key !== undefined && readMemory()?.key !== key) return;
    window.sessionStorage.removeItem(MEMORY_KEY);
  } catch {
    /* fail safe */
  }
}

/** This tab was in the call `key` moments ago (a reload, a crash of the page). */
export function wasInCallRecently(key: string, withinMs: number = REJOIN_WINDOW_MS): boolean {
  if (typeof window === 'undefined') return false;
  const memory = readMemory();
  return memory !== null && memory.key === key && Date.now() - memory.ts < withinMs;
}

/* ----- a call in another tab ----- */

/** The one-tab guard's lock prefix and staleness (kept in step with useSingleTabCall). */
export const LOCK_PREFIX = 've_call_lock:';
const LOCK_STALE_MS = 6000;

/** Tab ids that belong to THIS tab's calls (registered by useSingleTabCall). */
export const ownTabIds = new Set<string>();

/** A live call lock held by a tab other than this one. */
export function callRunningInAnotherTab(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const now = Date.now();
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const name = window.localStorage.key(i);
      if (!name || !name.startsWith(LOCK_PREFIX)) continue;
      const lock = JSON.parse(window.localStorage.getItem(name) ?? 'null') as { tabId?: unknown; ts?: unknown } | null;
      if (typeof lock?.tabId !== 'string' || typeof lock.ts !== 'number') continue;
      if (!ownTabIds.has(lock.tabId) && now - lock.ts < LOCK_STALE_MS) return true;
    }
  } catch {
    /* fail safe */
  }
  return false;
}

/** True while a call runs in another tab of this browser. Polls gently; off when `enabled` is false. */
export function useCallInAnotherTab(enabled = true, everyMs = 3000): boolean {
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const check = () => setRunning(callRunningInAnotherTab());
    check();
    const timer = setInterval(check, everyMs);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith(LOCK_PREFIX)) check();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', onStorage);
    };
  }, [enabled, everyMs]);

  return enabled && running;
}
