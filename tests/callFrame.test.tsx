import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event?: unknown) => void;

/** A stand-in for a Daily frame: records joins, lets a test fire Daily's events. */
class FakeFrame {
  handlers = new Map<string, Handler>();
  joins: string[] = [];
  waitingList: Record<string, { id: string; name: string }> = {};
  updates: Array<Record<string, { grantRequestedAccess: boolean }>> = [];
  on(event: string, handler: Handler) {
    this.handlers.set(event, handler);
    return this;
  }
  emit(event: string, payload?: unknown) {
    this.handlers.get(event)?.(payload);
  }
  async join({ url }: { url: string }) {
    this.joins.push(url);
  }
  async destroy() {}
  participants() {
    return {};
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

import { CallFrame } from '../src/components/CallFrame';

const latest = () => frames[frames.length - 1]!;

describe('CallFrame', () => {
  beforeEach(() => {
    frames.length = 0;
  });

  it('repairs an expired room once by itself and rejoins on the fresh URL', async () => {
    const fetchFreshUrl = vi.fn().mockResolvedValue('https://shirah.daily.co/room?t=NEW');
    const onFailure = vi.fn();
    render(<CallFrame url="https://shirah.daily.co/room?t=OLD" fetchFreshUrl={fetchFreshUrl} onFailure={onFailure} />);

    await waitFor(() => expect(latest().joins).toEqual(['https://shirah.daily.co/room?t=OLD']));
    act(() => latest().emit('error', { errorMsg: 'Meeting has ended', error: { type: 'exp-room', msg: 'Meeting has ended' } }));

    await waitFor(() => expect(fetchFreshUrl).toHaveBeenCalledWith('room-expired'));
    await waitFor(() => expect(latest().joins).toEqual(['https://shirah.daily.co/room?t=NEW']));
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ kind: 'room-expired' }), 'repaired');
  });

  it('reads a plain-object join() rejection and reports a failure once', async () => {
    const onFailure = vi.fn();
    const proto = FakeFrame.prototype as unknown as { join: (o: { url: string }) => Promise<void> };
    const original = proto.join;
    proto.join = async function (this: FakeFrame) {
      this.emit('error', { errorMsg: 'Meeting has ended', error: { type: 'exp-room', msg: 'Meeting has ended' } });
      throw { errorMsg: 'Meeting has ended', error: { type: 'exp-room', msg: 'Meeting has ended' } };
    };
    try {
      render(<CallFrame url="https://shirah.daily.co/room?t=A" onFailure={onFailure} />);
      await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
      expect(onFailure.mock.calls[0]?.[0]).toEqual({ kind: 'room-expired', message: 'Meeting has ended' });
    } finally {
      proto.join = original;
    }
  });

  it('never auto-rejoins someone a host removed', async () => {
    const fetchFreshUrl = vi.fn();
    render(<CallFrame url="https://shirah.daily.co/room?t=A" fetchFreshUrl={fetchFreshUrl} />);
    await waitFor(() => expect(frames.length).toBe(1));

    act(() => latest().emit('error', { errorMsg: 'x', error: { type: 'ejected', msg: 'x' } }));

    expect(await screen.findByText('You were removed from the call')).toBeTruthy();
    expect(fetchFreshUrl).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Rejoin the call' })).toBeNull();
  });

  it('tells the host who is knocking and where to let them in, without calling call-object APIs', async () => {
    const onKnock = vi.fn();
    render(<CallFrame url="https://shirah.daily.co/room?t=HOST" onKnock={onKnock} />);
    await waitFor(() => expect(frames.length).toBe(1));
    const spy = vi.spyOn(latest(), 'waitingParticipants');

    act(() => latest().emit('waiting-participant-added', { participant: { id: 'w1', name: 'Maria Garcia' } }));

    expect(await screen.findByText('Maria Garcia is asking to join')).toBeTruthy();
    expect(screen.getByText('Let them in from the request shown inside the call.')).toBeTruthy();
    expect(onKnock).toHaveBeenCalledWith({ id: 'w1', name: 'Maria Garcia' });
    expect(spy).not.toHaveBeenCalled();

    act(() => latest().emit('waiting-participant-removed', { participant: { id: 'w1', name: 'Maria Garcia' } }));
    await waitFor(() => expect(screen.queryByText('Maria Garcia is asking to join')).toBeNull());
  });

