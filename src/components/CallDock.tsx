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
import type { PresenceKind } from '../hooks/useCallPresence';
import type { CallParticipant, WaitingPerson } from '../hooks/useDailyFrame';
import { cx, useVideoUi } from '../theme';
import { CallFrame, type RecoveryStatus } from './CallFrame';

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
  /** The viewer may end the call for everyone (pair with `handlers.onEndForEveryone`). */
  host?: boolean;
  scheduledEnd?: string | null;
  /** The viewer's action at the booked end (pair with `handlers.onEndCue`). */
  endCueLabel?: string | null;
  /** A backup meeting exists or may be made (pair with `handlers.switchToBackup`). */
  backup?: { url?: string | null } | null;
}

/** The call's behaviour, from the page that owns it. Kept in a ref: changing them never touches the frame. */
export interface DockedCallHandlers {
  fetchFreshUrl?: (why: CallFailureKind) => Promise<string>;
  checkEnded?: () => Promise<boolean>;
  onEndForEveryone?: () => Promise<void>;
  onEnded?: (how: 'by-me' | 'ended') => void;
  presence?: (kind: PresenceKind) => Promise<void>;
  onJoined?: () => void;
  onLeft?: () => void;
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

const MINI = { width: 320, height: 180, margin: 20 };

type Box = { top: number; left: number; width: number; height: number };

function sameCall(a: DockedCall, b: DockedCall): boolean {
  return (
    a.key === b.key &&
    a.url === b.url &&
    a.returnHref === b.returnHref &&
    (a.userName ?? null) === (b.userName ?? null) &&
    Boolean(a.host) === Boolean(b.host) &&
    (a.scheduledEnd ?? null) === (b.scheduledEnd ?? null) &&
    (a.endCueLabel ?? null) === (b.endCueLabel ?? null) &&
    Boolean(a.backup) === Boolean(b.backup) &&
    (a.backup?.url ?? null) === (b.backup?.url ?? null)
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

  const start = useCallback((next: DockedCall, handlers?: DockedCallHandlers) => {
    handlersRef.current = handlers ?? {};
    setCall((prev) => {
      if (prev && prev.key === next.key) {
        const merged = { ...next, url: prev.url };
        return sameCall(prev, merged) ? prev : merged;
      }
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    handlersRef.current = {};
    setCall(null);
    setAnchorState(null);
    setOverlayState(null);
    setBox(null);
    setHasJoined(false);
  }, []);

  const setAnchor = useCallback((el: HTMLElement | null) => setAnchorState(el), []);
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

  const isMinimized = call !== null && (anchor === null || box === null);

  const value = useMemo<CallDockValue>(
    () => ({ activeKey: call?.key ?? null, isMinimized, start, stop, setAnchor, setOverlay }),
    [call?.key, isMinimized, start, stop, setAnchor, setOverlay],
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
  const presence = useCallback((kind: PresenceKind) => h.current.presence?.(kind) ?? Promise.resolve(), [h]);
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
  const onParticipantsChange = useCallback((p: CallParticipant[]) => h.current.onParticipantsChange?.(p), [h]);
  const onEndCue = useCallback(() => h.current.onEndCue?.(), [h]);
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
          className={cx('ve-dock', isMinimized && 've-dock--mini', className)}
          data-minimized={isMinimized ? 'true' : 'false'}
          role="region"
          aria-label={labels.dockRegion}
        >
          <CallFrame
            className="ve-call--fill"
            url={call.url}
            userName={call.userName ?? null}
            fetchFreshUrl={fetchFreshUrl}
            checkEnded={checkEnded}
            onEndForEveryone={call.host ? onEndForEveryone : undefined}
            onEnded={onEnded}
            presence={presence}
            onJoined={onJoined}
            onLeft={onLeft}
            onFailure={onFailure}
            onDeviceError={onDeviceError}
            onKnock={onKnock}
            onParticipantsChange={onParticipantsChange}
            scheduledEnd={call.scheduledEnd ?? null}
            endCueAction={call.endCueLabel ? { label: call.endCueLabel, onSelect: onEndCue } : undefined}
            backup={call.backup ? { switchTo: switchToBackup, url: call.backup.url ?? null } : undefined}
            overlay={isMinimized ? null : overlay}
          />
          {isMinimized ? (
            <div className="ve-dock__bar">
              <button type="button" className="ve-dock__btn" onClick={() => navigate(call.returnHref)}>
                {labels.dockBack}
              </button>
              <span />
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
