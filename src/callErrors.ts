/**
 * Why a call died, in terms a product can act on.
 *
 * Daily reports a fatal `error` event with a `type` (exp-room, no-room, not-allowed, ...)
 * and a raw message. The raw message alone is a dead end for a person ("Meeting has ended"
 * while their consultant is still talking). Each kind here has a RECOVERY, and the product
 * performs it: room and token kinds ask the product for a FRESH join (its backend repairs
 * the room under the same name and mints a new token); network waits for the connection.
 */
export type CallFailureKind =
  /** The room does not exist (deleted, never made, lost by Daily). */
  | 'room-missing'
  /** The room's own window closed (exp passed) while the meeting is still on. */
  | 'room-expired'
  /** Too early: the room is not open yet (nbf). */
  | 'not-open-yet'
  /** The person's token expired or is not valid yet. */
  | 'token-expired'
  /** The room refused this person (a token for another room or domain, or none at all). */
  | 'not-allowed'
  /** A host removed this person. Never auto-rejoined. */
  | 'ejected'
  | 'meeting-full'
  /** The browser is too old for Daily. */
  | 'unsupported-browser'
  | 'network'
  | 'unknown';

export interface CallFailure {
  kind: CallFailureKind;
  /** Daily's own message, kept for the record and for support. */
  message: string;
}


/**
 * Kinds a fresh join (repaired room, new token) can fix without a person deciding.
 * `not-open-yet` is here on purpose: the product only offers Join while ITS window is open, so
 * Daily still refusing means a reschedule never reached the room, and the repair opens it.
 */
export const REPAIRABLE: ReadonlySet<CallFailureKind> = new Set([
  'room-missing',
  'not-open-yet',
  'room-expired',
  'token-expired',
  'not-allowed',
]);

export function classifyCallError(event: unknown): CallFailure {
  const raw = event as { errorMsg?: string; error?: { type?: string; msg?: string } } | undefined;
  const type = raw?.error?.type ?? '';
  const message = raw?.error?.msg ?? raw?.errorMsg ?? 'The call connection failed.';

  const byType: Record<string, CallFailureKind> = {
    'no-room': 'room-missing',
    'exp-room': 'room-expired',
    'nbf-room': 'not-open-yet',
    'exp-token': 'token-expired',
    'nbf-token': 'token-expired',
    'not-allowed': 'not-allowed',
    ejected: 'ejected',
    'meeting-full': 'meeting-full',
    'end-of-life': 'unsupported-browser',
    'connection-error': 'network',
  };
  if (byType[type]) return { kind: byType[type], message };

  // Older daily-js builds send only a message.
  const text = message.toLowerCase();
  const kind: CallFailureKind =
    text.includes('does not exist') || text.includes('no room') ? 'room-missing'
      : text.includes('meeting has ended') || text.includes('room has expired') || text.includes('expired') ? 'room-expired'
        : text.includes('not allowed') || text.includes('not authorized') ? 'not-allowed'
          : text.includes('ejected') || text.includes('removed') ? 'ejected'
            : text.includes('full') ? 'meeting-full'
              : text.includes('network') || text.includes('connect') ? 'network'
                : 'unknown';

  return { kind, message };
}
