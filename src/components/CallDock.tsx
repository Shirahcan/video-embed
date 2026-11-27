import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CallFailure, CallFailureKind } from '../callErrors';
import type { MediaDiagnosis } from '../diagnose';
import type { PresenceKind, PresenceOptions, PresenceSender } from '../hooks/useCallPresence';
import type { CallParticipant, WaitingPerson } from '../hooks/useDailyFrame';
import { cx, useVideoUi } from '../theme';
import { CallFrame, type LeftCallHow, type RecoveryStatus } from './CallFrame';
import type { CallPanel } from './DrawnProductPanel';

/**
 * The call follows the person around the product.
 *
 * A call mounted inside its page dies the moment someone navigates: the frame unmounts and they
 * drop out of the meeting. So the dock mounts the CallFrame ONCE, near the root, in a single
 * fixed box that never changes parent (moving an iframe between parents reloads it, which to
 * Daily is a fresh join). Only the box's geometry changes: laid exactly over the page's
 * placeholder (`useCallDock().setAnchor`) while the call's page is open, a corner mini-player
 * once the person has joined and wandered off.
 */

/** What the dock needs to know about a call. Plain data: compared, never re-created. */
export interface DockedCall {
  /** The call's identity. The same key is the same call, so it is never remounted. */
  key: string;
  /** The tokened join URL. For the same key the FIRST one is kept: a re-minted pass must not rebuild a live call. */
  url: string;
  /** Where "Back to call" goes from the mini-player. */
  returnHref: string;
  userName?: string | null;
  /** CallFrame `knockName`. */
  knockName?: string | null;
  /** The viewer may end the call for everyone (pair with `handlers.onEndForEveryone`). */
  host?: boolean;
  scheduledEnd?: string | null;
  /** When the call started (its first join), for the running call clock. */
  startedAt?: string | null;
  /** The viewer's action at the booked end (pair with `handlers.onEndCue`). */
  endCueLabel?: string | null;
  /** A backup meeting exists or may be made (pair with `handlers.switchToBackup`). */
  backup?: { url?: string | null } | null;
  /** Call continuity: the person already in this call on another device is asked first (CallFrame `continuity`). */
  continuity?: boolean;
  /** Remember the call in this tab under this key (CallFrame `rememberAs`), for a rejoin after a reload. */
  rememberAs?: string | null;
  /** Ask "Leave the call?" before the tab closes or reloads mid-call (CallFrame `confirmLeave`). */
  confirmLeave?: boolean;
  /** The product allows the drawn call screen (CallFrame `drawn`); the device still decides. */
  drawn?: boolean;
}

/** The call's behaviour, from the page that owns it. Kept in a ref: changing them never touches the frame. */
export interface DockedCallHandlers {
  fetchFreshUrl?: (why: CallFailureKind) => Promise<string>;
  checkEnded?: () => Promise<boolean>;
  onEndForEveryone?: () => Promise<void>;
  onEnded?: (how: 'by-me' | 'ended') => void;
  presence?: PresenceSender;
  onJoined?: () => void;
  onLeft?: () => void;
  /** The person chose to leave (CallFrame `onLeftCall`). */
  onLeftCall?: (how: LeftCallHow) => void;
  /** A host removed someone (CallFrame `onRemovePerson`). */
  onRemovePerson?: (person: { userId: string | null; name: string }) => void;
  /** The page's own call panels (CallFrame `panels`). */
  panels?: CallPanel[];
  /** CallFrame `onDrawnShowing`. */
  onDrawnShowing?: (showing: boolean) => void;
  onFailure?: (failure: CallFailure, recovery: RecoveryStatus) => void;
  onDeviceError?: (diagnosis: MediaDiagnosis) => void;
  onKnock?: (person: WaitingPerson) => void;
  onParticipantsChange?: (people: CallParticipant[]) => void;
  onEndCue?: () => void;
  switchToBackup?: () => Promise<string>;
}

export interface CallDockValue {
  activeKey: string | null;
  /** The call is parked in the corner rather than sitting on its page. */
  isMinimized: boolean;
  /** Register (or refresh) the call. Safe to call on every render. */
  start: (call: DockedCall, handlers?: DockedCallHandlers) => void;
  /**
   * A page coming BACK to a call the dock still holds (it lays the call over its placeholder rather
   * than starting it) hands over what is its own: its panels and callbacks, merged over the ones the
   * page that started the call gave. Ignored for any other call.
   */
  adopt: (key: string, handlers: Partial<DockedCallHandlers>) => void;
  stop: () => void;
  /** The page's placeholder the call lays itself over; null when the page goes away. */
  setAnchor: (el: HTMLElement | null) => void;
  /** Notices drawn inside the call's stage (they survive fullscreen). */
  setOverlay: (node: ReactNode) => void;
}

