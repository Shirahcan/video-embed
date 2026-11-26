import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DailyCall } from '@daily-co/daily-js';
import { drawnSupport } from '../src/drawnEffects';
import { DrawnStage } from '../src/components/DrawnStage';

type Handler = (event?: unknown) => void;
class EffectsCall {
  static support = { supportsScreenShare: true, supportsAudioProcessing: true, supportsVideoProcessing: true };
  static supportedBrowser() {
    return EffectsCall.support;
  }
  handlers = new Map<string, Handler[]>();
  shares: string[] = [];
  inputs: unknown[] = [];
  refuse = false;
  sharing = false;
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
  participants() {
    const screenVideo = this.sharing ? { state: 'playable', persistentTrack: { id: 'scr', kind: 'video' } } : { state: 'off' };
    return {
      local: { session_id: 'me', user_name: 'Ada', local: true, tracks: { video: { state: 'off' }, screenVideo } },
      m: { session_id: 'm', user_name: 'Maria', local: false, tracks: {} },
    };
  }
  startScreenShare(o: unknown) {
    this.shares.push(`start ${JSON.stringify(o)}`);
  }
  stopScreenShare() {
    this.shares.push('stop');
  }
  getInputSettings() {
    return Promise.resolve({ audio: { processor: { type: 'none' } }, video: { processor: { type: 'none' } } });
  }
  updateInputSettings(s: unknown) {
    this.inputs.push(s);
    return this.refuse ? Promise.reject(new Error('no')) : Promise.resolve(s);
  }
  enumerateDevices() {
    return Promise.resolve({ devices: [] });
  }
  getInputDevices() {
    return Promise.resolve({ mic: {}, camera: {} });
  }
  updateReceiveSettings() {
    return Promise.resolve();
  }
  sendAppMessage() {
    return this;
  }
  setLocalAudio() {}
  setLocalVideo() {}
}

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  // jsdom has no MediaStream: a tile with live video wraps its track in one.
  (globalThis as unknown as { MediaStream: unknown }).MediaStream ??= class {
    constructor(private tracks: unknown[] = []) {}
    getTracks() {
      return this.tracks;
    }
  };
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia: () => Promise.resolve(null) } });
});
afterEach(() => {
  EffectsCall.support = { supportsScreenShare: true, supportsAudioProcessing: true, supportsVideoProcessing: true };
});

const stage = (call: EffectsCall) => render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} />);

describe('presenting on the drawn screen', () => {
  it('offers Present only where the browser can share a screen', () => {
    EffectsCall.support = { ...EffectsCall.support, supportsScreenShare: false };
    expect(drawnSupport(new EffectsCall() as unknown as DailyCall).present).toBe(false);
    EffectsCall.support = { ...EffectsCall.support, supportsScreenShare: true };
    expect(drawnSupport(new EffectsCall() as unknown as DailyCall).present).toBe(true);
  });

  it('starts presenting with tab sound and never this tab, then says so with Stop presenting', () => {
    const call = new EffectsCall();
    stage(call);
    fireEvent.click(screen.getByRole('button', { name: 'Present' }));
    expect(call.shares[0]).toContain('"audio":true');
    expect(call.shares[0]).toContain('"selfBrowserSurface":"exclude"');

    call.sharing = true;
    act(() => call.emit('participant-updated'));
    expect(screen.getByText('You are presenting to everyone.')).toBeTruthy();
    // Your own screen is never drawn back to you.
    expect(screen.queryByText(/is presenting/)).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Stop presenting' })[0] as HTMLElement);
    expect(call.shares).toContain('stop');
  });
});

describe('effects on the drawn screen', () => {
  it('turns noise reduction and blur on from More, as switches', async () => {
    const call = new EffectsCall();
    stage(call);
    await act(async () => {}); // the call's current settings are read first
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const noise = screen.getByRole('menuitemcheckbox', { name: /Reduce background noise/ });
    expect(noise.getAttribute('aria-checked')).toBe('false');
    await act(async () => {
      fireEvent.click(noise);
    });
    expect(call.inputs[0]).toEqual({ audio: { processor: { type: 'noise-cancellation' } } });
    expect(screen.getByRole('menuitemcheckbox', { name: /Reduce background noise/ }).getAttribute('aria-checked')).toBe('true');

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Blur my background/ }));
    });
    expect(call.inputs[1]).toEqual({ video: { processor: { type: 'background-blur', config: { strength: 0.6 } } } });
  });

  it('puts an effect back and says so when the browser refuses it', async () => {
    const call = new EffectsCall();
    call.refuse = true;
    stage(call);
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Blur my background/ }));
    });
    expect(screen.getByText('Your background could not be blurred in this browser.')).toBeTruthy();
    expect(screen.getByRole('menuitemcheckbox', { name: /Blur my background/ }).getAttribute('aria-checked')).toBe('false');
  });

  it('hides effects this browser cannot run', () => {
    EffectsCall.support = { supportsScreenShare: true, supportsAudioProcessing: false, supportsVideoProcessing: false };
    stage(new EffectsCall());
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.queryByRole('menuitemcheckbox', { name: /noise|blur/i })).toBeNull();
  });
});

describe('your own video on the drawn screen', () => {
  it('is mirrored by default, and "Mirror my video" shows the true image, remembered on this device', () => {
    window.localStorage.removeItem('ve_mirror_self');
    const call = new EffectsCall();
    (call as unknown as { participants: () => unknown }).participants = () => ({
      local: { session_id: 'me', user_name: 'Ada', local: true, tracks: { video: { state: 'playable', persistentTrack: { id: 'v', kind: 'video' } } } },
      m: { session_id: 'm', user_name: 'Maria', local: false, tracks: {} },
    });
    const { container } = stage(call);
    const selfTile = () => container.querySelector('[data-person="me"]');
    expect(selfTile()?.className).toContain('ve-tile--mirror');

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const mirror = screen.getByRole('menuitemcheckbox', { name: /Mirror my video/ });
    expect(mirror.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(mirror);
    expect(selfTile()?.className).not.toContain('ve-tile--mirror');
    expect(window.localStorage.getItem('ve_mirror_self')).toBe('off');
    // The other person is never flipped.
    expect(container.querySelector('[data-person="m"]')?.className).not.toContain('ve-tile--mirror');
    window.localStorage.removeItem('ve_mirror_self');
  });
});
