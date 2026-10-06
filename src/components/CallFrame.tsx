import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { REPAIRABLE, type CallFailure, type CallFailureKind } from '../callErrors';
import type { MediaDiagnosis } from '../diagnose';
import { useDailyFrame, type WaitingPerson } from '../hooks/useDailyFrame';
import { cx, useVideoUi } from '../theme';
import { KnockBar } from './KnockBar';
import { Troubleshooter } from './Troubleshooter';

export type RecoveryStatus = 'idle' | 'repairing' | 'repaired' | 'failed' | 'offline';

export interface CallFrameProps {
  /** The tokened join URL the product's backend handed out. */
  url: string;
  /**
   * Ask the product for a FRESH join after a failure. The product's backend repairs the room
   * (same name, so every link still works), mints a new token and returns the new URL.
   * Without it, a failure can only be rejoined as-is.
   */
  fetchFreshUrl?: (why: CallFailureKind) => Promise<string>;
  onJoined?: () => void;
  onLeft?: () => void;
  /** Every failure and its outcome, for the product's own record. */
  onFailure?: (failure: CallFailure, recovery: RecoveryStatus) => void;
  onDeviceError?: (diagnosis: MediaDiagnosis) => void;
  onKnock?: (person: WaitingPerson) => void;
  /**
   * The viewer is a HOST and may end the call for everyone. The product's backend removes
   * everyone and closes the room; resolve once it has. Offered in the toolbar, and again when
   * the host leaves by the call's own Leave button. Absent = the viewer can only leave.
   */
  onEndForEveryone?: () => Promise<void>;
  /**
   * Ask the product whether the call was ENDED (by a host, or for sitting empty). Checked
   * before repairing a failure and on removal, so a call that is over reads "ended" instead
   * of being repaired, or reading as a removal.
   */
  checkEnded?: () => Promise<boolean>;
  /**
   * The call is over for this viewer: `by-me` when this host just ended it, `ended` when it
   * was ended for them (a host, the room's close, sitting empty). The product decides where
   * to take them next (owner 2026-10-06: a host who ended it on purpose leaves at once;
   * anyone else sees the notice briefly first).
   */
  onEnded?: (how: 'by-me' | 'ended') => void;
  /** Hide the frame (another tab holds the call). */
  enabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** The call: Daily Prebuilt plus typed failures, automatic repair, the knock bar and help. */
/** Ending the call: the host's confirm, the request, and the call being over for everyone. */
type EndStep = 'none' | 'confirm' | 'ending' | 'left-host' | 'ended';

export function CallFrame({ url, fetchFreshUrl, onJoined, onLeft, onFailure, onDeviceError, onKnock, onEndForEveryone, checkEnded, onEnded, enabled = true, className, style }: CallFrameProps) {
  const { labels, classNames } = useVideoUi();
  const containerRef = useRef<HTMLDivElement>(null);
  const [joinUrl, setJoinUrl] = useState(url);
  const [recovery, setRecovery] = useState<RecoveryStatus>('idle');
  const [troubleOpen, setTroubleOpen] = useState(false);
  // Daily's pre-join screen can sit waiting on the BROWSER's camera/microphone prompt, which is
  // outside the page and easy to miss: no Join button shows until it is answered. After a while
  // on that screen, say so (found in the 2026-10-06 browser pass).
  const [prejoinLong, setPrejoinLong] = useState(false);
  const [deviceBannerHidden, setDeviceBannerHidden] = useState(false);
  const [endStep, setEndStep] = useState<EndStep>('none');
  const [endError, setEndError] = useState(false);
  const endedRef = useRef(false);
  const [endedByMe, setEndedByMe] = useState(false);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);
  const autoTried = useRef(false);
  const rejoinRef = useRef<() => void>(() => {});

  // A new URL from the product (a later join) replaces ours.
  const [seenUrl, setSeenUrl] = useState(url);
  if (url !== seenUrl) {
    setSeenUrl(url);
    setJoinUrl(url);
  }

