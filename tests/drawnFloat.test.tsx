import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyCall } from '@daily-co/daily-js';
import { DrawnStage } from '../src/components/DrawnStage';
import { APP_SWITCH_MIN_MS, APP_SWITCH_TIP_KEY, copyStyles, useAppSwitchTip } from '../src/drawnFloat';
import { foldControls } from '../src/barFold';

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

describe('leaving the call page (P3c)', () => {
  it('takes the call out to the screen, hides the corner, and closes it again on coming back', async () => {
    const pip = fakePip();
    const call = new FloatCall();
    const onFloated = vi.fn();
    const onBack = vi.fn();
    const el = (compact: boolean) => (
      <DrawnStage
        call={call as unknown as DailyCall}
        compact={compact ? { onBack, onFloated } : null}
        onLeave={() => {}}
        onUseStandard={() => {}}
      />
    );
    const view = render(el(false));
    await act(async () => {
      view.rerender(el(true));
    });
    expect(pip.requestWindow).toHaveBeenCalledTimes(1);
    expect(onFloated).toHaveBeenLastCalledWith(true);
    const back = pip.doc.querySelector('button[aria-label="Back to the call"]') as HTMLButtonElement;
    expect(back).toBeTruthy();
    back.click();
    expect(onBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      view.rerender(el(false));
    });
    expect(pip.win.closed).toBe(true);
  });

  it('stays in the corner when the browser has no recent click to allow the window', async () => {
    const pip = fakePip();
    (navigator as unknown as { userActivation?: unknown }).userActivation = { isActive: false };
    const call = new FloatCall();
    const el = (compact: boolean) => (
      <DrawnStage call={call as unknown as DailyCall} compact={compact ? { onBack: () => {} } : null} onLeave={() => {}} onUseStandard={() => {}} />
    );
    const view = render(el(false));
    await act(async () => {
      view.rerender(el(true));
    });
    expect(pip.requestWindow).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Back to the call' })).toBeTruthy();
    delete (navigator as unknown as { userActivation?: unknown }).userActivation;
  });
});

describe('a bar that never overflows (B1)', () => {
  const controls = [{ key: 'float', priority: 1 }, { key: 'present', priority: 2 }, { key: 'chat', priority: 3 }];
  const widths = { float: 60, present: 60, chat: 60 };

  it('keeps every control when the bar fits', () => {
    expect(foldControls(controls, widths, 300, 14, 600)).toEqual([]);
  });

  it('folds Pop out first, then Present, then Chat, and stops as soon as it fits', () => {
    // fixed 300 + 3 x 74 = 522
    expect(foldControls(controls, widths, 300, 14, 500)).toEqual(['float']);
    expect(foldControls(controls, widths, 300, 14, 430)).toEqual(['float', 'present']);
    expect(foldControls(controls, widths, 300, 14, 200)).toEqual(['float', 'present', 'chat']);
  });

  it("folds a product's panel (default priority 2) before Chat and People (F3)", () => {
    const withPanel = [...controls, { key: 'p:notes', priority: 2 }, { key: 'people', priority: 4 }];
    const w = { ...widths, 'p:notes': 60, people: 60 };
    // fixed 300 + 5 x 74 = 670; 600 needs one fold, 520 two: float, then the panel before chat.
    expect(foldControls(withPanel, w, 300, 14, 600)).toEqual(['float']);
    expect(foldControls(withPanel, w, 300, 14, 520).slice(0, 2)).toContain('float');
    expect(foldControls(withPanel, w, 300, 14, 380)).not.toContain('people');
  });

  it('moves a control that does not fit into More, where it still works', async () => {
    fakePip();
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(280);
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(620);
    try {
      stage(new FloatCall());
      expect(screen.queryByRole('button', { name: 'Pop the call out into a small window' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'More options' }));
      const items = screen.getAllByRole('menuitem').map((m) => m.textContent);
      expect(items).toEqual(expect.arrayContaining(['Pop the call out into a small window', 'Chat with everyone']));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Chat with everyone' }));
      expect(screen.getByRole('textbox')).toBeTruthy();
    } finally {
      width.mockRestore();
      scroll.mockRestore();
    }
  });

  it('keeps exactly four buttons in the floating window', async () => {
    const { doc } = fakePip();
    stage(new FloatCall());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pop the call out into a small window' }));
    });
    expect(doc.body.querySelectorAll('button')).toHaveLength(4);
  });
});


describe('the app-switch tip (owner 2026-11-27)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.removeItem(APP_SWITCH_TIP_KEY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function leaveAndReturn(ms: number) {
    act(() => {
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(1);
    });
    act(() => {
      vi.advanceTimersByTime(ms);
      window.dispatchEvent(new Event('focus'));
    });
  }

  it('says once, after someone was away in another app, that Pop out first keeps the call on top', () => {
    const { result } = renderHook(() => useAppSwitchTip(true));
    leaveAndReturn(APP_SWITCH_MIN_MS + 100);
    expect(result.current.show).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.show).toBe(false);
    expect(window.localStorage.getItem(APP_SWITCH_TIP_KEY)).toBe('seen');
  });

  it('does not show for a stray focus blip, once seen, or while the call cannot float', () => {
    const blip = renderHook(() => useAppSwitchTip(true));
    leaveAndReturn(500);
    expect(blip.result.current.show).toBe(false);
    blip.unmount();

    const off = renderHook(() => useAppSwitchTip(false));
    leaveAndReturn(APP_SWITCH_MIN_MS + 100);
    expect(off.result.current.show).toBe(false);
    off.unmount();

    window.localStorage.setItem(APP_SWITCH_TIP_KEY, 'seen');
    const seen = renderHook(() => useAppSwitchTip(true));
    leaveAndReturn(APP_SWITCH_MIN_MS + 100);
    expect(seen.result.current.show).toBe(false);
  });

  it('does not count a tab switch (the page was hidden, and the corner window handles that)', () => {
    const { result } = renderHook(() => useAppSwitchTip(true));
    act(() => {
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(1);
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    act(() => {
      vi.advanceTimersByTime(APP_SWITCH_MIN_MS + 100);
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current.show).toBe(false);
  });
});