  it('turns a blocked microphone into the fix', async () => {
    render(<CallFrame url="https://shirah.daily.co/room?t=A" />);
    await waitFor(() => expect(frames.length).toBe(1));

    act(() => latest().emit('camera-error', { error: { type: 'permissions', msg: 'Permission denied by system' }, errorMsg: { errorMsg: 'x', audioOk: false } }));

    expect(await screen.findByText('Your computer is blocking the browser from the microphone')).toBeTruthy();
  });
  it('lets a host end the call for everyone after confirming, then reads ended', async () => {
    const onEnd = vi.fn().mockResolvedValue(undefined);
    const onEnded = vi.fn();
    render(<CallFrame url="https://shirah.daily.co/room?t=HOST" onEndForEveryone={onEnd} onEnded={onEnded} />);
    await waitFor(() => expect(frames.length).toBe(1));
    act(() => latest().emit('joined-meeting'));

    act(() => screen.getByRole('button', { name: 'End for everyone' }).click());
    expect(await screen.findByText('End the call for everyone?')).toBeTruthy();
    expect(onEnd).not.toHaveBeenCalled();

    const confirm = screen.getAllByRole('button', { name: 'End for everyone' }).at(-1)!;
    act(() => confirm.click());
    await waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('This call has ended')).toBeTruthy();
    expect(screen.getByText('You ended the call for everyone.')).toBeTruthy();
    expect(onEnded).toHaveBeenCalledWith('by-me');

    // The host's own ejection that follows is not a failure to repair.
    act(() => latest().emit('error', { errorMsg: 'You were ejected', error: { type: 'ejected', msg: 'ejected' } }));
    expect(screen.queryByText('You were removed from the call')).toBeNull();
  });

  it('reads the host\'s own eject, arriving before the End request answers, as the end landing', async () => {
    let finish: () => void = () => {};
    const onEnd = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onEnded = vi.fn();
    render(<CallFrame url="https://shirah.daily.co/room?t=HOST" onEndForEveryone={onEnd} onEnded={onEnded} />);
    await waitFor(() => expect(frames.length).toBe(1));
    act(() => latest().emit('joined-meeting'));

    act(() => screen.getByRole('button', { name: 'End for everyone' }).click());
    act(() => screen.getAllByRole('button', { name: 'End for everyone' }).at(-1)!.click());
    await waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));

    // The service ejects everyone first: Daily reports the eject and the leave.
    act(() => latest().emit('error', { errorMsg: 'You were ejected', error: { type: 'ejected', msg: 'ejected' } }));
    act(() => latest().emit('left-meeting'));
    expect(screen.queryByText('You were removed from the call')).toBeNull();
    expect(screen.queryByText('You left the call. Is it over?')).toBeNull();

    await act(async () => { finish(); });
    expect(await screen.findByText('You ended the call for everyone.')).toBeTruthy();
    expect(onEnded).toHaveBeenCalledWith('by-me');
  });

  it('sends presence itself: join, a heartbeat each minute, and leave', async () => {
    vi.useFakeTimers();
    const presence = vi.fn().mockResolvedValue(undefined);
    render(<CallFrame url="https://shirah.daily.co/room?t=X" presence={presence} />);
    await vi.waitFor(() => expect(frames.length).toBe(1));

    act(() => latest().emit('joined-meeting'));
    expect(presence).toHaveBeenLastCalledWith('join');

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(presence).toHaveBeenLastCalledWith('heartbeat');

    act(() => latest().emit('left-meeting'));
    expect(presence).toHaveBeenLastCalledWith('leave');
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(presence).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('asks a host who left by the Leave button whether the call is over', async () => {
    const onEnd = vi.fn().mockResolvedValue(undefined);
    render(<CallFrame url="https://shirah.daily.co/room?t=HOST" onEndForEveryone={onEnd} />);
    await waitFor(() => expect(frames.length).toBe(1));
    act(() => latest().emit('joined-meeting'));
    act(() => latest().emit('left-meeting'));

    expect(await screen.findByText('You left the call. Is it over?')).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'Rejoin the call' }).click());
    await waitFor(() => expect(frames.length).toBe(2));
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('never offers ending to a guest, and reads a removal the product calls ended as ended', async () => {
    const fetchFreshUrl = vi.fn();
    const onEnded = vi.fn();
    render(<CallFrame url="https://shirah.daily.co/room?t=GUEST" fetchFreshUrl={fetchFreshUrl} checkEnded={() => Promise.resolve(true)} onEnded={onEnded} />);
    await waitFor(() => expect(frames.length).toBe(1));
    act(() => latest().emit('joined-meeting'));
    expect(screen.queryByRole('button', { name: 'End for everyone' })).toBeNull();

    act(() => latest().emit('left-meeting'));
    expect(screen.queryByText('You left the call. Is it over?')).toBeNull();

    act(() => latest().emit('error', { errorMsg: 'Meeting has ended', error: { type: 'exp-room', msg: 'Meeting has ended' } }));
    expect(await screen.findByText('This call has ended')).toBeTruthy();
    expect(fetchFreshUrl).not.toHaveBeenCalled();
    expect(onEnded).toHaveBeenCalledWith('ended');
  });
});
