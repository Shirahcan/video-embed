/**
 * One random id per browser, sent with presence (call continuity), so video-service can tell "this person
 * on their laptop" from "this person on their phone". Kept in localStorage; FAILS OPEN: with storage
 * unavailable the id lives only as long as the page, which at worst misses a "you are on another device".
 */
const KEY = 've_device_id';
let pageOnly: string | null = null;

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `dev-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function presenceDeviceId(): string {
  try {
    const kept = window.localStorage.getItem(KEY);
    if (kept) return kept;
    const made = randomId();
    window.localStorage.setItem(KEY, made);
    return made;
  } catch {
    pageOnly ??= randomId();
    return pageOnly;
  }
}
