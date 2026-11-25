import { useCallback, useEffect, useRef } from 'react';

/** `check` (call continuity) asks before joining and records nothing. */
export type PresenceKind = 'join' | 'heartbeat' | 'leave' | 'check';

/** Sent with a signal when the product opts into call continuity. */
export interface PresenceOptions {
  /** A random id per browser ({@link presenceDeviceId}). */
  deviceId: string;
  /** On a join: move the call here; every other device is told on its next beat. */
  takeOver?: boolean;
}

/** What video-service answers a device's signal (absent when the product sends no device). */
export interface PresenceAnswer {
  /** This person is in the call on another device, since when. */
  elsewhere?: { since: string } | null;
  /** Another device took the call from this one. */
  superseded?: boolean;
}

export type PresenceSender = (kind: PresenceKind, options?: PresenceOptions) => Promise<PresenceAnswer | void>;

/**
 * Presence from the call page, the same in every product (owner 2026-10-07): a `join` when the
 * person is in, a `heartbeat` every minute while they stay, a `leave` when they go (the Leave
 * button, a closed tab). The product's backend relays each one to video-service through the
 * video-client kit route, where it becomes the service's own witness for the call verdict.
 *
 * With a `deviceId` (call continuity) every signal carries it, and each answer is handed to `onAnswer`
 * (the frame leaves the call when another device took it over).
 *
 * `send` failures are swallowed: presence must never disturb a call.
 */
export function useCallPresence(
  send: PresenceSender | undefined,
  intervalMs = 60_000,
  deviceId: string | null = null,
  onAnswer?: (answer: PresenceAnswer, kind: PresenceKind) => void,
) {
  const sendRef = useRef(send);
  const answerRef = useRef(onAnswer);
  const joined = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    sendRef.current = send;
    answerRef.current = onAnswer;
  });

  const fire = useCallback((kind: PresenceKind, takeOver = false) => {
    const options = deviceId ? { deviceId, ...(takeOver ? { takeOver: true } : {}) } : undefined;
    // Without a device the call is exactly what it always was: one argument.
    const sent = options ? sendRef.current?.(kind, options) : sendRef.current?.(kind);
    sent
      ?.then((answer) => {
        if (answer && deviceId) answerRef.current?.(answer, kind);
      })
      .catch(() => {});
  }, [deviceId]);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  /** `takeOver`: this join moves the call here from the person's other device. */
  const joinedNow = useCallback((takeOver = false) => {
    if (joined.current) return;
    joined.current = true;
    fire('join', takeOver);
    stop();
    timer.current = setInterval(() => fire('heartbeat'), intervalMs);
  }, [fire, stop, intervalMs]);

  const leftNow = useCallback(() => {
    if (!joined.current) return;
    joined.current = false;
    stop();
    fire('leave');
  }, [fire, stop]);

  useEffect(() => {
    const onHide = () => leftNow();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      leftNow();
    };
  }, [leftNow]);

  return { joinedNow, leftNow };
}