const CallDockContext = createContext<CallDockValue | null>(null);

export function useCallDock(): CallDockValue {
  const ctx = useContext(CallDockContext);
  if (!ctx) throw new Error('useCallDock must be used inside CallDockProvider.');
  return ctx;
}

// Measure before paint in the browser, without React's server warning (the provider is at the root).
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// 180 for the call plus 44 for the bar below it.
const MINI = { width: 320, height: 224, margin: 20 };

type Box = { top: number; left: number; width: number; height: number };

function sameCall(a: DockedCall, b: DockedCall): boolean {
  return (
    a.key === b.key &&
    a.url === b.url &&
    a.returnHref === b.returnHref &&
    (a.userName ?? null) === (b.userName ?? null) &&
    (a.knockName ?? null) === (b.knockName ?? null) &&
    Boolean(a.host) === Boolean(b.host) &&
    (a.scheduledEnd ?? null) === (b.scheduledEnd ?? null) &&
    (a.startedAt ?? null) === (b.startedAt ?? null) &&
    (a.endCueLabel ?? null) === (b.endCueLabel ?? null) &&
    Boolean(a.backup) === Boolean(b.backup) &&
    (a.backup?.url ?? null) === (b.backup?.url ?? null) &&
    Boolean(a.continuity) === Boolean(b.continuity) &&
    (a.rememberAs ?? null) === (b.rememberAs ?? null) &&
    Boolean(a.confirmLeave) === Boolean(b.confirmLeave) &&
    Boolean(a.drawn) === Boolean(b.drawn)
  );
}

export interface CallDockProviderProps {
  children: ReactNode;
  /** In-app navigation for "Back to call" (the product's router). */
  navigate: (href: string) => void;
  /** Extra class on the call's box. */
  className?: string;
}

