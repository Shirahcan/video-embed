import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { cx, useVideoUi } from '../theme';

export type JoinRequestStatus = 'waiting' | 'admitted' | 'declined' | 'expired';

/** The product's own backend, which asks video-service (the package never calls the service). */
export interface AskToJoinAdapter {
  /** Ask to join under this name; the request's id. */
  ask: (name: string) => Promise<{ id: string }>;
  /** Where the request stands now. */
  status: (id: string) => Promise<{ status: JoinRequestStatus }>;
}

export interface AskToJoinProps {
  adapter: AskToJoinAdapter;
  /** The host said yes: the product fetches the pass and opens the call. */
  onAdmitted: (requestId: string) => void;
  /** How often to ask whether the host answered (ms). */
  pollMs?: number;
  onError?: (error: unknown) => void;
  className?: string;
}

type Phase = { kind: 'form' } | { kind: 'asking' } | { kind: 'waiting'; id: string } | { kind: 'declined' } | { kind: 'expired' };

/**
 * Someone who opened a call's "anyone with the link" link (plan M7j): they say who they are, ask,
 * and wait on this page until the host lets them in from the call (JoinRequestBar). The same in
 * every product; the product supplies the adapter and opens the call once admitted.
 */
export function AskToJoin({ adapter, onAdmitted, pollMs = 3000, onError, className }: AskToJoinProps) {
  const { labels, classNames } = useVideoUi();
  const ids = useId();
  const [name, setName] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [failed, setFailed] = useState(false);

  // The latest callbacks, kept out of the polling effect's dependencies (written in an effect).
  const admittedRef = useRef(onAdmitted);
  const errorRef = useRef(onError);
  useEffect(() => {
    admittedRef.current = onAdmitted;
    errorRef.current = onError;
  });

  const waitingId = phase.kind === 'waiting' ? phase.id : null;
  useEffect(() => {
    if (waitingId === null) return;
    let live = true;
    const tick = async () => {
      try {
        const { status } = await adapter.status(waitingId);
        if (!live) return;
        if (status === 'admitted') admittedRef.current(waitingId);
        else if (status === 'declined') setPhase({ kind: 'declined' });
        else if (status === 'expired') setPhase({ kind: 'expired' });
      } catch (e) {
        // A missed poll is retried on the next tick; the page says nothing yet.
        errorRef.current?.(e);
      }
    };
    const timer = setInterval(() => void tick(), pollMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [adapter, waitingId, pollMs]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const typed = name.trim();
    if (typed.length < 2) return;
    setFailed(false);
    setPhase({ kind: 'asking' });
    try {
      const { id } = await adapter.ask(typed);
      setPhase({ kind: 'waiting', id });
    } catch (err) {
      setFailed(true);
      setPhase({ kind: 'form' });
      onError?.(err);
    }
  };

  if (phase.kind === 'waiting') {
    return (
      <section className={cx('ve-ask', className)} aria-live="polite" aria-busy="true">
        <span className="ve-ask__pulse" aria-hidden="true" />
        <p className="ve-ask__title">{labels.askWaiting}</p>
        <p className="ve-ask__hint">{labels.askWaitingHint}</p>
      </section>
    );
  }

  if (phase.kind === 'declined' || phase.kind === 'expired') {
    return (
      <section className={cx('ve-ask', className)} aria-live="polite">
        <p className="ve-ask__title">{phase.kind === 'declined' ? labels.askDeclined : labels.askExpired}</p>
        {phase.kind === 'expired' ? (
          <button type="button" className={cx('ve-btn ve-btn--primary', classNames.button)} onClick={() => setPhase({ kind: 'form' })}>
            {labels.askAgain}
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <form className={cx('ve-ask', className)} onSubmit={(e) => void submit(e)} aria-labelledby={`${ids}-t`}>
      <p id={`${ids}-t`} className="ve-ask__title">{labels.askTitle}</p>
      <p className="ve-ask__hint">{labels.askIntro}</p>
      <label className="ve-ask__field">
        <span>{labels.askName}</span>
        <input
          className="ve-ask__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          maxLength={60}
          autoComplete="name"
          required
        />
      </label>
      {failed ? <p className="ve-ask__error" role="alert">{labels.askFailed}</p> : null}
      <button type="submit" className={cx('ve-btn ve-btn--primary', classNames.button)} disabled={phase.kind === 'asking' || name.trim().length < 2}>
        {phase.kind === 'asking' ? labels.askAsking : labels.askSubmit}
      </button>
    </form>
  );
}
