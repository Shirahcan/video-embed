import { useCallback, useEffect, useRef, useState } from 'react';
import {
  diagnoseMediaError,
  mediaAvailability,
  rms,
  SIGNAL_THRESHOLD,
  currentBrowser,
  type MediaDiagnosis,
} from '../diagnose';

/**
 * The pre-join check: microphone, camera and speaker, each tested for real and each with
 * its own diagnosis. It never blocks joining; a wrong verdict must not lock anyone out of
 * their own call.
 *
 * Auto-troubleshooting, said out loud (`autoFixed`): a picked device that fails is retried
 * as the system default; a camera that fails never takes the microphone down with it (each
 * device is opened on its own). Devices are released on `stop()` and on unmount, so the
 * call itself can open them.
 */
export type MicStatus = 'idle' | 'asking' | 'checking' | 'heard' | 'silent' | 'error';
export type CameraStatus = 'idle' | 'asking' | 'checking' | 'ok' | 'error';
export type SpeakerStatus = 'idle' | 'playing' | 'asking' | 'heard' | 'not-heard';

export interface DeviceOption {
  deviceId: string;
  label: string;
}

export interface MediaCheck {
  available: 'ok' | 'insecure' | 'unsupported';
  mic: { status: MicStatus; level: number; diagnosis: MediaDiagnosis | null; deviceId: string };
  camera: { status: CameraStatus; stream: MediaStream | null; diagnosis: MediaDiagnosis | null; deviceId: string };
  speaker: { status: SpeakerStatus; deviceId: string; canSelect: boolean };
  devices: { microphones: DeviceOption[]; cameras: DeviceOption[]; speakers: DeviceOption[] };
  autoFixed: string[];
  start: () => Promise<void>;
  selectMic: (deviceId: string) => Promise<void>;
  selectCamera: (deviceId: string) => Promise<void>;
  selectSpeaker: (deviceId: string) => void;
  playTone: () => Promise<void>;
  answerSpeaker: (heard: boolean) => void;
  stop: () => void;
}

const SILENT_AFTER_MS = 4000;

type AudioCtxCtor = typeof AudioContext;
function audioContextCtor(): AudioCtxCtor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext ?? null;
}

function toOptions(list: MediaDeviceInfo[], kind: MediaDeviceKind, fallback: string): DeviceOption[] {
  return list
    .filter((d) => d.kind === kind && d.deviceId !== '')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
}

