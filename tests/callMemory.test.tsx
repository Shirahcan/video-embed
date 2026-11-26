import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event?: unknown) => void;

/** A stand-in for a Daily frame: records joins, lets a test fire Daily's events. */
class FakeFrame {
  handlers = new Map<string, Handler>();
  joins: string[] = [];
  names: Array<string | undefined> = [];
  waitingList: Record<string, { id: string; name: string }> = {};
  updates: Array<Record<string, { grantRequestedAccess: boolean }>> = [];
  on(event: string, handler: Handler) {
    this.handlers.set(event, handler);
    return this;
  }
  emit(event: string, payload?: unknown) {
    this.handlers.get(event)?.(payload);
  }
  quiet: boolean[] = [];
  async join({ url, userName, startAudioOff }: { url: string; userName?: string; startAudioOff?: boolean }) {
    this.joins.push(url);
    this.names.push(userName);
    this.quiet.push(Boolean(startAudioOff));
  }
  left = 0;
  people: Record<string, unknown> = {};
  async leave() {
    this.left += 1;
    this.emit('left-meeting');
  }
  async destroy() {}
  participants() {
    return this.people;
  }
  waitingParticipants() {
    return this.waitingList;
  }
  async updateWaitingParticipants(u: Record<string, { grantRequestedAccess: boolean }>) {
    this.updates.push(u);
    return { ids: Object.keys(u) };
  }
  async setInputDevicesAsync() {}
}

const frames: FakeFrame[] = [];

vi.mock('@daily-co/daily-js', () => ({
  default: {
    getCallInstance: () => undefined,
    createFrame: () => {
      const f = new FakeFrame();
      frames.push(f);
      return f;
    },
  },
}));

import { renderHook } from '@testing-library/react';
import { CallFrame } from '../src/components/CallFrame';
import { CallInAnotherTabNotice } from '../src/components/CallInAnotherTabNotice';
import { callRunningInAnotherTab, forgetInCall, rememberInCall, wasInCallRecently } from '../src/callMemory';
import { useSingleTabCall } from '../src/hooks/useSingleTabCall';

const latest = () => frames[frames.length - 1]!;

describe('the call beyond the page', () => {
  beforeEach(() => {
    frames.length = 0;
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.useRealTimers();
  });

  it('remembers the call in this tab for a reload, only for its own key and only for a while', () => {
    vi.useFakeTimers();
    rememberInCall('meeting:1');
    expect(wasInCallRecently('meeting:1')).toBe(true);
    expect(wasInCallRecently('meeting:2')).toBe(false);
    forgetInCall('meeting:2');
    expect(wasInCallRecently('meeting:1')).toBe(true);
    vi.advanceTimersByTime(3 * 60_000);
    expect(wasInCallRecently('meeting:1')).toBe(false);
    rememberInCall('meeting:1');
    forgetInCall('meeting:1');
    expect(wasInCallRecently('meeting:1')).toBe(false);
  });

  it('sees a live call lock from another tab, never a stale one and never its own', () => {
    window.localStorage.setItem('ve_call_lock:https://shirah.daily.co/r', JSON.stringify({ tabId: 'other', ts: Date.now() - 60_000 }));
    expect(callRunningInAnotherTab()).toBe(false);
    window.localStorage.setItem('ve_call_lock:https://shirah.daily.co/r', JSON.stringify({ tabId: 'other', ts: Date.now() }));
    expect(callRunningInAnotherTab()).toBe(true);

    window.localStorage.clear();
    const own = renderHook(() => useSingleTabCall('https://shirah.daily.co/mine'));
    expect(window.localStorage.getItem('ve_call_lock:https://shirah.daily.co/mine')).not.toBeNull();
    expect(callRunningInAnotherTab()).toBe(false);
    own.unmount();
  });

  it('says so on any page of the other tab, and draws nothing when off', () => {
    window.localStorage.setItem('ve_call_lock:https://shirah.daily.co/r', JSON.stringify({ tabId: 'other', ts: Date.now() }));
    const { rerender } = render(<CallInAnotherTabNotice />);
    expect(screen.getByText('Your call is running in another tab.')).toBeTruthy();
    rerender(<CallInAnotherTabNotice enabled={false} />);
    expect(screen.queryByText('Your call is running in another tab.')).toBeNull();
  });

  it('remembers the call once joined, forgets it on leaving, and asks before closing only while in it', async () => {
    render(<CallFrame url="https://shirah.daily.co/room?t=M" rememberAs="meeting:7" confirmLeave />);
    await waitFor(() => expect(latest().joins).toEqual(['https://shirah.daily.co/room?t=M']));

    const before = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);
    expect(wasInCallRecently('meeting:7')).toBe(false);

    act(() => latest().emit('joined-meeting'));
    expect(wasInCallRecently('meeting:7')).toBe(true);
    const during = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);

    act(() => latest().emit('left-meeting'));
    expect(wasInCallRecently('meeting:7')).toBe(false);
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('never asks or remembers unless the product says so', async () => {
    render(<CallFrame url="https://shirah.daily.co/room?t=N" />);
    await waitFor(() => expect(latest().joins).toEqual(['https://shirah.daily.co/room?t=N']));
    act(() => latest().emit('joined-meeting'));
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('forgets the call when the frame leaves the app', async () => {
    const view = render(<CallFrame url="https://shirah.daily.co/room?t=U" rememberAs="meeting:9" />);
    await waitFor(() => expect(latest().joins).toEqual(['https://shirah.daily.co/room?t=U']));
    act(() => latest().emit('joined-meeting'));
    expect(wasInCallRecently('meeting:9')).toBe(true);
    view.unmount();
    expect(wasInCallRecently('meeting:9')).toBe(false);
  });
});
