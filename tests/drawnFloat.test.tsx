import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DailyCall } from '@daily-co/daily-js';
import { DrawnStage } from '../src/components/DrawnStage';
import { copyStyles } from '../src/drawnFloat';

type Handler = (event?: unknown) => void;
class FloatCall {
  handlers = new Map<string, Handler[]>();
  audio: boolean[] = [];
  left = 0;
  on(e: string, h: Handler) {
    this.handlers.set(e, [...(this.handlers.get(e) ?? []), h]);
    return this;
  }
  off(e: string, h: Handler) {
    this.handlers.set(e, (this.handlers.get(e) ?? []).filter((x) => x !== h));
    return this;
  }
  participants() {
    return {
      local: { session_id: 'me', user_name: 'Ada', local: true, tracks: { audio: { state: 'playable' }, video: { state: 'off' } } },
      m: { session_id: 'm', user_name: 'Maria', local: false, tracks: { video: { state: 'off' } } },
    };
  }
  getInputSettings() {
    return Promise.resolve({});
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
  setLocalAudio(on: boolean) {
    this.audio.push(on);
  }
  setLocalVideo() {}
}

/** A stand-in floating window: its own document, closable, firing pagehide like Chrome's. */
function fakePip() {
  const doc = document.implementation.createHTMLDocument('float');
  const listeners: Array<() => void> = [];
  const win = {
    document: doc,
    closed: false,
    addEventListener: (e: string, h: () => void) => {
      if (e === 'pagehide') listeners.push(h);
    },
    close: () => {
      win.closed = true;
      listeners.forEach((h) => h());
    },
  };
  const requestWindow = vi.fn(() => Promise.resolve(win as unknown as Window));
  (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture = { requestWindow, window: null };
  return { win, doc, requestWindow };
}

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});
afterEach(() => {
  delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture;
});

const stage = (call: FloatCall, onLeave = () => {}) =>
  render(<DrawnStage call={call as unknown as DailyCall} onLeave={onLeave} onUseStandard={() => {}} />);

describe('the floating window', () => {
  it('is not offered where the browser has no Document Picture-in-Picture', () => {
    stage(new FloatCall());
    expect(screen.queryByRole('button', { name: 'Pop the call out into a small window' })).toBeNull();
  });

  it('pops the call out at 360x420 with icon buttons that work, and comes back on Back to the tab', async () => {
    const { doc, requestWindow } = fakePip();
    const call = new FloatCall();
    stage(call);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pop the call out into a small window' }));
    });
    expect(requestWindow).toHaveBeenCalledWith({ width: 360, height: 420 });
    expect(screen.getByText('Your call is in the small window')).toBeTruthy();

    const btn = (name: string) => doc.body.querySelector(`button[aria-label="${name}"]`) as HTMLElement;
    expect(doc.body.textContent).toContain('Maria');
    act(() => btn('Mute').click());
    expect(call.audio).toEqual([false]);

    act(() => {
      btn('Back to the tab').click();
    });
    expect(screen.queryByText('Your call is in the small window')).toBeNull();
    expect(doc.body.textContent).toBe('');
  });

  it('comes back when the person closes the window itself', async () => {
    const { win } = fakePip();
    stage(new FloatCall());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pop the call out into a small window' }));
    });
    act(() => win.close());
    expect(screen.queryByText('Your call is in the small window')).toBeNull();
  });

  it('leaving from the window closes it and leaves the call', async () => {
    const { doc, win } = fakePip();
    const onLeave = vi.fn();
    stage(new FloatCall(), onLeave);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pop the call out into a small window' }));
    });
    act(() => {
      (doc.body.querySelector('button[aria-label="Leave"]') as HTMLElement).click();
    });
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(win.closed).toBe(true);
  });

  it('says so when the window cannot open', async () => {
    (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture = { requestWindow: () => Promise.reject(new Error('no gesture')), window: null };
    stage(new FloatCall());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pop the call out into a small window' }));
    });
    expect(screen.getByText('The small window could not open. Try Pop out again.')).toBeTruthy();
  });

  it('remembers "Pop out when I switch tabs" on this device', () => {
    fakePip();
    window.localStorage.removeItem('ve_auto_float');
    stage(new FloatCall());
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const auto = screen.getByRole('menuitemcheckbox', { name: /Pop out when I switch tabs/ });
    expect(auto.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(auto);
    expect(window.localStorage.getItem('ve_auto_float')).toBe('off');
    window.localStorage.removeItem('ve_auto_float');
  });

  it('copies the page styles into the window', () => {
    const style = document.createElement('style');
    style.textContent = '.ve-float { color: red; }';
    document.head.appendChild(style);
    const to = document.implementation.createHTMLDocument('x');
    copyStyles(document, to);
    expect(to.head.innerHTML).toContain('.ve-float');
    style.remove();
  });
});

describe('the corner window (compact)', () => {
  it('draws the call small with Back to the call and the clock, and no full bar', () => {
    const onBack = vi.fn();
    const call = new FloatCall();
    render(
      <DrawnStage
        call={call as unknown as DailyCall}
        compact={{ onBack, clock: <span>12:04</span> }}
        onLeave={() => {}}
        onUseStandard={() => {}}
      />,
    );
    expect(screen.getByText('12:04')).toBeTruthy();
    expect(screen.getByText('Maria')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the call' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(call.audio).toEqual([false]);
  });
});
