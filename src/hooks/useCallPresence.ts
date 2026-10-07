import { useCallback, useEffect, useRef } from 'react';

export type PresenceKind = 'join' | 'heartbeat' | 'leave';

/**
 * Presence from the call page, the same in every product (owner 2026-10-07): a `join` when the
 * person is in, a `heartbeat` every minute while they stay, a `leave` when they go (the Leave
 * button, a closed tab). The product's backend relays each one to video-service through the
 * video-client kit route, where it becomes the service's own witness for the call verdict.
 *
 * `send` failures are swallowed: presence must never disturb a call.
 */
export function useCallPresence(send: ((kind: PresenceKind) => Promise<void>) | undefined, intervalMs = 60_000) {
  const sendRef = useRef(send);
  const joined = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    sendRef.current = send;
  });

  const fire = useCallback((kind: PresenceKind) => {
    sendRef.current?.(kind).catch(() => {});
  }, []);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const joinedNow = useCallback(() => {
    if (joined.current) return;
    joined.current = true;
    fire('join');
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
    window.addEventListener('pagehide', leftNow);
    return () => {
      window.removeEventListener('pagehide', leftNow);
      leftNow();
    };
  }, [leftNow]);

  return { joinedNow, leftNow };
}
