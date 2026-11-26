import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { DailyCall } from '@daily-co/daily-js';
import { classifyCallError, type CallFailure } from '../callErrors';
import { diagnoseMediaError, type MediaDiagnosis } from '../diagnose';
import { splitJoinUrl, type CallScreen } from '../callScreen';

/**
 * Owns one Daily Prebuilt frame (DailyIframe.createFrame), ported from Portify's hardened
 * hook: StrictMode-safe, a reveal failsafe so no overlay can trap the prejoin screen, and a
 * new token never rebuilds a live call.
 *
 * Adds what the products were missing:
 * - a TYPED failure (`failure.kind`), so the room can repair instead of showing Daily's raw
 *   "Meeting has ended" with a retry that reuses the dead URL;
 * - a DIAGNOSED device error (browser block vs OS block vs busy vs missing);
 * - the HOST's waiting list: who is knocking on the private room, so a knock is never lost
 *   in a corner of the frame (admitting stays Daily's, see the note in the effect).
 */
export type FrameState = 'idle' | 'loading' | 'ready' | 'joined' | 'left' | 'error';

export interface WaitingPerson {
  id: string;
  name: string;
}

/** Someone actually IN the call right now (not the invited roster). */
export interface CallParticipant {
  id: string;
  name: string;
  /** This browser's own person. */
  local: boolean;
  audio: boolean;
  video: boolean;
}

export interface UseDailyFrameOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  /** Full join URL including `?t=`. Null keeps the frame unmounted. */
  url: string | null;
  /**
   * The name to join under when the URL carries no pass (a guest who typed it): Daily shows it
   * to the host on the knock. Ignored when the pass already names the person.
   */
  userName?: string | null;
  enabled?: boolean;
  onJoined?: () => void;
  onLeft?: () => void;
  onDeviceError?: (diagnosis: MediaDiagnosis) => void;
  onFailure?: (failure: CallFailure) => void;
  /** Called when someone starts knocking (a product can play a sound, notify, log). */
  onKnock?: (person: WaitingPerson) => void;
  /** Who is in the call, on every join, leave and change (empty until this person joins). */
  onParticipantsChange?: (people: CallParticipant[]) => void;
  /**
   * Join with the microphone and camera off (call continuity: "Join here too" on a second device, so
   * two live microphones of the same person never echo). Read at join time.
   */
  startQuiet?: boolean;
  /**
   * `prebuilt` (default): Daily's own call screen in an iframe. `drawn`: Daily's call object, with
   * no screen of its own; the caller draws the call from `call`. Changing it rebuilds the call.
   */
  mode?: CallScreen;
  /**
   * Drawn mode only: the person landed in the room's lobby (waiting to be let in). Daily still fires
   * joined-meeting then, so it is NOT reported as joined; the caller decides (CallFrame falls back to
   * Prebuilt, which runs its own knock).
   */
  onLobby?: () => void;
}

/** Where this person stands in the room: `lobby` = waiting to be let in (nobody can see them yet). */
/**
 * This person's access (drawn mode). `asking`: they knocked and wait for a host; `denied`: a host
 * said no. Prebuilt runs its own lobby and leaves this null.
 */
export type CallAccess = 'full' | 'lobby' | 'asking' | 'denied' | null;

export interface UseDailyFrameResult {
  state: FrameState;
  failure: CallFailure | null;
  deviceError: MediaDiagnosis | null;
  participantCount: number;
  waiting: WaitingPerson[];
  /** Tear the frame down and join again (with whatever `url` is now). */
  rejoin: () => void;
  /** Switch the frame's input devices without leaving the call. */
  setDevices: (devices: { audioDeviceId?: string; videoDeviceId?: string }) => void;
  /** Leave the call, as the call's own Leave button does. */
  leave: () => void;
  /** Turn this person's own microphone on or off (the call dock's mute, while the call's own bar is hidden). */
  setMic: (on: boolean) => void;
  /** The live Daily call (drawn mode draws from it). Null until created. */
  call: DailyCall | null;
  /** This person's access once joined (drawn mode; Prebuilt handles its own lobby). */
  access: CallAccess;
}

