import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DailyCall } from '@daily-co/daily-js';
import { devicesOfKind, speakerChoiceSupported, useDrawnDevices } from '../src/drawnDevices';
import { DrawnStage } from '../src/components/DrawnStage';

const dev = (kind: MediaDeviceKind, deviceId: string, label = '') => ({ kind, deviceId, label, groupId: '', toJSON: () => ({}) }) as MediaDeviceInfo;

type Handler = (event?: unknown) => void;
class DeviceCall {
  handlers = new Map<string, Handler[]>();
  people: Record<string, unknown> = { local: { session_id: 'me', user_name: 'Ada', local: true, tracks: {} } };
  devices: MediaDeviceInfo[] = [
    dev('audioinput', 'default', 'Default'),
    dev('audioinput', 'mic-a', 'Desk mic'),
    dev('audioinput', 'mic-b', 'Headset mic'),
    dev('videoinput', 'cam-a', 'Laptop camera'),
    dev('audiooutput', 'spk-a', 'Speakers'),
    dev('audiooutput', 'spk-b', 'Headphones'),
  ];
  input = { mic: { deviceId: 'mic-a', label: 'Desk mic' }, camera: { deviceId: 'cam-a', label: 'Laptop camera' } };
  setInputDevicesAsync = vi.fn((d: { audioDeviceId?: string; videoDeviceId?: string }) => {
    if (d.audioDeviceId) this.input = { ...this.input, mic: { deviceId: d.audioDeviceId, label: d.audioDeviceId } };
    return Promise.resolve({});
  });
  on(e: string, h: Handler) {
    this.handlers.set(e, [...(this.handlers.get(e) ?? []), h]);
    return this;
  }
  off(e: string, h: Handler) {
    this.handlers.set(e, (this.handlers.get(e) ?? []).filter((x) => x !== h));
    return this;
  }
  emit(e: string, p?: unknown) {
    for (const h of this.handlers.get(e) ?? []) h(p);
  }
  enumerateDevices() {
    return Promise.resolve({ devices: this.devices });
  }
  getInputDevices() {
    return Promise.resolve(this.input);
  }
  participants() {
    return this.people;
  }
  updateReceiveSettings() {
    return Promise.resolve();
  }
  setLocalAudio() {}
  setLocalVideo() {}
}

const names = { microphone: 'Microphone', camera: 'Camera', speaker: 'Speaker' };

