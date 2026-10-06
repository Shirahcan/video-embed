/**
 * Diagnose, do not guess. "Your mic does not work" has at least six different causes and
 * each has a different fix: the browser was told no, the OPERATING SYSTEM was told no
 * (the browser itself is not allowed to use the mic), nothing is plugged in, another app
 * holds the device, the page is not secure, or the device opens but hears nothing.
 */
export type MediaDevice = 'microphone' | 'camera';

export type MediaProblem =
  | 'blocked-browser'
  | 'blocked-system'
  | 'not-found'
  | 'in-use'
  | 'constraints'
  | 'insecure'
  | 'unsupported'
  | 'silent'
  | 'unknown';

export type BrowserFamily = 'chrome' | 'edge' | 'firefox' | 'safari' | 'ios' | 'android' | 'other';

export interface MediaDiagnosis {
  problem: MediaProblem;
  device: MediaDevice;
  browser: BrowserFamily;
  /** The browser's own words, kept for support. */
  detail: string;
}

export function browserFamily(userAgent: string): BrowserFamily {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (ua.includes('android')) return 'android';
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('firefox/')) return 'firefox';
  if (ua.includes('chrome/') || ua.includes('crios/')) return 'chrome';
  if (ua.includes('safari/')) return 'safari';
  return 'other';
}

export function currentBrowser(): BrowserFamily {
  return typeof navigator === 'undefined' ? 'other' : browserFamily(navigator.userAgent ?? '');
}

/** Can this page ask for devices at all? */
export function mediaAvailability(): 'ok' | 'insecure' | 'unsupported' {
  if (typeof window === 'undefined') return 'unsupported';
  if (window.isSecureContext === false) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return 'ok';
}

/** Turn a getUserMedia rejection into the cause. */
export function diagnoseMediaError(error: unknown, device: MediaDevice, browser: BrowserFamily = currentBrowser()): MediaDiagnosis {
  const name = (error as { name?: string } | null)?.name ?? '';
  const message = (error as { message?: string } | null)?.message ?? String(error ?? '');
  const text = message.toLowerCase();

  let problem: MediaProblem = 'unknown';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    // Chrome and Edge say "Permission denied by system" when the OS (macOS privacy
    // settings, Windows privacy settings) refuses the BROWSER, before the site is asked.
    problem = text.includes('by system') || text.includes('system') ? 'blocked-system' : 'blocked-browser';
  } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    problem = 'not-found';
  } else if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    problem = 'in-use';
  } else if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    problem = 'constraints';
  } else if (name === 'TypeError' && mediaAvailability() !== 'ok') {
    problem = mediaAvailability() === 'insecure' ? 'insecure' : 'unsupported';
  }

  return { problem, device, browser, detail: message };
}

/** Root-mean-square of a time-domain buffer: how loud the mic is right now. */
export function rms(buffer: ArrayLike<number>): number {
  if (buffer.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / buffer.length);
}

/** Above this the mic is genuinely hearing something (speech is well above it). */
export const SIGNAL_THRESHOLD = 0.012;