export function useMediaCheck(): MediaCheck {
  const [available] = useState(mediaAvailability);
  const [mic, setMic] = useState<MediaCheck['mic']>({ status: 'idle', level: 0, diagnosis: null, deviceId: '' });
  const [camera, setCamera] = useState<MediaCheck['camera']>({ status: 'idle', stream: null, diagnosis: null, deviceId: '' });
  const [speaker, setSpeaker] = useState<MediaCheck['speaker']>({
    status: 'idle',
    deviceId: '',
    canSelect: typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype,
  });
  const [devices, setDevices] = useState<MediaCheck['devices']>({ microphones: [], cameras: [], speakers: [] });
  const [autoFixed, setAutoFixed] = useState<string[]>([]);

  const micStream = useRef<MediaStream | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        microphones: toOptions(list, 'audioinput', 'Microphone'),
        cameras: toOptions(list, 'videoinput', 'Camera'),
        speakers: toOptions(list, 'audiooutput', 'Speaker'),
      });
    } catch {
      /* labels stay generic */
    }
  }, []);

  const stopMic = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  const stopCamera = useCallback(() => {
    camStream.current?.getTracks().forEach((t) => t.stop());
    camStream.current = null;
  }, []);

  /** Open one device; a picked device that fails is retried as the default (said out loud). */
  const open = useCallback(async (kind: 'audio' | 'video', deviceId: string): Promise<MediaStream> => {
    const constraint = deviceId ? { deviceId: { exact: deviceId } } : true;
    try {
      return await navigator.mediaDevices.getUserMedia({ [kind]: constraint });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name ?? '';
      const retryable = deviceId !== '' && ['NotReadableError', 'OverconstrainedError', 'NotFoundError', 'AbortError'].includes(name);
      if (!retryable) throw err;
      const stream = await navigator.mediaDevices.getUserMedia({ [kind]: true });
      setAutoFixed((f) => [...f, kind === 'audio' ? 'switched to your default microphone' : 'switched to your default camera']);
      return stream;
    }
  }, []);

  const startMic = useCallback(async (deviceId: string) => {
    stopMic();
    // 'asking' until the browser hands over the device: its permission prompt can sit there,
    // and "say something" while nothing is listening sends people talking to a dead mic.
    setMic({ status: 'asking', level: 0, diagnosis: null, deviceId });
    try {
      const stream = await open('audio', deviceId);
      micStream.current = stream;
      setMic((m) => ({ ...m, status: 'checking' }));
      const active = stream.getAudioTracks()[0]?.getSettings().deviceId ?? deviceId;
      setMic((m) => ({ ...m, deviceId: active }));
      void refreshDevices();

      const Ctx = audioContextCtor();
      if (!Ctx) {
        setMic((m) => ({ ...m, status: 'heard' }));
        return;
      }
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      const started = performance.now();
      let peak = 0;

      const tick = () => {
        analyser.getFloatTimeDomainData(buffer);
        const level = rms(buffer);
        peak = Math.max(peak, level);
        const status: MicStatus = peak > SIGNAL_THRESHOLD ? 'heard' : performance.now() - started > SILENT_AFTER_MS ? 'silent' : 'checking';
        setMic((m) => ({
          ...m,
          level,
          status,
          diagnosis: status === 'silent' ? { problem: 'silent', device: 'microphone', browser: currentBrowser(), detail: '' } : null,
        }));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setMic({ status: 'error', level: 0, diagnosis: diagnoseMediaError(err, 'microphone'), deviceId });
    }
  }, [open, refreshDevices, stopMic]);

  const startCamera = useCallback(async (deviceId: string) => {
    stopCamera();
    setCamera({ status: 'asking', stream: null, diagnosis: null, deviceId });
    try {
      const stream = await open('video', deviceId);
      camStream.current = stream;
      const active = stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId;
      setCamera({ status: 'ok', stream, diagnosis: null, deviceId: active });
      void refreshDevices();
    } catch (err) {
      // The microphone keeps working: a call with sound only is still a call.
      setCamera({ status: 'error', stream: null, diagnosis: diagnoseMediaError(err, 'camera'), deviceId });
    }
  }, [open, refreshDevices, stopCamera]);

  const start = useCallback(async () => {
    if (available !== 'ok') {
      const problem = available === 'insecure' ? 'insecure' : 'unsupported';
      const d = (device: 'microphone' | 'camera'): MediaDiagnosis => ({ problem, device, browser: currentBrowser(), detail: '' });
      setMic({ status: 'error', level: 0, diagnosis: d('microphone'), deviceId: '' });
      setCamera({ status: 'error', stream: null, diagnosis: d('camera'), deviceId: '' });
      return;
    }
    setAutoFixed([]);
    // One after the other: some browsers show one permission prompt at a time.
    await startMic(mic.deviceId);
    await startCamera(camera.deviceId);
  }, [available, startMic, startCamera, mic.deviceId, camera.deviceId]);

  const selectSpeaker = useCallback((deviceId: string) => {
    setSpeaker((s) => ({ ...s, deviceId, status: 'idle' }));
  }, []);

  const playTone = useCallback(async () => {
    const Ctx = audioContextCtor();
    if (!Ctx) return;
    setSpeaker((s) => ({ ...s, status: 'playing' }));
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 523.25;
    gain.gain.value = 0.12;
    osc.connect(gain);
    let el: (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null = null;

    const finish = () => {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
      void ctx.close().catch(() => {});
      el?.pause();
      setSpeaker((s) => ({ ...s, status: 'asking' }));
    };

    try {
      if (speaker.canSelect && speaker.deviceId) {
        const dest = ctx.createMediaStreamDestination();
        gain.connect(dest);
        el = new Audio();
        el.srcObject = dest.stream;
        await el.setSinkId?.(speaker.deviceId);
        await el.play();
      } else {
        gain.connect(ctx.destination);
      }
      osc.start();
      setTimeout(finish, 1500);
    } catch {
      finish();
    }
  }, [speaker.canSelect, speaker.deviceId]);

  const answerSpeaker = useCallback((heard: boolean) => {
    setSpeaker((s) => ({ ...s, status: heard ? 'heard' : 'not-heard' }));
  }, []);

  const stop = useCallback(() => {
    stopMic();
    stopCamera();
    setCamera((c) => ({ ...c, stream: null }));
  }, [stopMic, stopCamera]);

  useEffect(() => {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md?.addEventListener) return () => {
      stopMic();
      stopCamera();
    };
    const onChange = () => void refreshDevices();
    md.addEventListener('devicechange', onChange);
    return () => {
      md.removeEventListener('devicechange', onChange);
      stopMic();
      stopCamera();
    };
  }, [refreshDevices, stopMic, stopCamera]);

  return {
    available,
    mic,
    camera,
    speaker,
    devices,
    autoFixed,
    start,
    selectMic: startMic,
    selectCamera: startCamera,
    selectSpeaker,
    playTone,
    answerSpeaker,
    stop,
  };
}
