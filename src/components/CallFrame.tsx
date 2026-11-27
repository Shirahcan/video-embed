import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { REPAIRABLE, RETRYABLE, type CallFailure, type CallFailureKind } from '../callErrors';
import type { MediaDiagnosis } from '../diagnose';
import { useCallPresence, type PresenceAnswer, type PresenceSender } from '../hooks/useCallPresence';
import { presenceDeviceId } from '../presenceDevice';
import { InCallElsewhere } from './InCallElsewhere';
import { useDailyFrame, type CallParticipant, type WaitingPerson } from '../hooks/useDailyFrame';
import { useSingleTabCall } from '../hooks/useSingleTabCall';
import { forgetInCall, rememberInCall } from '../callMemory';
import { chooseCallScreen, preferStandardScreen, type CallScreen } from '../callScreen';
import { DrawnStage, DrawnStageBoundary } from './DrawnStage';
import { cx, useVideoUi } from '../theme';
import { BackupCallOffer, type BackupCall } from './BackupCallOffer';
import { KnockBar } from './KnockBar';
import { CallTimer } from './CallTimer';
import { ScheduledEndCue } from './ScheduledEndCue';
import { Troubleshooter } from './Troubleshooter';

/** Tries to join again after Daily's connection broke, and the wait before the second. */
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

export type RecoveryStatus = 'idle' | 'repairing' | 'repaired' | 'failed' | 'offline' | 'reconnecting';

/** Why the person is out of the call: they left, or a host removed them. */
export type LeftCallHow = 'left' | 'removed';