beforeAll(() => {
  (globalThis as unknown as { MediaStream: unknown }).MediaStream = class {
    tracks: MediaStreamTrack[];
    constructor(t: MediaStreamTrack[]) {
      this.tracks = t;
    }
    getTracks() {
      return this.tracks;
    }
  };
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

afterEach(() => {
  delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
});

describe('the drawn screen devices', () => {
  it('lists real devices only, naming the nameless ones', () => {
    const list = [dev('audioinput', 'default', 'Default'), dev('audioinput', 'communications'), dev('audioinput', 'x'), dev('audioinput', 'y', 'USB mic')];
    expect(devicesOfKind(list, 'audioinput', 'Microphone')).toEqual([
      { id: 'x', label: 'Microphone 1' },
      { id: 'y', label: 'USB mic' },
    ]);
  });

  it('offers a speaker choice only where the browser can send sound to one', () => {
    expect(speakerChoiceSupported()).toBe(false);
    (HTMLMediaElement.prototype as unknown as { setSinkId: unknown }).setSinkId = () => Promise.resolve();
    expect(speakerChoiceSupported()).toBe(true);
  });

  it('switches the microphone through Daily and does not call the person\'s own choice news', async () => {
    const call = new DeviceCall();
    const { result } = renderHook(() => useDrawnDevices(call as unknown as DailyCall, names));
    await waitFor(() => expect(result.current.micId).toBe('mic-a'));
    expect(result.current.microphones.map((m) => m.id)).toEqual(['mic-a', 'mic-b']);

    act(() => result.current.choose('microphone', 'mic-b'));
    expect(call.setInputDevicesAsync).toHaveBeenCalledWith({ audioDeviceId: 'mic-b' });
    await waitFor(() => expect(result.current.micId).toBe('mic-b'));
    expect(result.current.notice).toBeNull();
  });

  it('says so when a device is pulled out mid-call and the call moves to another', async () => {
    const call = new DeviceCall();
    const { result } = renderHook(() => useDrawnDevices(call as unknown as DailyCall, names));
    await waitFor(() => expect(result.current.micId).toBe('mic-a'));

    call.devices = call.devices.filter((d) => d.deviceId !== 'mic-a');
    call.input = { ...call.input, mic: { deviceId: 'mic-b', label: 'Headset mic' } };
    await act(async () => call.emit('available-devices-updated'));
    await waitFor(() => expect(result.current.notice).toEqual({ kind: 'microphone', label: 'Headset mic' }));
  });

  it('falls back to the system speaker, and says so, when the chosen one is unplugged', async () => {
    (HTMLMediaElement.prototype as unknown as { setSinkId: unknown }).setSinkId = () => Promise.resolve();
    const call = new DeviceCall();
    const { result } = renderHook(() => useDrawnDevices(call as unknown as DailyCall, names));
    await waitFor(() => expect(result.current.canChooseSpeaker).toBe(true));
    act(() => result.current.choose('speaker', 'spk-b'));
    expect(result.current.speakerId).toBe('spk-b');

    call.devices = call.devices.filter((d) => d.deviceId !== 'spk-b');
    await act(async () => call.emit('available-devices-updated'));
    await waitFor(() => expect(result.current.speakerId).toBe(''));
    expect(result.current.notice).toEqual({ kind: 'speaker', label: null });
  });
});

describe('the drawn stage with devices', () => {
  it('opens the microphone list from the arrow and switches on a click', async () => {
    const call = new DeviceCall();
    render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} />);
    const arrow = await screen.findByRole('button', { name: 'Microphone and speaker' });
    fireEvent.click(arrow);
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual(['Desk mic', 'Headset mic']);
    expect(items[0]!.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(items[1]!);
    expect(call.setInputDevicesAsync).toHaveBeenCalledWith({ audioDeviceId: 'mic-b' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it("switches the camera through the call's own setDevices, so a busy-camera notice clears once it works", async () => {
    const setDevices = vi.fn();
    const call = new DeviceCall();
    call.devices = [...call.devices, dev('videoinput', 'cam-b', 'USB camera')];
    render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} setDevices={setDevices} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Camera' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'USB camera' }));
    expect(setDevices).toHaveBeenCalledWith({ videoDeviceId: 'cam-b' });
    expect(call.setInputDevicesAsync).not.toHaveBeenCalled();
  });

  it('offers "Hear the call" when the browser holds the sound back, and clears it once it plays', async () => {
    let allow = false;
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: () => (allow ? Promise.resolve() : Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))),
    });
    const call = new DeviceCall();
    call.people = {
      ...call.people,
      m: { session_id: 'm', user_name: 'Maria', local: false, tracks: { audio: { state: 'playable', persistentTrack: { id: 'a1', kind: 'audio' } } } },
    };
    render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} />);
    const hear = await screen.findByRole('button', { name: 'Hear the call' });
    allow = true;
    fireEvent.click(hear);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Hear the call' })).toBeNull());
  });
});

describe('a device that will not start', () => {
  it('says so, and names the device the call kept', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const call = new DeviceCall();
      call.devices = [...call.devices, dev('videoinput', 'cam-b', 'OBS Virtual Camera')];
      // Daily resolves but stays on the old camera (the new one is held by another app).
      const setDevices = vi.fn();
      const { result } = renderHook(() => useDrawnDevices(call as unknown as DailyCall, names, setDevices));
      await waitFor(() => expect(result.current.cameras).toHaveLength(2));
      act(() => result.current.choose('camera', 'cam-b'));
      await act(async () => {
        vi.advanceTimersByTime(2600);
      });
      await waitFor(() => expect(result.current.notice).toEqual({ kind: 'camera', label: 'OBS Virtual Camera', failed: true, kept: 'Laptop camera' }));
    } finally {
      vi.useRealTimers();
    }
  });
});
