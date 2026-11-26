import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailyCall } from '@daily-co/daily-js';

/**
 * The drawn call screen's devices: what this computer has, what the call uses, switching between
 * them, and noticing when one is plugged in or pulled out mid-call.
 *
 * Microphone and camera go through Daily (setInputDevicesAsync). The SPEAKER is ours: the drawn
 * screen plays every voice from its own <audio> elements, which Daily's output setting never
 * reaches, so the chosen speaker is applied with setSinkId on those elements. Browsers without
 * setSinkId (Safari, Firefox before 116) get no speaker choice at all rather than one that does
 * nothing.
 */
export type DeviceKind = 'microphone' | 'camera' | 'speaker';

export interface DeviceChoice {
  id: string;
  label: string;
}

export interface DrawnDevices {
  microphones: DeviceChoice[];
  cameras: DeviceChoice[];
  speakers: DeviceChoice[];
  micId: string | null;
  cameraId: string | null;
  /** '' = the system default speaker. */
  speakerId: string;
  /** Whether this browser can send sound to a chosen speaker. */
  canChooseSpeaker: boolean;
  choose: (kind: DeviceKind, id: string) => void;
  /**
   * What to tell the person about their devices: a change they did not make (a device plugged in or
   * pulled out), or a device they chose that would not start (`failed`: another app holds it, or it
   * is not really there), in which case the call kept `kept`.
   */
  notice: { kind: DeviceKind; label: string | null; failed?: boolean; kept?: string | null } | null;
  dismissNotice: () => void;
}

export function speakerChoiceSupported(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

/** Turn the browser's device list into named choices; a nameless device gets "<Kind> 2". */
export function devicesOfKind(list: MediaDeviceInfo[], kind: MediaDeviceKind, fallbackName: string): DeviceChoice[] {
  return list
    .filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `${fallbackName} ${i + 1}` }));
}

type Current = { mic: string | null; camera: string | null; micLabel: string | null; cameraLabel: string | null };

export function useDrawnDevices(
  call: DailyCall,
  names: { microphone: string; camera: string; speaker: string },
  /** How to switch microphone / camera: the frame's own setDevices, so a device error clears once a switch works. */
  switchInput?: (devices: { audioDeviceId?: string; videoDeviceId?: string }) => void,
): DrawnDevices {
  const [lists, setLists] = useState<{ microphones: DeviceChoice[]; cameras: DeviceChoice[]; speakers: DeviceChoice[] }>({ microphones: [], cameras: [], speakers: [] });
  const [current, setCurrent] = useState<Current>({ mic: null, camera: null, micLabel: null, cameraLabel: null });
  const [speakerId, setSpeakerId] = useState('');
  const [notice, setNotice] = useState<DrawnDevices['notice']>(null);
  // A switch the person asked for is not news; only the ones that happened to them are.
  const chosenRef = useRef<{ kind: DeviceKind; at: number } | null>(null);
  const currentRef = useRef(current);
  const namesRef = useRef(names);
  useEffect(() => {
    currentRef.current = current;
    namesRef.current = names;
  });

  const refresh = useCallback(async (): Promise<Current | null> => {
    try {
      const [{ devices }, input] = await Promise.all([call.enumerateDevices(), call.getInputDevices()]);
      const n = namesRef.current;
      const next = {
        microphones: devicesOfKind(devices, 'audioinput', n.microphone),
        cameras: devicesOfKind(devices, 'videoinput', n.camera),
        speakers: devicesOfKind(devices, 'audiooutput', n.speaker),
      };
      setLists(next);
      const mic = (input.mic as { deviceId?: string; label?: string }) ?? {};
      const cam = (input.camera as { deviceId?: string; label?: string }) ?? {};
      const now: Current = { mic: mic.deviceId || null, camera: cam.deviceId || null, micLabel: mic.label || null, cameraLabel: cam.label || null };
      const before = currentRef.current;
      const recent = chosenRef.current && Date.now() - chosenRef.current.at < 4000 ? chosenRef.current.kind : null;
      if (before.mic && now.mic && before.mic !== now.mic && recent !== 'microphone') setNotice({ kind: 'microphone', label: now.micLabel });
      else if (before.camera && now.camera && before.camera !== now.camera && recent !== 'camera') setNotice({ kind: 'camera', label: now.cameraLabel });
      setCurrent(now);
      // The chosen speaker was pulled out: back to the system default, and say so.
      setSpeakerId((sid) => {
        if (sid && !next.speakers.some((s) => s.id === sid)) {
          setNotice({ kind: 'speaker', label: null });
          return '';
        }
        return sid;
      });
      return now;
    } catch {
      /* not in a call (yet), or torn down: the lists stay as they were */
      return null;
    }
  }, [call]);

  useEffect(() => {
    const onChange = () => {
      void refresh();
    };
    call.on('available-devices-updated', onChange);
    call.on('selected-devices-updated', onChange);
    call.on('joined-meeting', onChange);
    void refresh();
    return () => {
      call.off('available-devices-updated', onChange);
      call.off('selected-devices-updated', onChange);
      call.off('joined-meeting', onChange);
    };
  }, [call, refresh]);

  // A device that will not start (another app holds it) leaves Daily on the old one WITHOUT an
  // error the person can see, so the stage checks what the call actually uses afterwards.
  const confirmSwitch = useCallback(
    async (kind: 'microphone' | 'camera', id: string, label: string) => {
      const now = await refresh();
      if (!now) return;
      const using = kind === 'microphone' ? now.mic : now.camera;
      if (using && using !== id) {
        setNotice({ kind, label, failed: true, kept: kind === 'microphone' ? now.micLabel : now.cameraLabel });
      }
    },
    [refresh],
  );

  const choose = useCallback(
    (kind: DeviceKind, id: string) => {
      chosenRef.current = { kind, at: Date.now() };
      if (kind === 'speaker') {
        setSpeakerId(id);
        return;
      }
      const label = (kind === 'microphone' ? lists.microphones : lists.cameras).find((d) => d.id === id)?.label ?? '';
      const devices = kind === 'microphone' ? { audioDeviceId: id } : { videoDeviceId: id };
      const check = () => setTimeout(() => void confirmSwitch(kind, id, label), 2500);
      if (switchInput) {
        switchInput(devices);
        check();
        return;
      }
      void Promise.resolve(call.setInputDevicesAsync(devices)).then(
        () => {
          void refresh();
          check();
        },
        check,
      );
    },
    [call, confirmSwitch, lists, switchInput],
  );

  return {
    ...lists,
    micId: current.mic,
    cameraId: current.camera,
    speakerId,
    canChooseSpeaker: speakerChoiceSupported() && lists.speakers.length > 0,
    choose,
    notice,
    dismissNotice: () => setNotice(null),
  };
}