  const repair = useCallback(async (failure: CallFailure) => {
    if (!fetchFreshUrl) return;
    setRecovery('repairing');
    try {
      const next = await fetchFreshUrl(failure.kind);
      setJoinUrl(next);
      setRecovery('repaired');
      onFailure?.(failure, 'repaired');
      rejoinRef.current();
    } catch {
      setRecovery('failed');
      onFailure?.(failure, 'failed');
    }
  }, [fetchFreshUrl, onFailure]);

  const markEnded = useCallback((how: 'by-me' | 'ended' = 'ended') => {
    if (endedRef.current) return;
    endedRef.current = true;
    setEndedByMe(how === 'by-me');
    setEndStep('ended');
    onEndedRef.current?.(how);
  }, []);

  const handleFailure = useCallback(async (failure: CallFailure) => {
    // Over for everyone: nothing to repair and nobody removed this person on purpose.
    if (endedRef.current) return;
    if (checkEnded && (failure.kind === 'ejected' || REPAIRABLE.has(failure.kind))) {
      const over = await checkEnded().catch(() => false);
      if (over) {
        markEnded();
        return;
      }
    }
    if (failure.kind === 'network') {
      setRecovery(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'idle');
      onFailure?.(failure, 'offline');
      return;
    }
    // Once automatically; after that the person decides (a loop would hammer the room).
    if (REPAIRABLE.has(failure.kind) && fetchFreshUrl && !autoTried.current) {
      autoTried.current = true;
      void repair(failure);
      return;
    }
    onFailure?.(failure, 'idle');
  }, [fetchFreshUrl, onFailure, repair, checkEnded, markEnded]);

  const frame = useDailyFrame({
    containerRef,
    url: joinUrl,
    enabled,
    onJoined: () => {
      autoTried.current = false;
      setRecovery('idle');
      onJoined?.();
    },
    onLeft: () => {
      // A host who leaves by the call's own Leave button is asked whether the call is over.
      if (onEndForEveryone && !endedRef.current) setEndStep('left-host');
      onLeft?.();
    },
    onDeviceError: (d) => {
      setDeviceBannerHidden(false);
      onDeviceError?.(d);
    },
    onFailure: (f) => void handleFailure(f),
    onKnock,
  });

  useEffect(() => {
    rejoinRef.current = frame.rejoin;
  }, [frame.rejoin]);

  // 20 seconds on Daily's pre-join screen without joining: likely a browser prompt nobody saw.
  useEffect(() => {
    if (frame.state !== 'ready') return undefined;
    const t = setTimeout(() => setPrejoinLong(true), 20_000);
    return () => clearTimeout(t);
  }, [frame.state]);