const READY_FAILSAFE_MS = 12_000;

/** Daily's participants() map (keyed by session, plus `local`) as the flat list a product shows. */
export function toCallParticipants(raw: Record<string, unknown> | null | undefined): CallParticipant[] {
  if (!raw) return [];
  return Object.values(raw).map((p) => {
    const part = p as { session_id?: string; user_name?: string; local?: boolean; audio?: boolean; video?: boolean };
    return {
      id: part.session_id ?? '',
      name: (part.user_name ?? '').trim(),
      local: Boolean(part.local),
      audio: Boolean(part.audio),
      video: Boolean(part.video),
    };
  });
}

function roomIdentity(url: string | null): string | null {
  if (!url) return null;
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export function useDailyFrame({
  containerRef,
  url,
  userName = null,
  enabled = true,
  onJoined,
  onLeft,
  onDeviceError,
  onFailure,
  onKnock,
  onParticipantsChange,
  startQuiet = false,
  mode = 'prebuilt',
  onLobby,
}: UseDailyFrameOptions): UseDailyFrameResult {
  const [state, setState] = useState<FrameState>('idle');
  const [failure, setFailure] = useState<CallFailure | null>(null);
  const [deviceError, setDeviceError] = useState<MediaDiagnosis | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [waiting, setWaiting] = useState<WaitingPerson[]>([]);
  const [nonce, setNonce] = useState(0);
  const [call, setCall] = useState<DailyCall | null>(null);
  const [access, setAccess] = useState<CallAccess>(null);

  const frameRef = useRef<DailyCall | null>(null);
  const creatingRef = useRef(false);
  const handlersRef = useRef({ onJoined, onLeft, onDeviceError, onFailure, onKnock, onParticipantsChange, onLobby });
  const urlRef = useRef(url);
  const nameRef = useRef(userName);
  const quietRef = useRef(startQuiet);

  // Latest callbacks and URL without rebuilding the frame (a re-minted token must not).
  useLayoutEffect(() => {
    handlersRef.current = { onJoined, onLeft, onDeviceError, onFailure, onKnock, onParticipantsChange, onLobby };
    urlRef.current = url;
    nameRef.current = userName;
    quietRef.current = startQuiet;
  });

  const identity = roomIdentity(url);

  const rejoin = useCallback(() => {
    setFailure(null);
    setDeviceError(null);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !identity) return undefined;
    const container = containerRef.current;
    if (!container || creatingRef.current) return undefined;

    let cancelled = false;
    creatingRef.current = true;
    setState('loading');

    const failsafe = setTimeout(() => setState((s) => (s === 'loading' ? 'ready' : s)), READY_FAILSAFE_MS);

    // Set by the `error` event, so the matching join() rejection is not reported twice.
    let reported = false;
    const boot = async () => {
      try {
        const DailyIframe = (await import('@daily-co/daily-js')).default;
        if (cancelled) return;

        const existing = DailyIframe.getCallInstance?.();
        if (existing) await existing.destroy().catch(() => {});

        const frame = mode === 'drawn'
          ? DailyIframe.createCallObject({ subscribeToTracksAutomatically: true })
          : DailyIframe.createFrame(container, {
            showLeaveButton: true,
            showFullscreenButton: false,
            iframeStyle: { width: '100%', height: '100%', border: '0' } as unknown as Partial<CSSStyleDeclaration>,
          });
        if (cancelled) {
          await frame.destroy().catch(() => {});
          return;
        }
        frameRef.current = frame;
        setCall(frame);
        // A knock from the drawn screen (P2d): requestAccess, then wait for a host's answer.
        let knock: 'none' | 'asking' | 'denied' | 'admitted' = 'none';
        const readAccess = (): CallAccess => {
          try {
            const level = (frame.accessState?.() as { access?: { level?: string } } | undefined)?.access?.level;
            let next: CallAccess = level === 'lobby' ? 'lobby' : level === 'full' ? 'full' : null;
            if (knock === 'denied') next = 'denied';
            else if (next === 'lobby' && knock === 'asking') next = 'asking';
            setAccess(next);
            // Let in: the call they were already connected to now carries them in full.
            if (next === 'full' && knock === 'asking') {
              knock = 'admitted';
              setState('joined');
              syncParticipants();
              handlersRef.current.onJoined?.();
            }
            return next;
          } catch {
            /* torn down */
            return null;
          }
        };
        const askToJoin = () => {
          if (typeof frame.requestAccess !== 'function') {
            handlersRef.current.onLobby?.();
            return;
          }
          knock = 'asking';
          setAccess('asking');
          void Promise.resolve()
            .then(() => {
              // Daily refuses a knock without a name: the given one, else the call's, else "Guest".
              let callName = '';
              try {
                callName = (frame.participants()?.local?.user_name ?? '').trim();
              } catch {
                /* torn down */
              }
              return frame.requestAccess({ access: { level: 'full' }, name: nameRef.current?.trim() || callName || 'Guest' });
            })
            .then((answer) => {
              if (answer.granted) {
                readAccess();
              } else {
                knock = 'denied';
                setAccess('denied');
              }
            })
            .catch(() => {
              // Knocking failed (an old daily-js, a room without a lobby): Prebuilt runs the knock instead.
              knock = 'none';
              handlersRef.current.onLobby?.();
            });
        };

        const syncParticipants = () => {
          try {
            const raw = frame.participants() ?? {};
            setParticipantCount(Object.keys(raw).length);
            handlersRef.current.onParticipantsChange?.(toCallParticipants(raw as unknown as Record<string, unknown>));
          } catch {
            /* torn down mid-event */
          }
        };
        // ⚠ Prebuilt: waitingParticipants() and updateWaitingParticipant() are call-object-only
        // (daily-js logs an error and does nothing). The EVENTS do reach the page, so the list
        // is kept from them, and admitting stays with Daily's own request inside the frame.
        const waitingFrom = (event: unknown) =>
          (event as { participant?: { id: string; name: string } } | undefined)?.participant;
        const reveal = () => setState((s) => (s === 'joined' ? s : 'ready'));

        frame
          .on('loaded', reveal)
          .on('joining-meeting', reveal)
          .on('started-camera', reveal)
          .on('access-state-updated', readAccess)
          .on('joined-meeting', () => {
            if (readAccess() === 'lobby' && mode === 'drawn') {
              setState('ready');
              askToJoin();
              return;
            }
            setState('joined');
            syncParticipants();
            handlersRef.current.onJoined?.();
          })
          .on('left-meeting', () => {
            // A refused knock ends Daily's meeting too, but the person never was in the call.
            if (knock === 'denied') return;
            setState('left');
            handlersRef.current.onParticipantsChange?.([]);
            handlersRef.current.onLeft?.();
          })
          .on('participant-joined', syncParticipants)
          .on('participant-updated', syncParticipants)
          .on('participant-left', syncParticipants)
          .on('waiting-participant-added', (event) => {
            const p = waitingFrom(event);
            if (!p) return;
            setWaiting((w) => [...w.filter((x) => x.id !== p.id), { id: p.id, name: p.name }]);
            handlersRef.current.onKnock?.({ id: p.id, name: p.name });
          })
          .on('waiting-participant-updated', (event) => {
            const p = waitingFrom(event);
            if (p) setWaiting((w) => w.map((x) => (x.id === p.id ? { id: p.id, name: p.name } : x)));
          })
          .on('waiting-participant-removed', (event) => {
            const p = waitingFrom(event);
            if (p) setWaiting((w) => w.filter((x) => x.id !== p.id));
          })
          .on('camera-error', (event) => {
            const raw = event as { error?: { type?: string; msg?: string }; errorMsg?: { errorMsg?: string; audioOk?: boolean } } | undefined;
            const type = raw?.error?.type ?? '';
            // Daily's camera-error types map onto getUserMedia's names; diagnoseMediaError
            // reads "by system" in the message to tell an OS block from a browser block.
            const name =
              type === 'permissions' ? 'NotAllowedError'
                : type === 'not-found' ? 'NotFoundError'
                  : type === 'cam-in-use' || type === 'mic-in-use' || type === 'cam-mic-in-use' ? 'NotReadableError'
                    : type === 'constraints' ? 'OverconstrainedError'
                      : '';
            const device = raw?.errorMsg?.audioOk === false || type === 'mic-in-use' ? 'microphone' : 'camera';
            const diagnosis = diagnoseMediaError({ name, message: raw?.error?.msg ?? raw?.errorMsg?.errorMsg ?? '' }, device);
            setDeviceError(diagnosis);
            handlersRef.current.onDeviceError?.(diagnosis);
          })
          .on('error', (event) => {
            // Daily ends a refused knock as an error ("Join request rejected"): that is the host's
            // answer, not a broken call, so the stage says so instead of falling back.
            if (knock === 'asking' || knock === 'denied') {
              knock = 'denied';
              setAccess('denied');
              return;
            }
            reported = true;
            const f = classifyCallError(event);
            setFailure(f);
            setState('error');
            handlersRef.current.onFailure?.(f);
          });

        const joinUrl = urlRef.current;
        if (!joinUrl) return;
        const quiet = quietRef.current ? { startAudioOff: true, startVideoOff: true } : {};
        // The call object ignores a pass inside the URL (the person lands in the lobby): pass it apart.
        const target = mode === 'drawn' ? splitJoinUrl(joinUrl) : { url: joinUrl, token: null };
        const where = target.token ? { url: target.url, token: target.token } : { url: target.url };
        await frame.join(nameRef.current ? { ...where, userName: nameRef.current, ...quiet } : { ...where, ...quiet });
      } catch (err) {
        // join() rejects for the same failure the `error` event already reported: once only.
        if (cancelled || reported) return;
        // daily-js rejects with a plain object ({ errorMsg, error }) as often as an Error.
        const f = classifyCallError(err instanceof Error ? { errorMsg: err.message } : err);
        setFailure(f);
        setState('error');
        handlersRef.current.onFailure?.(f);
      } finally {
        creatingRef.current = false;
      }
    };

    void boot();

    return () => {
      cancelled = true;
      creatingRef.current = false;
      clearTimeout(failsafe);
      const frame = frameRef.current;
      frameRef.current = null;
      setWaiting([]);
      setCall(null);
      setAccess(null);
      if (frame) void frame.destroy().catch(() => {});
    };
    // identity, not url: a re-minted token must not rebuild a live call. `nonce` and `mode` rebuild.
  }, [identity, enabled, nonce, containerRef, mode]);

  const setDevices = useCallback((devices: { audioDeviceId?: string; videoDeviceId?: string }) => {
    const frame = frameRef.current;
    if (!frame) return;
    void frame.setInputDevicesAsync(devices).then(() => setDeviceError(null)).catch(() => {});
  }, []);

  const leave = useCallback(() => {
    const frame = frameRef.current;
    if (frame) void frame.leave().catch(() => {});
  }, []);

  const setMic = useCallback((on: boolean) => {
    const frame = frameRef.current;
    if (!frame) return;
    try {
      frame.setLocalAudio(on);
    } catch {
      /* torn down */
    }
  }, []);

  return { state, failure, deviceError, participantCount, waiting, rejoin, setDevices, leave, setMic, call, access };
}
