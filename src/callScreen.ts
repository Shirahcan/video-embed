/**
 * Which call screen a person gets: the one WE draw (Daily's call object, the floating window) or
 * Daily Prebuilt. Decided by what the device can do, never by role: every product and every role
 * reads the same answer on the same browser.
 *
 * Drawn only when ALL hold:
 * - the product allows it (its own gate);
 * - the browser has Document Picture-in-Picture (desktop Chrome / Edge today), which the drawn
 *   screen needs for its floating window;
 * - it is not a phone or tablet (a touch-only pointer, or a mobile user agent);
 * - the person has not chosen the standard screen on this device ("Use the standard call screen").
 *
 * Anything else gets Prebuilt, which is also where every drawn-screen failure falls back to.
 */
export type CallScreen = 'drawn' | 'prebuilt';

/** Remembered per device (localStorage): the person chose the standard screen. */
export const STANDARD_SCREEN_KEY = 've_call_screen';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The person asked for the standard call screen on this device. */
export function preferStandardScreen(): void {
  try {
    storage()?.setItem(STANDARD_SCREEN_KEY, 'standard');
  } catch {
    /* storage full or blocked: the choice simply is not remembered */
  }
}

/** Forget the choice (the drawn screen is offered again where the device allows it). */
export function clearStandardScreenPreference(): void {
  try {
    storage()?.removeItem(STANDARD_SCREEN_KEY);
  } catch {
    /* blocked */
  }
}

export function prefersStandardScreen(): boolean {
  try {
    return storage()?.getItem(STANDARD_SCREEN_KEY) === 'standard';
  } catch {
    return false;
  }
}

/** A phone or tablet: a touch-only pointer, or a mobile user agent. */
export function isHandheld(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    const fine = window.matchMedia?.('(any-pointer: fine)')?.matches ?? false;
    return coarse && !fine;
  } catch {
    return false;
  }
}

export function canFloatDrawnCall(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

export function chooseCallScreen(drawnAllowed: boolean): CallScreen {
  if (!drawnAllowed || typeof window === 'undefined') return 'prebuilt';
  if (!canFloatDrawnCall() || isHandheld() || prefersStandardScreen()) return 'prebuilt';
  return 'drawn';
}

/**
 * Daily's call object ignores a pass left inside the URL (`?t=`) and puts the person in the room's
 * lobby instead, where nobody can see them (P1 spike, 2026-11-26). The drawn screen therefore always
 * joins with the room address and the pass apart.
 */
export function splitJoinUrl(url: string): { url: string; token: string | null } {
  try {
    const u = new URL(url);
    const token = u.searchParams.get('t');
    u.searchParams.delete('t');
    return { url: u.toString(), token };
  } catch {
    return { url, token: null };
  }
}
