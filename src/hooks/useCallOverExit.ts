import { useCallback, useEffect, useState } from 'react';

export type CallOverHow = 'by-me' | 'ended';

/** How long someone the call was ended FOR reads the notice before being moved on. */
export const CALL_OVER_NOTICE_MS = 4000;

export interface CallOverExitOptions {
  /**
   * Where this viewer goes once the call is over, from the product's backend: the surface the call
   * belongs to (a case step, a candidate on the vetting floor, a hiring decision), else the
   * meeting's own page (owner 2026-10-15). Null while it is not known yet: nobody is moved.
   */
  href: string | null;
  /** The product's router (a replace, so Back does not return to a dead room). */
  navigate: (href: string) => void;
  /** The server already says it is over (ended, or join-config reads `ended`). */
  endedElsewhere?: boolean;
  /** A scratchpad is in the room: it saves itself on the way out, and the move waits for that save. */
  padMounted?: boolean;
}

export interface CallOverExit {
  over: CallOverHow | null;
  /** Hand to the call frame's `onEnded`. */
  onEnded: (how: CallOverHow) => void;
  /** The pad finished saving (its `onSettled`). */
  settlePad: () => void;
  goNow: () => void;
  waitingOnPad: boolean;
}

/**
 * Leaving a call that is over, the same in every product's room (moved from Portify, plan M9-R1b):
 *
 *   ended it myself (a host)  -> straight to `href`
 *   ended for me              -> a short notice (CallOverNotice), then the same place
 *
 * A host's scratchpad is saved on the way out and never asked about (owner 2026-10-09): unsettled
 * pads surface later as banners. The move waits only for that save. Nothing asks "how did the call
 * go": the decision is made where the call returns to.
 */
export function useCallOverExit({ href, navigate, endedElsewhere = false, padMounted = false }: CallOverExitOptions): CallOverExit {
  const [how, setHow] = useState<CallOverHow | null>(null);
  const [padSettled, setPadSettled] = useState(false);

  const over: CallOverHow | null = how ?? (endedElsewhere ? 'ended' : null);
  const ready = over !== null && href !== null && (!padMounted || padSettled);

  useEffect(() => {
    if (!ready || href === null) return undefined;
    if (over === 'by-me') {
      navigate(href);
      return undefined;
    }
    const t = setTimeout(() => navigate(href), CALL_OVER_NOTICE_MS);
    return () => clearTimeout(t);
  }, [ready, over, href, navigate]);

  const onEnded = useCallback((h: CallOverHow) => {
    setHow((current) => current ?? h);
  }, []);
  const settlePad = useCallback(() => setPadSettled(true), []);
  const goNow = useCallback(() => {
    if (href !== null) navigate(href);
  }, [navigate, href]);

  return { over, onEnded, settlePad, goNow, waitingOnPad: over !== null && padMounted && !padSettled };
}