export interface CallFrameProps {
  /** The tokened join URL the product's backend handed out. */
  url: string;
  /** A guest's own name, for a URL with no pass: the host sees it when they knock. */
  userName?: string | null;
  /**
   * The name a signed-in person knocks under when the product hands them NO pass (a host removed
   * them, F1b): only the knock uses it, so the host sees who is asking. Never a join name.
   */
  knockName?: string | null;
  /**
   * Ask the product for a FRESH join after a failure. The product's backend repairs the room
   * (same name, so every link still works), mints a new token and returns the new URL.
   * Without it, a failure can only be rejoined as-is.
   */
  fetchFreshUrl?: (why: CallFailureKind) => Promise<string>;
  onJoined?: () => void;
  onLeft?: () => void;
  /**
   * The person chose to leave on the drawn screen (L2): its Leave, or 'Leave' when alone. Never
   * for a call that ended, moved to another device or swapped screens. A product takes them to
   * the meeting's page; without one the kit shows 'You left the call' with Rejoin. `removed`: a host
   * took them out (F1), so the product says that instead, with no way straight back in.
   */
  onLeftCall?: (how: LeftCallHow) => void;
  /**
   * A host removed someone on the drawn screen (F1b). The product records it so that person is never
   * handed a pass again and can only ask to join; `userId` is null for someone let in from the lobby.
   */
  onRemovePerson?: (person: { userId: string | null; name: string }) => void;
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
  /**
   * Presence (join / heartbeat each minute / leave), sent by the frame itself. The product passes
   * one function that posts to its video-client kit presence route; the backend relays it to
   * video-service, whose call verdict reads it. Absent = no presence is sent. A named guest
   * (`userName`, a URL with no pass) never sends it: they are nobody the product knows, and
   * their presence must not read as an invited person attending.
   */
  presence?: PresenceSender;
  /**
   * Call continuity (default off): presence carries a device id, so a person already in this call on
   * another device is asked before joining ("Switch here" or "Join here too", muted), and a device the
   * call was moved away from leaves it, saying so. Needs `presence`; never for a named guest.
   */
  continuity?: boolean;
  /**
   * One call per machine (default on): a second tab on the same call stands down and offers to
   * take it over, so two live microphones never echo in one room.
   */
  singleTab?: boolean;
  /**
   * Remember in this tab that the person is in this call, under the product's own key (e.g.
   * `meeting:42`), so after a reload the product can take them straight back (`wasInCallRecently`).
   * Forgotten when they leave or the frame goes away in the app. Absent = nothing is remembered.
   */
  rememberAs?: string | null;
  /** Ask "Leave the call?" (the browser's own prompt) before the tab closes or reloads mid-call. */
  confirmLeave?: boolean;
  /**
   * The product allows the DRAWN call screen (its own gate). The device still decides
   * (`chooseCallScreen`): desktop browsers with a floating window get it, everything else keeps
   * Daily Prebuilt. A failure before joining, a lobby, or a crash while drawing falls back to
   * Prebuilt once. Default off: Prebuilt, exactly as before.
   */
  drawn?: boolean;
  /**
   * Draw the call small (the corner window, P3b): given only while minimised. Ignored on the
   * standard screen, which has its own layout.
   */
  compact?: { onBack: () => void; onFloated?: (floated: boolean) => void } | null;
  /** Which screen this device is on, as it changes (a host hides its own bar when the drawn one has controls). */
  onScreenChange?: (screen: CallScreen) => void;
  /**
   * The last rescue: when the room cannot be fixed, offer a matching meeting on the product's
   * backup account. With `url` set (someone already switched), everyone on the call is told.
   * Absent = no backup is offered.
   */
  backup?: BackupCall;
  /**
   * When the meeting was BOOKED to end (ISO 8601), not when the room closes. While someone is in
   * the call: a countdown over the last minutes, then "You are at the end of the scheduled meeting
   * time". Absent = no cue.
   */
  scheduledEnd?: string | null;
  /** What the viewer can do at the booked end (a host keeping the room open longer), when allowed. */
  endCueAction?: { label: string; onSelect: () => void };
  /**
   * When the call started (its first join, ISO 8601), for the running call clock shown while this
   * person is in it. Absent = counted from their own join.
   */
  startedAt?: string | null;
  /** Who is in the call (not the invited roster), on every join, leave and mute change. */
  onParticipantsChange?: (people: CallParticipant[]) => void;
  /** Receives the call's own microphone switch once the frame exists (the call dock's mute button). */
  micRef?: { current: ((on: boolean) => void) | null };
  /**
   * The product's own notices drawn INSIDE the call's stage, so they stay visible when the call
   * is fullscreen (a room-closing countdown outside the stage is seen by nobody then).
   */
  overlay?: ReactNode;
  /**
   * Minutes alone in the call (nobody else in it) before the viewer is asked whether to keep
   * waiting or leave (owner 2026-10-15). Keep waiting asks again after as long again. 0 = never.
   */
  aloneAfterMinutes?: number;
  /** Hide the frame. */
  enabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** The call: Daily Prebuilt plus typed failures, automatic repair, the knock bar and help. */
/**
 * Is the browser still asking for the camera or microphone? Where the Permissions API cannot
 * say (older Safari, Firefox for the camera), assume it may be: the hint is the only way a
 * person learns about a prompt they cannot see.
 */
async function stillAsking(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return true;
  try {
    const states = await Promise.all(
      (['camera', 'microphone'] as const).map((name) =>
        navigator.permissions.query({ name: name as PermissionName }).then((s) => s.state, () => 'prompt' as PermissionState),
      ),
    );
    return states.some((s) => s === 'prompt');
  } catch {
    return true;
  }
}

/** Ending the call: the host's confirm, the request, and the call being over for everyone. */
type EndStep = 'none' | 'confirm' | 'ending' | 'left-host' | 'ended';

export function CallFrame({ url, userName = null, knockName = null, fetchFreshUrl, onJoined, onLeft, onLeftCall, onRemovePerson, onFailure, onDeviceError, onKnock, onEndForEveryone, checkEnded, onEnded, presence, backup, scheduledEnd = null, endCueAction, startedAt = null, onParticipantsChange, micRef, overlay, aloneAfterMinutes = 15, singleTab = true, rememberAs = null, confirmLeave = false, drawn = false, compact = null, onScreenChange, continuity = false, enabled = true, className, style }: CallFrameProps) {
  // Call continuity: one id per browser, and what to do about the person's other device.
  const [deviceId] = useState<string | null>(() => (continuity && presence && !userName && typeof window !== 'undefined' ? presenceDeviceId() : null));
  // 'checking' until the service answers; 'other' when they are in on another device and have not chosen.
  const [continuityStep, setContinuityStep] = useState<'checking' | 'other' | 'clear' | 'moved'>(deviceId ? 'checking' : 'clear');
  const [elsewhereSince, setElsewhereSince] = useState<string | null>(null);
  const [joinQuiet, setJoinQuiet] = useState(false);
  const takeOverRef = useRef(false);
  const leaveRef = useRef<() => void>(() => {});
  // Leaving because the call moved to another device is not "you left": no host prompt follows it.
  const movedRef = useRef(false);
  // Only someone who was IN the call can leave it. A join that failed (the room not open yet, a bad pass)
  // also fires Daily's left-meeting, and asking that host "Is it over? End for everyone" hid the real reason
  // and offered to end a call that had not started (local check 2026-11-25).
  const inCallRef = useRef(false);
  const onPresenceAnswer = useCallback((answer: PresenceAnswer, kind: string) => {
    if (answer.superseded && kind === 'heartbeat') {
      movedRef.current = true;
      setContinuityStep('moved');
      leaveRef.current();
    }
  }, []);
  const { joinedNow, leftNow } = useCallPresence(userName ? undefined : presence, 60_000, deviceId, onPresenceAnswer);
  useEffect(() => {
    if (!deviceId || !presence) return undefined;
    let live = true;
    presence('check', { deviceId })
      .then((answer) => {
        if (!live) return;
        if (answer && answer.elsewhere) {
          setElsewhereSince(answer.elsewhere.since);
          setContinuityStep('other');
        } else {
          setContinuityStep('clear');
        }
      })
      // A failed check never blocks the call.
      .catch(() => live && setContinuityStep('clear'));
    return () => {
      live = false;
    };
    // Asked once per page: a later answer arrives on the beats.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);
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
  // The host pressed End and the request is in flight. The service ejects everyone BEFORE the
  // request answers, so the host's own leave/eject events arrive first: they are the end
  // landing, never "you left" or "you were removed" (found 2026-10-07 on the emailed link).
  const endingRef = useRef(false);
  const [endedByMe, setEndedByMe] = useState(false);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);
  const autoTried = useRef(false);
  // Joining again by itself after a transport failure (RETRYABLE, or an unknown one once): how many
  // tries so far, and the failure they answer (reported as repaired once a try gets the person in).
  const retriesRef = useRef(0);
  const retryingRef = useRef<CallFailure | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);
  // This person's FIRST join in this frame: kept through leaves, rejoins and repairs, so the
  // running call clock never resets when people come and go.
  const [firstJoinedAt, setFirstJoinedAt] = useState<number | null>(null);
  const rejoinRef = useRef<() => void>(() => {});
  // Waiting alone: when the viewer became the only one in the call, and whether they are being asked.
  const [aloneSince, setAloneSince] = useState<number | null>(null);
  const [aloneAsk, setAloneAsk] = useState(false);
  // Leaving from the waiting prompt is not "is the call over?": nobody else is in it.
  const leavingAloneRef = useRef(false);
  // L1: the person already chose on the drawn screen's Leave, so no after-the-fact 'Is it over?'.
  const leaveChosenRef = useRef(false);
  const onLeftCallRef = useRef(onLeftCall);
  useEffect(() => {
    onLeftCallRef.current = onLeftCall;
  }, [onLeftCall]);

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
    if (endedRef.current || endingRef.current) return;
    if (checkEnded && (failure.kind === 'ejected' || REPAIRABLE.has(failure.kind))) {
      const over = await checkEnded().catch(() => false);
      if (over) {
        markEnded();
        return;
      }
    }
    // A host removed this person (F1): the product takes them where it says so, when it can.
    if (failure.kind === 'ejected' && onLeftCallRef.current) {
      onFailure?.(failure, 'idle');
      onLeftCallRef.current('removed');
      return;
    }
    // Daily's own connection broke (or a cause nobody named): join again as we are, at once and then
    // after a few seconds, before asking anyone. Offline waits for the network instead.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const limit = RETRYABLE.has(failure.kind) ? MAX_RETRIES : failure.kind === 'unknown' ? 1 : 0;
    if (!offline && retriesRef.current < limit) {
      const delay = retriesRef.current === 0 ? 0 : RETRY_DELAY_MS;
      retriesRef.current += 1;
      retryingRef.current = failure;
      setRecovery('reconnecting');
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => rejoinRef.current(), delay);
      return;
    }
    if (retryingRef.current) {
      // The tries ran out: a real failure, reported once with what Daily said.
      retryingRef.current = null;
      setRecovery('failed');
      onFailure?.(failure, 'failed');
      return;
    }
    if (failure.kind === 'network') {
      setRecovery(offline ? 'offline' : 'idle');
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

  // The call beyond the page: the tab remembers it as it goes away (a reload reads it fresh), asks
  // before closing mid-call when the product wants that, and forgets it when the frame leaves the app.
  useEffect(() => {
    if (typeof window === 'undefined' || (!rememberAs && !confirmLeave)) return undefined;
    const onPageHide = () => {
      if (rememberAs && inCallRef.current) rememberInCall(rememberAs);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!confirmLeave || !inCallRef.current) return;
      e.preventDefault();
      // Older browsers need a returnValue to show their prompt (the text itself is ignored).
      e.returnValue = '';
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [rememberAs, confirmLeave]);
  useEffect(() => () => {
    // An unmount inside the app (not a reload: React's cleanup never runs then) is leaving the call.
    if (rememberAs) forgetInCall(rememberAs);
  }, [rememberAs]);

  // Which screen draws the call. Decided once per frame by the device; a fallback only ever goes to Prebuilt.
  const [screen, setScreen] = useState<CallScreen>(() => chooseCallScreen(drawn));
  const onScreenRef = useRef(onScreenChange);
  useEffect(() => {
    onScreenRef.current = onScreenChange;
  }, [onScreenChange]);
  useEffect(() => {
    onScreenRef.current?.(screen);
  }, [screen]);
  // Switching screens tears the call down: its leave is not "you left" (no host prompt, no product onLeft).
  const switchingRef = useRef(false);
  const fallBackToPrebuilt = useCallback(() => {
    switchingRef.current = true;
    setScreen('prebuilt');
  }, []);

  // The room's address without its pass: the same in every tab on this call.
  const tab = useSingleTabCall(singleTab ? (joinUrl.split('?')[0] ?? null) : null);

  const frame = useDailyFrame({
    containerRef,
    url: joinUrl,
    userName,
    knockName,
    enabled: enabled && !tab.heldElsewhere && continuityStep === 'clear',
    startQuiet: joinQuiet,
    mode: screen,
    // The drawn screen knocks itself (P2d); only a knock it cannot make falls back to Prebuilt's.
    onLobby: fallBackToPrebuilt,
    onJoined: () => {
      switchingRef.current = false;
      joinedNow(takeOverRef.current);
      takeOverRef.current = false;
      inCallRef.current = true;
      if (rememberAs) rememberInCall(rememberAs);
      setFirstJoinedAt((t) => t ?? Date.now());
      autoTried.current = false;
      retriesRef.current = 0;
      if (retryingRef.current) {
        onFailure?.(retryingRef.current, 'repaired');
        retryingRef.current = null;
      }
      setRecovery('idle');
      onJoined?.();
    },
    onLeft: () => {
      if (switchingRef.current) {
        // The drawn call being swapped for Prebuilt: not a leave anybody should hear about.
        leftNow();
        inCallRef.current = false;
        return;
      }
      leftNow();
      // A host who leaves by the call's own Leave button is asked whether the call is over.
      const wasInCall = inCallRef.current;
      inCallRef.current = false;
      if (rememberAs) forgetInCall(rememberAs);
      if (onEndForEveryone && wasInCall && !endedRef.current && !endingRef.current && !leavingAloneRef.current && !leaveChosenRef.current && !movedRef.current) setEndStep('left-host');
      const chose = leaveChosenRef.current || leavingAloneRef.current;
      leavingAloneRef.current = false;
      leaveChosenRef.current = false;
      const settled = endedRef.current || endingRef.current || movedRef.current;
      if (chose && !settled) onLeftCallRef.current?.('left');
      // The standard screen's own Leave, for a guest: a host ending the call for everyone ALSO takes
      // them out of it, so ask whether the call is over first; over reads as ended, not as "you left".
      // (A host is asked 'Is it over?' instead, and picks Leave the call there, below.)
      else if (!chose && !settled && screen === 'prebuilt' && wasInCall && !onEndForEveryone && onLeftCallRef.current) {
        void (checkEnded ? checkEnded().catch(() => false) : Promise.resolve(false)).then((over) => {
          if (over) markEnded('ended');
          else if (!endedRef.current) onLeftCallRef.current?.('left');
        });
      }
      onLeft?.();
    },
    onDeviceError: (d) => {
      setDeviceBannerHidden(false);
      onDeviceError?.(d);
    },
    onFailure: (f) => {
      // The drawn screen failing before the person got in is handled like any failure (retry, repair,
      // wait for the network, or say why). Only a cause nobody could name, after its retry, hands the
      // call to the standard screen, and that switch is recorded with what Daily said.
      if (screen === 'drawn' && !inCallRef.current && f.kind === 'unknown' && retriesRef.current >= 1) {
        retryingRef.current = null;
        retriesRef.current = 0;
        onFailure?.(f, 'idle');
        fallBackToPrebuilt();
        return;
      }
      void handleFailure(f);
    },
    onKnock,
    onParticipantsChange,
  });
  // The dock's mute button drives the same microphone the call's own bar does.
  useEffect(() => {
    if (!micRef) return;
    micRef.current = frame.setMic;
    return () => {
      micRef.current = null;
    };
  }, [micRef, frame.setMic]);

  useEffect(() => {
    rejoinRef.current = frame.rejoin;
    leaveRef.current = frame.leave;
  }, [frame.rejoin, frame.leave]);

  // Alone = joined with nobody else in the call. The clock restarts whenever someone else is there.
  const alone = frame.state === 'joined' && frame.participantCount <= 1;
  const [seenAlone, setSeenAlone] = useState(alone);
  if (alone !== seenAlone) {
    setSeenAlone(alone);
    setAloneSince(alone ? Date.now() : null);
    if (!alone) setAloneAsk(false);
  }
  useEffect(() => {
    if (aloneSince === null || aloneAsk || aloneAfterMinutes <= 0) return undefined;
    const wait = Math.max(0, aloneSince + aloneAfterMinutes * 60_000 - Date.now());
    const t = setTimeout(() => setAloneAsk(true), wait);
    return () => clearTimeout(t);
  }, [aloneSince, aloneAsk, aloneAfterMinutes]);

  // 20 seconds on Daily's pre-join screen without joining: likely a browser prompt nobody saw.
  // Only when the browser IS still asking: with access already granted, Daily's Join button is
  // on screen and the hint "No Join button?" would be wrong (found in the 2026-10-06 pass).
  useEffect(() => {
    if (frame.state !== 'ready') return undefined;
    let cancelled = false;
    const t = setTimeout(() => {
      void stillAsking().then((asking) => {
        if (!cancelled && asking) setPrejoinLong(true);
      });
    }, 20_000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
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
    endingRef.current = true;
    setEndStep('ending');
    setEndError(false);
    try {
      await onEndForEveryone();
      markEnded('by-me');
    } catch {
      setEndError(true);
      setEndStep(from === 'left-host' ? 'left-host' : 'confirm');
    } finally {
      endingRef.current = false;
    }
  };

  const failure = frame.failure;
  const ended = endStep === 'ended';
  const showFailure = !ended && endStep !== 'ending' && frame.state === 'error' && failure !== null;

  return (
    <div className={cx('ve-call', className)} style={style}>
      <KnockBar
        waiting={frame.waiting}
        // On the drawn screen there is no Daily request to click: the host lets people in from here.
        onAnswer={screen === 'drawn' && frame.call ? (id, letIn) => void frame.call?.updateWaitingParticipant(id, { grantRequestedAccess: letIn }).catch(() => {}) : undefined}
      />

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

      {backup?.url && !ended ? <BackupCallOffer variant="notice" switchTo={backup.switchTo} url={backup.url} /> : null}

      {scheduledEnd && !ended && frame.state === 'joined' ? <ScheduledEndCue scheduledEnd={scheduledEnd} action={endCueAction} /> : null}

      {frame.state === 'ready' && prejoinLong && frame.access !== 'asking' && frame.access !== 'denied' ? (
        <p className="ve-hint ve-hint--warn ve-prejoin-hint" role="status">{screen === 'drawn' ? labels.drawnPermissionHint : labels.prejoinPermissionHint}</p>
      ) : null}

      {!ended && (frame.state === 'joined' || frame.state === 'ready') ? (
        <div className="ve-toolbar">
          {frame.state === 'joined' ? <CallTimer startedAt={startedAt} joinedAt={firstJoinedAt} /> : null}
          <span className="ve-toolbar__spacer" />
          <button type="button" className={cx('ve-btn', classNames.button)} onClick={() => setTroubleOpen((o) => !o)} aria-expanded={troubleOpen}>
            {labels.troubleOpen}
          </button>
          {/* The drawn screen asks on its own Leave (L1); this button is the standard screen's. */}
          {onEndForEveryone && frame.state === 'joined' && screen !== 'drawn' ? (
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

        {/* Only while the person is getting in or in the call: after leaving, a frozen call with live-looking buttons would mislead. */}
        {screen === 'drawn' && frame.call && !ended && frame.state !== 'left' && frame.state !== 'error' ? (
          <DrawnStageBoundary onCrash={fallBackToPrebuilt}>
            <DrawnStage
              call={frame.call}
              access={frame.access}
              compact={compact ? { onBack: compact.onBack, onFloated: compact.onFloated, clock: frame.state === 'joined' ? <CallTimer startedAt={startedAt} joinedAt={firstJoinedAt} /> : null } : null}
              onLeave={() => {
                leaveChosenRef.current = true;
                frame.leave();
              }}
              onEndForEveryone={onEndForEveryone ? () => void endForEveryone() : undefined}
              setDevices={frame.setDevices}
              waiting={frame.waiting}
              onRemovePerson={onRemovePerson}
              onAnswer={(id, letIn) => void frame.call?.updateWaitingParticipant(id, { grantRequestedAccess: letIn }).catch(() => {})}
              onUseStandard={() => {
                preferStandardScreen();
                fallBackToPrebuilt();
              }}
            />
          </DrawnStageBoundary>
        ) : null}

        {overlay && !ended && frame.state === 'joined' ? <div className="ve-stage-overlay">{overlay}</div> : null}

        {tab.heldElsewhere ? (
          <div className="ve-overlay" role="status">
            <p className="ve-overlay__title">{labels.heldElsewhereTitle}</p>
            <p className="ve-overlay__detail">{labels.heldElsewhereDetail}</p>
            <div className="ve-overlay__actions">
              <button type="button" className={cx('ve-btn ve-btn--primary', classNames.button, classNames.buttonPrimary)} onClick={tab.takeOver}>
                {labels.moveCallHere}
              </button>
            </div>
          </div>
        ) : null}

        {continuityStep === 'other' || continuityStep === 'moved' ? (
          <InCallElsewhere
            moved={continuityStep === 'moved'}
            since={elsewhereSince}
            onSwitchHere={() => {
              takeOverRef.current = true;
              movedRef.current = false;
              setJoinQuiet(false);
              const wasMoved = continuityStep === 'moved';
              setContinuityStep('clear');
              if (wasMoved) rejoinRef.current();
            }}
            onJoinHereToo={() => {
              setJoinQuiet(true);
              setContinuityStep('clear');
            }}
          />
        ) : null}

        {frame.state === 'loading' && !ended && !tab.heldElsewhere && continuityStep === 'clear' ? <div className="ve-overlay"><p>{labels.connecting}</p></div> : null}

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
            {endStep === 'left-host' && onLeftCall ? (
              <button
                type="button"
                className={cx('ve-btn ve-btn--quiet', classNames.button)}
                onClick={() => {
                  setEndStep('none');
                  onLeftCallRef.current?.('left');
                }}
              >
                {labels.drawnLeaveOnly}
              </button>
            ) : null}
            {endStep === 'left-host' ? <p className="ve-overlay__fine">{labels.leftKeepOpen}</p> : null}
          </div>
        ) : null}

        {aloneAsk && alone && !ended && endStep === 'none' ? (
          <div className="ve-overlay ve-overlay--alone" role="alertdialog" aria-labelledby="ve-alone-title">
            <p id="ve-alone-title" className="ve-overlay__title">{labels.aloneTitle(aloneAfterMinutes)}</p>
            <p className="ve-overlay__detail">{labels.aloneDetail}</p>
            <div className="ve-overlay__actions">
              <button
                type="button"
                className={cx('ve-btn ve-btn--primary', classNames.button, classNames.buttonPrimary)}
                onClick={() => {
                  setAloneAsk(false);
                  setAloneSince(Date.now());
                }}
              >
                {labels.aloneKeepWaiting}
              </button>
              <button
                type="button"
                className={cx('ve-btn', classNames.button)}
                onClick={() => {
                  setAloneAsk(false);
                  leavingAloneRef.current = true;
                  frame.leave();
                }}
              >
                {labels.aloneLeave}
              </button>
            </div>
          </div>
        ) : null}

        {screen === 'drawn' && frame.state === 'left' && !ended && endStep === 'none' ? (
          <div className="ve-overlay" role="status">
            <p className="ve-overlay__title">{labels.drawnYouLeft}</p>
            <p className="ve-overlay__detail">{labels.drawnYouLeftDetail}</p>
            <div className="ve-overlay__actions">
              <button type="button" className={cx('ve-btn ve-btn--primary', classNames.button, classNames.buttonPrimary)} onClick={() => frame.rejoin()}>
                {labels.rejoin}
              </button>
            </div>
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
                : recovery === 'reconnecting' ? labels.reconnecting
                : recovery === 'repaired' ? labels.repaired
                  : recovery === 'failed' && !REPAIRABLE.has(failure.kind) ? labels.failureDetail(failure.kind)
                  : recovery === 'failed' ? labels.repairFailed
                    : recovery === 'offline' ? labels.waitingForNetwork
                      : labels.failureDetail(failure.kind)}
            </p>
            {recovery !== 'repairing' && recovery !== 'reconnecting' && recovery !== 'offline' && failure.kind !== 'ejected' ? (
              <button
                type="button"
                className={cx('ve-btn ve-btn--primary', classNames.button, classNames.buttonPrimary)}
                onClick={() => (REPAIRABLE.has(failure.kind) && fetchFreshUrl ? void repair(failure) : frame.rejoin())}
              >
                {recovery === 'failed' ? labels.tryAgain : labels.rejoin}
              </button>
            ) : null}
            {backup && (recovery === 'failed' || failure.kind === 'unsupported-browser') ? (
              <BackupCallOffer switchTo={backup.switchTo} url={backup.url} />
            ) : null}
          </div>
        ) : null}


      </div>
    </div>
  );
}
