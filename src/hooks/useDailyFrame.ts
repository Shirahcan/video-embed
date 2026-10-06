import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { DailyCall } from '@daily-co/daily-js';
import { classifyCallError, type CallFailure } from '../callErrors';
import { diagnoseMediaError, type MediaDiagnosis } from '../diagnose';

/**
 * Owns one Daily Prebuilt frame (DailyIframe.createFrame), ported from Portify's hardened
 * hook: StrictMode-safe, a reveal failsafe so no overlay can trap the prejoin screen, and a
 * new token never rebuilds a live call.
 *
 * Adds what the products were missing:
 * - a TYPED failure (`failure.kind`), so the room can repair instead of showing Daily's raw
 *   "Meeting has ended" with a retry that reuses the dead URL;
 * - a DIAGNOSED device error (browser block vs OS block vs busy vs missing);
 * - the HOST's waiting list: people knocking on the private room, with admit / deny, so a
 *   knock is never lost in a corner of the frame.
 */
export type FrameState = 'idle' | 'loading' | 'ready' | 'joined' | 'left' | 'error';

export interface WaitingPerson {
  id: string;
  name: string;
}

export interface UseDailyFrameOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  /** Full join URL including `?t=`. Null keeps the frame unmounted. */
  url: string | null;
  enabled?: boolean;
  onJoined?: () => void;
  onLeft?: () => void;
  onDeviceError?: (diagnosis: MediaDiagnosis) => void;
  onFailure?: (failure: CallFailure) => void;
  /** Called when someone starts knocking (a product can play a sound, notify, log). */
  onKnock?: (person: WaitingPerson) => void;
}

export interface UseDailyFrameResult {
  state: FrameState;
  failure: CallFailure | null;
  deviceError: MediaDiagnosis | null;
  participantCount: number;
  waiting: WaitingPerson[];
  admit: (id: string) => void;
  deny: (id: string) => void;
  admitAll: () => void;
  /** Tear the frame down and join again (with whatever `url` is now). */
  rejoin: () => void;
  /** Switch the frame's input devices without leaving the call. */
  setDevices: (devices: { audioDeviceId?: string; videoDeviceId?: string }) => void;
}

const READY_FAILSAFE_MS = 12_000;

function roomIdentity(url: string | null): string | null {
  if (!url) return null;
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export function useDailyFrame({
  containerRef,
  url,
  enabled = true,
  onJoined,
  onLeft,
  onDeviceError,
  onFailure,
  onKnock,
}: UseDailyFrameOptions): UseDailyFrameResult {
  const [state, setState] = useState<FrameState>('idle');
  const [failure, setFailure] = useState<CallFailure | null>(null);
  const [deviceError, setDeviceError] = useState<MediaDiagnosis | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [waiting, setWaiting] = useState<WaitingPerson[]>([]);
  const [nonce, setNonce] = useState(0);

  const frameRef = useRef<DailyCall | null>(null);
  const creatingRef = useRef(false);
  const handlersRef = useRef({ onJoined, onLeft, onDeviceError, onFailure, onKnock });
  const urlRef = useRef(url);

  // Latest callbacks and URL without rebuilding the frame (a re-minted token must not).
  useLayoutEffect(() => {
    handlersRef.current = { onJoined, onLeft, onDeviceError, onFailure, onKnock };
    urlRef.current = url;
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

    const boot = async () => {
      try {
        const DailyIframe = (await import('@daily-co/daily-js')).default;
        if (cancelled) return;

        const existing = DailyIframe.getCallInstance?.();
        if (existing) await existing.destroy().catch(() => {});

        const frame = DailyIframe.createFrame(container, {
          showLeaveButton: true,
          showFullscreenButton: false,
          iframeStyle: { width: '100%', height: '100%', border: '0' } as unknown as Partial<CSSStyleDeclaration>,
        });
        if (cancelled) {
          await frame.destroy().catch(() => {});
          return;
        }
        frameRef.current = frame;

        const syncParticipants = () => {
          try {
            setParticipantCount(Object.keys(frame.participants() ?? {}).length);
          } catch {
            /* torn down mid-event */
          }
        };
        const syncWaiting = () => {
          try {
            setWaiting(Object.values(frame.waitingParticipants() ?? {}).map((p) => ({ id: p.id, name: p.name })));
          } catch {
            /* not an owner, or torn down */
          }
        };
        const reveal = () => setState((s) => (s === 'joined' ? s : 'ready'));

        frame
          .on('loaded', reveal)
          .on('joining-meeting', reveal)
          .on('started-camera', reveal)
          .on('joined-meeting', () => {
            setState('joined');
            syncParticipants();
            syncWaiting();
            handlersRef.current.onJoined?.();
          })
          .on('left-meeting', () => {
            setState('left');
            handlersRef.current.onLeft?.();
          })
          .on('participant-joined', syncParticipants)
          .on('participant-left', syncParticipants)
          .on('waiting-participant-added', (event) => {
            syncWaiting();
            const p = (event as { participant?: { id: string; name: string } } | undefined)?.participant;
            if (p) handlersRef.current.onKnock?.({ id: p.id, name: p.name });
          })
          .on('waiting-participant-updated', syncWaiting)
          .on('waiting-participant-removed', syncWaiting)
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
            const f = classifyCallError(event);
            setFailure(f);
            setState('error');
            handlersRef.current.onFailure?.(f);
          });

        const joinUrl = urlRef.current;
        if (!joinUrl) return;
        await frame.join({ url: joinUrl });
      } catch (err) {
        if (cancelled) return;
        const f = classifyCallError({ errorMsg: err instanceof Error ? err.message : String(err) });
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
      if (frame) void frame.destroy().catch(() => {});
    };
    // identity, not url: a re-minted token must not rebuild a live call. `nonce` rebuilds.
  }, [identity, enabled, nonce, containerRef]);

  const decide = useCallback((ids: string[], grant: boolean) => {
    const frame = frameRef.current;
    if (!frame || ids.length === 0) return;
    const updates = Object.fromEntries(ids.map((id) => [id, { grantRequestedAccess: grant }]));
    void frame.updateWaitingParticipants(updates).catch(() => {});
    setWaiting((w) => w.filter((p) => !ids.includes(p.id)));
  }, []);

  const admit = useCallback((id: string) => decide([id], true), [decide]);
  const deny = useCallback((id: string) => decide([id], false), [decide]);
  const admitAll = useCallback(() => decide(waiting.map((p) => p.id), true), [decide, waiting]);

  const setDevices = useCallback((devices: { audioDeviceId?: string; videoDeviceId?: string }) => {
    const frame = frameRef.current;
    if (!frame) return;
    void frame.setInputDevicesAsync(devices).then(() => setDeviceError(null)).catch(() => {});
  }, []);

  return { state, failure, deviceError, participantCount, waiting, admit, deny, admitAll, rejoin, setDevices };
}
