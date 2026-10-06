import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('never auto-rejoins someone a host removed', async () => {
    const fetchFreshUrl = vi.fn();
    render(<CallFrame url="https://shirah.daily.co/room?t=A" fetchFreshUrl={fetchFreshUrl} />);
    await waitFor(() => expect(frames.length).toBe(1));

    act(() => latest().emit('error', { errorMsg: 'x', error: { type: 'ejected', msg: 'x' } }));

    expect(await screen.findByText('You were removed from the call')).toBeTruthy();
    expect(fetchFreshUrl).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Rejoin the call' })).toBeNull();
  });

  it('shows the host who is knocking and lets them in', async () => {
    const onKnock = vi.fn();
    render(<CallFrame url="https://shirah.daily.co/room?t=HOST" onKnock={onKnock} />);
    await waitFor(() => expect(frames.length).toBe(1));

    act(() => {
      latest().waitingList = { w1: { id: 'w1', name: 'Maria Garcia' } };
      latest().emit('waiting-participant-added', { participant: { id: 'w1', name: 'Maria Garcia' } });
    });

    expect(await screen.findByText('Maria Garcia is asking to join')).toBeTruthy();
    expect(onKnock).toHaveBeenCalledWith({ id: 'w1', name: 'Maria Garcia' });

    fireEvent.click(screen.getByRole('button', { name: 'Let in' }));
    expect(latest().updates).toEqual([{ w1: { grantRequestedAccess: true } }]);
    expect(screen.queryByText('Maria Garcia is asking to join')).toBeNull();
  });

  it('turns a blocked microphone into the fix', async () => {
    render(<CallFrame url="https://shirah.daily.co/room?t=A" />);
    await waitFor(() => expect(frames.length).toBe(1));

    act(() => latest().emit('camera-error', { error: { type: 'permissions', msg: 'Permission denied by system' }, errorMsg: { errorMsg: 'x', audioOk: false } }));

    expect(await screen.findByText('Your computer is blocking the browser from the microphone')).toBeTruthy();
  });
});
