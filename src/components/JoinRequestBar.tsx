import { useCallback, useEffect, useRef, useState } from 'react';
import { cx, useVideoUi } from '../theme';
import { chime } from './KnockBar';

/** Someone waiting to be let in (plan M7j). */
export interface WaitingRequest {
  id: string;
  name: string;
}

/** The product's own backend, which asks video-service (the package never calls the service). */
export interface JoinRequestsAdapter {
  /** Who is waiting on the call now, oldest first. */
  list: () => Promise<WaitingRequest[]>;
  decide: (id: string, admit: boolean) => Promise<void>;
}

export interface JoinRequestsState {
  requests: WaitingRequest[];
  /** The request being answered. */
  busyId: string | null;
  decide: (id: string, admit: boolean) => Promise<void>;
}

/**
 * Who is asking to join the call, polled while the host is on the call page, and the host's
 * answer. Pass `enabled: false` for anyone who is not a host (it then never asks).
 */
export function useJoinRequests(adapter: JoinRequestsAdapter, { pollMs = 4000, enabled = true, onError }: { pollMs?: number; enabled?: boolean; onError?: (error: unknown) => void } = {}): JoinRequestsState {
  const [requests, setRequests] = useState<WaitingRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const errorRef = useRef(onError);
  useEffect(() => {
    errorRef.current = onError;
  });

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const tick = async () => {
      try {
        const next = await adapter.list();
        if (live) setRequests(next);
      } catch (e) {
        // The next tick tries again; the call itself carries on.
        errorRef.current?.(e);
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), pollMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [adapter, enabled, pollMs]);

  const decide = useCallback(async (id: string, admit: boolean) => {
    setBusyId(id);
    try {
      await adapter.decide(id, admit);
      // Answered (or answered by another host meanwhile): off the list either way.
      setRequests((rs) => rs.filter((r) => r.id !== id));
    } catch (e) {
      errorRef.current?.(e);
      setRequests((rs) => rs.filter((r) => r.id !== id));
    } finally {
      setBusyId(null);
    }
  }, [adapter]);

  return { requests: enabled ? requests : [], busyId, decide };
}

/**
 * The host's notice that someone is waiting to be let in by an "anyone with the link" link: each
 * name with Let in and Decline, above the call, with KnockBar's chime when someone new arrives.
 * Unlike KnockBar, this admits by itself (video-service holds the request, the product mints the
 * pass), so it works on rooms with no Daily prejoin screen.
 */
export function JoinRequestBar({ state, sound = true, className }: { state: JoinRequestsState; sound?: boolean; className?: string }) {
  const { labels, classNames } = useVideoUi();
  const { requests, busyId, decide } = state;
  const heard = useRef(0);

  useEffect(() => {
    if (sound && requests.length > heard.current) chime();
    heard.current = requests.length;
  }, [requests.length, sound]);

  if (requests.length === 0) return null;

  return (
    <div className={cx('ve-knock', classNames.knockBar, className)} role="alert">
      <p className="ve-knock__title">
        {requests.length === 1 ? labels.knockingOne(requests[0]?.name ?? '') : labels.knockingMany(requests.length)}
      </p>
      <ul className="ve-requests">
        {requests.map((r) => (
          <li key={r.id} className="ve-requests__row">
            <span className="ve-knock__name">{r.name}</span>
            <span className="ve-requests__actions">
              <button type="button" className={cx('ve-btn', classNames.button)} disabled={busyId !== null} onClick={() => void decide(r.id, false)}>
                {labels.requestDecline}
              </button>
              <button type="button" className={cx('ve-btn ve-btn--primary', classNames.button)} disabled={busyId !== null} onClick={() => void decide(r.id, true)}>
                {labels.requestLetIn}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="ve-knock__hint">{labels.requestHint}</p>
    </div>
  );
}
