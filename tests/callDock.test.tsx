import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event?: unknown) => void;

class FakeFrame {
  handlers = new Map<string, Handler>();
  joins: string[] = [];
  people: Record<string, unknown> = {};
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
    return this.people;
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

import { CallDockProvider, useCallDock, type DockedCall, type DockedCallHandlers } from '../src/components/CallDock';
import { toCallParticipants } from '../src/hooks/useDailyFrame';

const latest = () => frames[frames.length - 1]!;

/** A call's page: registers the call and lays it over its placeholder. */
function Room({ call, handlers, anchored = true }: { call: DockedCall; handlers?: DockedCallHandlers; anchored?: boolean }) {
  const dock = useCallDock();
  useEffect(() => {
    dock.start(call, handlers);
  });
  return anchored ? <div ref={dock.setAnchor} style={{ width: 400, height: 300 }} /> : null;
}

describe('toCallParticipants', () => {
  it('flattens Daily participants into who is in the call', () => {
    expect(
      toCallParticipants({
        local: { session_id: 'a', user_name: ' Ada ', local: true, audio: true, video: false },
        b: { session_id: 'b', user_name: 'Bo', audio: false, video: true },
      }),
    ).toEqual([
      { id: 'a', name: 'Ada', local: true, audio: true, video: false },
      { id: 'b', name: 'Bo', local: false, audio: false, video: true },
    ]);
  });
});

describe('CallDockProvider', () => {
  beforeEach(() => {
    frames.length = 0;
    window.localStorage.clear();
  });

  it('keeps the first join URL for the same call, so a fresh pass never rebuilds it', async () => {
    const { rerender } = render(
      <CallDockProvider navigate={() => {}}>
        <Room call={{ key: 'c1', url: 'https://x.daily.co/room?t=one', returnHref: '/room' }} />
      </CallDockProvider>,
    );
    await waitFor(() => expect(frames).toHaveLength(1));
    rerender(
      <CallDockProvider navigate={() => {}}>
        <Room call={{ key: 'c1', url: 'https://x.daily.co/room?t=two', returnHref: '/room' }} />
      </CallDockProvider>,
    );
    await waitFor(() => expect(latest().joins).toEqual(['https://x.daily.co/room?t=one']));
    expect(frames).toHaveLength(1);
  });

  it('follows the person once they joined, and shows the mini-player away from the page', async () => {
    const navigate = vi.fn();
    const people = vi.fn();
    const call = { key: 'c1', url: 'https://x.daily.co/room?t=one', returnHref: '/room' };
    const { rerender, container } = render(
      <CallDockProvider navigate={navigate}>
        <Room call={call} handlers={{ onParticipantsChange: people }} />
      </CallDockProvider>,
    );
    await waitFor(() => expect(frames).toHaveLength(1));
    latest().people = { local: { session_id: 's', user_name: 'Ada', local: true, audio: true, video: true } };
    act(() => latest().emit('joined-meeting'));
    expect(people).toHaveBeenLastCalledWith([{ id: 's', name: 'Ada', local: true, audio: true, video: true }]);

    // The page goes away (navigation): the call stays, parked in the corner.
    rerender(
      <CallDockProvider navigate={navigate}>
        <Room call={call} anchored={false} />
      </CallDockProvider>,
    );
    await waitFor(() => expect(container.querySelector('[data-minimized="true"]')).not.toBeNull());
    expect(frames).toHaveLength(1);
    act(() => screen.getByText('Back to call').click());
    expect(navigate).toHaveBeenCalledWith('/room');
  });

  it('never parks a call nobody joined', async () => {
    const call = { key: 'c1', url: 'https://x.daily.co/room?t=one', returnHref: '/room' };
    const { rerender, container } = render(
      <CallDockProvider navigate={() => {}}>
        <Room call={call} />
      </CallDockProvider>,
    );
    await waitFor(() => expect(frames).toHaveLength(1));
    rerender(
      <CallDockProvider navigate={() => {}}>
        <Room call={call} anchored={false} />
      </CallDockProvider>,
    );
    await waitFor(() => expect(container.querySelector('.ve-dock')).toBeNull());
  });
});