export function CallDockProvider({ children, navigate, className }: CallDockProviderProps) {
  const { labels } = useVideoUi();
  const [call, setCall] = useState<DockedCall | null>(null);
  const [anchor, setAnchorState] = useState<HTMLElement | null>(null);
  const [overlay, setOverlayState] = useState<ReactNode>(null);
  const [box, setBox] = useState<Box | null>(null);
  // Only a call somebody actually joined follows them: a page that registered its call and was
  // then read and left (too early, already over, never clicked Join) has nothing to keep alive.
  const [hasJoined, setHasJoined] = useState(false);
  const handlersRef = useRef<DockedCallHandlers>({});
  // The page's panels are STATE, not read through the ref: their content changes as the page does (a
  // note being typed), and the dock must redraw the open panel with it.
  const [panels, setPanels] = useState<CallPanel[] | undefined>(undefined);
  // The key of a call forgotten unjoined. Its page may still be mounted and re-register it on every
  // render; it stays forgotten until a placeholder appears again (the page wants the call back).
  const forgottenRef = useRef<string | null>(null);
  const callKeyRef = useRef<string | null>(null);
  // Whether the drawn screen is up, replayed to a page that registers later (it came back mid-call).
  const showingRef = useRef<boolean | null>(null);
  const toldRef = useRef<((showing: boolean) => void) | null>(null);
  const tell = useCallback((fn: ((showing: boolean) => void) | undefined) => {
    if (!fn || fn === toldRef.current || showingRef.current === null) return;
    toldRef.current = fn;
    fn(showingRef.current);
  }, []);

  const start = useCallback((next: DockedCall, handlers?: DockedCallHandlers) => {
    if (forgottenRef.current === next.key) return;
    handlersRef.current = handlers ?? {};
    callKeyRef.current = next.key;
    setPanels(handlers?.panels);
    tell(handlers?.onDrawnShowing);
    setCall((prev) => {
      if (prev && prev.key === next.key) {
        const merged = { ...next, url: prev.url };
        return sameCall(prev, merged) ? prev : merged;
      }
      return next;
    });
  }, [tell]);

  const adopt = useCallback((key: string, handlers: Partial<DockedCallHandlers>) => {
    if (callKeyRef.current !== key) return;
    handlersRef.current = { ...handlersRef.current, ...handlers };
    if ('panels' in handlers) setPanels(handlers.panels);
    tell(handlers.onDrawnShowing);
  }, [tell]);

  const stop = useCallback(() => {
    handlersRef.current = {};
    callKeyRef.current = null;
    showingRef.current = null;
    toldRef.current = null;
    setPanels(undefined);
    setCall(null);
    setAnchorState(null);
    setOverlayState(null);
    setBox(null);
    setHasJoined(false);
  }, []);

  const setAnchor = useCallback((el: HTMLElement | null) => {
    if (el) forgottenRef.current = null;
    // The page went away: its panels drew from it, so they go too (a returning page adopts its own).
    else setPanels(undefined);
    setAnchorState(el);
  }, []);
  const setOverlay = useCallback((node: ReactNode) => setOverlayState(node), []);

  // Follow the placeholder: scroll in any ancestor, resize, its own size, and a 100ms read for a
  // placeholder that MOVES without resizing (a banner appearing above it painted the call over
  // the banner in MployNow's 2026-08-04 pass).
  useIsomorphicLayoutEffect(() => {
    if (!anchor) {
      setBox(null);
      return undefined;
    }
    let frame = 0;
    const apply = () => {
      const r = anchor.getBoundingClientRect();
      setBox((prev) =>
        prev &&
        Math.abs(prev.top - r.top) < 0.5 &&
        Math.abs(prev.left - r.left) < 0.5 &&
        Math.abs(prev.width - r.width) < 0.5 &&
        Math.abs(prev.height - r.height) < 0.5
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
    };
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(anchor);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    const poll = window.setInterval(apply, 100);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(poll);
      observer?.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [anchor]);

  // A call nobody joined is forgotten when its page goes away: coming back means Join again (and
  // the page's device check), never a frame that starts by itself.
  useEffect(() => {
    if (call !== null && anchor === null && !hasJoined) {
      forgottenRef.current = call.key;
      handlersRef.current = {};
      callKeyRef.current = null;
      setCall(null);
      setOverlayState(null);
    }
  }, [call, anchor, hasJoined]);

  const isMinimized = call !== null && (anchor === null || box === null);

  const value = useMemo<CallDockValue>(
    () => ({ activeKey: call?.key ?? null, isMinimized, start, adopt, stop, setAnchor, setOverlay }),
    [call?.key, isMinimized, start, adopt, stop, setAnchor, setOverlay],
  );

  // Stable identities for the frame, reading through the ref: the page can swap its handlers, or
  // go away entirely, without the frame seeing a new prop.
  const h = handlersRef;
  const fetchFreshUrl = useCallback((why: CallFailureKind) => {
    const fn = h.current.fetchFreshUrl;
    return fn ? fn(why) : Promise.reject(new Error('No repair offered.'));
  }, [h]);
  const checkEnded = useCallback(() => h.current.checkEnded?.() ?? Promise.resolve(false), [h]);
  const onEndForEveryone = useCallback(() => h.current.onEndForEveryone?.() ?? Promise.resolve(), [h]);
  const onEnded = useCallback((how: 'by-me' | 'ended') => h.current.onEnded?.(how), [h]);
  const onDrawnShowing = useCallback((showing: boolean) => {
    showingRef.current = showing;
    toldRef.current = h.current.onDrawnShowing ?? null;
    h.current.onDrawnShowing?.(showing);
  }, [h]);
  // The device options and the service's answer pass straight through (call continuity).
  const presence = useCallback(
    (kind: PresenceKind, options?: PresenceOptions) => (options ? h.current.presence?.(kind, options) : h.current.presence?.(kind)) ?? Promise.resolve(),
    [h],
  );
  const onJoined = useCallback(() => {
    setHasJoined(true);
    h.current.onJoined?.();
  }, [h]);
  const onLeft = useCallback(() => {
    // Left the call: the corner window goes with it, there is no call to come back to.
    setHasJoined(false);
    h.current.onLeft?.();
  }, [h]);
  const onFailure = useCallback((f: CallFailure, r: RecoveryStatus) => h.current.onFailure?.(f, r), [h]);
  const onDeviceError = useCallback((d: MediaDiagnosis) => h.current.onDeviceError?.(d), [h]);
  const onKnock = useCallback((p: WaitingPerson) => h.current.onKnock?.(p), [h]);
  // The mini-player hides the call's own bar, so it carries its own mute, read from the call itself.
  const micRef = useRef<((on: boolean) => void) | null>(null);
  const [micOn, setMicOn] = useState<boolean | null>(null);
  const onParticipantsChange = useCallback((p: CallParticipant[]) => {
    const me = p.find((x) => x.local);
    setMicOn(me ? me.audio : null);
    h.current.onParticipantsChange?.(p);
  }, [h]);
  const onEndCue = useCallback(() => h.current.onEndCue?.(), [h]);
  const onLeftCall = useCallback((how: LeftCallHow) => h.current.onLeftCall?.(how), [h]);
  const onRemovePerson = useCallback((p: { userId: string | null; name: string }) => h.current.onRemovePerson?.(p), [h]);
  // The drawn screen carries its own round buttons in the corner window; the text bar is for Prebuilt.
  const [drawnInUse, setDrawnInUse] = useState(false);
  const onScreenChange = useCallback((s: 'drawn' | 'prebuilt') => setDrawnInUse(s === 'drawn'), []);
  // The drawn call went out to the floating window: the corner window steps aside (the call stays mounted here).
  const [floatedOut, setFloatedOut] = useState(false);
  const switchToBackup = useCallback(() => {
    const fn = h.current.switchToBackup;
    return fn ? fn() : Promise.reject(new Error('No backup offered.'));
  }, [h]);

  const style = isMinimized
    ? { position: 'fixed' as const, bottom: MINI.margin, right: MINI.margin, width: MINI.width, height: MINI.height, zIndex: 60 }
    : {
        position: 'fixed' as const,
        top: box?.top ?? 0,
        left: box?.left ?? 0,
        width: box?.width ?? 0,
        height: box?.height ?? 0,
        // Below the page's modals (z-50): a dialog at the end of a call must cover the video.
        zIndex: 30,
      };

  return (
    <CallDockContext.Provider value={value}>
      {children}
      {call && (!isMinimized || hasJoined) ? (
        <div
          style={style}
          className={cx('ve-dock', isMinimized && 've-dock--mini', isMinimized && floatedOut && 've-dock--out', className)}
          data-minimized={isMinimized ? 'true' : 'false'}
          role="region"
          aria-label={labels.dockRegion}
        >
          <CallFrame
            className="ve-call--fill"
            url={call.url}
            userName={call.userName ?? null}
            knockName={call.knockName ?? null}
            fetchFreshUrl={fetchFreshUrl}
            checkEnded={checkEnded}
            onEndForEveryone={call.host ? onEndForEveryone : undefined}
            onEnded={onEnded}
            presence={presence}
            continuity={Boolean(call.continuity)}
            rememberAs={call.rememberAs ?? null}
            confirmLeave={Boolean(call.confirmLeave)}
            drawn={Boolean(call.drawn)}
            compact={isMinimized ? { onBack: () => navigate(call.returnHref), onFloated: setFloatedOut } : null}
            onScreenChange={onScreenChange}
            onJoined={onJoined}
            onLeft={onLeft}
            onLeftCall={onLeftCall}
            onRemovePerson={onRemovePerson}
            panels={panels}
            onDrawnShowing={onDrawnShowing}
            onFailure={onFailure}
            onDeviceError={onDeviceError}
            onKnock={onKnock}
            onParticipantsChange={onParticipantsChange}
            micRef={micRef}
            scheduledEnd={call.scheduledEnd ?? null}
            startedAt={call.startedAt ?? null}
            endCueAction={call.endCueLabel ? { label: call.endCueLabel, onSelect: onEndCue } : undefined}
            backup={call.backup ? { switchTo: switchToBackup, url: call.backup.url ?? null } : undefined}
            overlay={isMinimized ? null : overlay}
          />
          {isMinimized && !drawnInUse ? (
            <div className="ve-dock__bar">
              <button type="button" className="ve-dock__btn" onClick={() => navigate(call.returnHref)}>
                {labels.dockBack}
              </button>
              {micOn !== null ? (
                <button type="button" className="ve-dock__btn" aria-pressed={!micOn} onClick={() => micRef.current?.(!micOn)}>
                  {micOn ? labels.dockMute : labels.dockUnmute}
                </button>
              ) : (
                <span />
              )}
              <button type="button" className="ve-dock__btn ve-dock__btn--leave" onClick={stop}>
                {labels.dockLeave}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </CallDockContext.Provider>
  );
}