  // Back online: rejoin by itself.
  useEffect(() => {
    if (recovery !== 'offline') return undefined;
    const onOnline = () => {
      setRecovery('idle');
      frame.rejoin();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [recovery, frame.rejoin, frame]);

  const endForEveryone = async () => {
    if (!onEndForEveryone) return;
    const from = endStep;
    setEndStep('ending');
    setEndError(false);
    try {
      await onEndForEveryone();
      markEnded('by-me');
    } catch {
      setEndError(true);
      setEndStep(from === 'left-host' ? 'left-host' : 'confirm');
    }
  };

  const failure = frame.failure;
  const ended = endStep === 'ended';
  const showFailure = !ended && frame.state === 'error' && failure !== null;

  return (
    <div className={cx('ve-call', className)} style={style}>
      <KnockBar waiting={frame.waiting} />

      {frame.deviceError && !deviceBannerHidden ? (
        <div className="ve-banner" role="status">
          <span>{labels.problemTitle(frame.deviceError.problem, frame.deviceError.device)}</span>
          <button type="button" className={cx('ve-btn', classNames.button)} onClick={() => setTroubleOpen(true)}>
            {labels.troubleOpen}
          </button>
          <button type="button" className={cx('ve-btn', classNames.button)} onClick={() => setDeviceBannerHidden(true)}>
            {labels.dismiss}
          </button>
        </div>
      ) : null}

      {frame.state === 'ready' && prejoinLong ? (
        <p className="ve-hint ve-hint--warn ve-prejoin-hint" role="status">{labels.prejoinPermissionHint}</p>
      ) : null}

      {!ended && (frame.state === 'joined' || frame.state === 'ready') ? (
        <div className="ve-toolbar">
          <button type="button" className={cx('ve-btn', classNames.button)} onClick={() => setTroubleOpen((o) => !o)} aria-expanded={troubleOpen}>
            {labels.troubleOpen}
          </button>
          {onEndForEveryone && frame.state === 'joined' ? (
            <button type="button" className={cx('ve-btn ve-btn--danger', classNames.button)} onClick={() => { setEndError(false); setEndStep('confirm'); }}>
              {labels.endForEveryone}
            </button>
          ) : null}
        </div>
      ) : null}

      <Troubleshooter
        open={troubleOpen}
        onClose={() => setTroubleOpen(false)}
        diagnosis={frame.deviceError}
        setDevices={frame.setDevices}
        rejoin={() => {
          setTroubleOpen(false);
          frame.rejoin();
        }}
      />

      <div className="ve-stage">
        <div ref={containerRef} className="ve-frame" />

        {frame.state === 'loading' && !ended ? <div className="ve-overlay"><p>{labels.connecting}</p></div> : null}

        {endStep === 'confirm' || endStep === 'ending' || endStep === 'left-host' ? (
          <div className="ve-overlay ve-overlay--end" role="alertdialog" aria-labelledby="ve-end-title">
            <p id="ve-end-title" className="ve-overlay__title">{endStep === 'left-host' ? labels.leftTitle : labels.endConfirmTitle}</p>
            <p className="ve-overlay__detail">{endError ? labels.endFailed : labels.endConfirmDetail}</p>
            <div className="ve-overlay__actions">
              <button
                type="button"
                className={cx('ve-btn ve-btn--danger-solid', classNames.button)}
                disabled={endStep === 'ending'}
                onClick={() => void endForEveryone()}
              >
                {endStep === 'ending' ? labels.ending : labels.endForEveryone}
              </button>
              <button
                type="button"
                className={cx('ve-btn', classNames.button)}
                disabled={endStep === 'ending'}
                onClick={() => {
                  const wasLeft = endStep === 'left-host';
                  setEndStep('none');
                  if (wasLeft) frame.rejoin();
                }}
              >
                {endStep === 'left-host' ? labels.rejoin : labels.endCancel}
              </button>
            </div>
            {endStep === 'left-host' ? <p className="ve-overlay__fine">{labels.leftKeepOpen}</p> : null}
          </div>
        ) : null}

        {ended ? (
          <div className="ve-overlay" role="status">
            <p className="ve-overlay__title">{labels.callEnded}</p>
            <p className="ve-overlay__detail">{endedByMe ? labels.callEndedByYouDetail : labels.callEndedDetail}</p>
          </div>
        ) : null}

        {showFailure ? (
          <div className={cx('ve-overlay ve-overlay--failure', classNames.recovery)} role="alert">
            <p className="ve-overlay__title">{labels.failureTitle(failure.kind)}</p>
            <p className="ve-overlay__detail">
              {recovery === 'repairing' ? labels.repairing
                : recovery === 'repaired' ? labels.repaired
                  : recovery === 'failed' ? labels.repairFailed
                    : recovery === 'offline' ? labels.waitingForNetwork
                      : labels.failureDetail(failure.kind)}
            </p>
            {recovery !== 'repairing' && recovery !== 'offline' && failure.kind !== 'ejected' ? (
              <button
                type="button"
                className={cx('ve-btn ve-btn--primary', classNames.button, classNames.buttonPrimary)}
                onClick={() => (REPAIRABLE.has(failure.kind) && fetchFreshUrl ? void repair(failure) : frame.rejoin())}
              >
                {recovery === 'failed' ? labels.tryAgain : labels.rejoin}
              </button>
            ) : null}
          </div>
        ) : null}


      </div>
    </div>
  );
}
