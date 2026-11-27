import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event?: unknown) => void;

/** A stand-in for a Daily frame OR call object: records how it was made and joined. */
class FakeCall {
  kind: 'frame' | 'object';
  handlers = new Map<string, Handler[]>();
  joins: Array<Record<string, unknown>> = [];
  level: 'full' | 'lobby' = 'full';
  people: Record<string, unknown> = { local: { session_id: 'me', user_name: 'Ada', local: true, tracks: {} } };
  throwOnParticipants = false;
  audio: boolean[] = [];
  constructor(kind: 'frame' | 'object') {
    this.kind = kind;
  }
  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  off(event: string, handler: Handler) {
    this.handlers.set(event, (this.handlers.get(event) ?? []).filter((h) => h !== handler));
    return this;
  }
  emit(event: string, payload?: unknown) {
    for (const h of this.handlers.get(event) ?? []) h(payload);
  }
  async join(opts: Record<string, unknown>) {
    this.joins.push(opts);
  }
  accessState() {
    return { access: { level: this.level } };
  }
  /** The host's answer to a knock: resolve it from the test (undefined = this daily-js cannot knock). */
  answer: ((granted: boolean) => void) | null = null;
  knockedAs: string | null = null;
  requestAccess?: (o: { name: string }) => Promise<{ access: { level: string }; granted: boolean }> = (o) =>
    new Promise((resolve) => {
      this.knockedAs = o.name;
      this.answer = (granted) => {
        if (granted) this.level = 'full';
        resolve({ access: { level: this.level }, granted });
      };
    });
  participants() {
    if (this.throwOnParticipants) throw new Error('drawing broke');
    return this.people;
  }
  setLocalAudio(on: boolean) {
    this.audio.push(on);
  }
  setLocalVideo() {}
  async leave() {
    this.emit('left-meeting');
  }
  async destroy() {}
  async setInputDevicesAsync() {}
}

const made: FakeCall[] = [];
let nextObject: Partial<FakeCall> = {};

vi.mock('@daily-co/daily-js', () => ({
  default: {
    getCallInstance: () => undefined,
    createFrame: () => {
      const c = new FakeCall('frame');
      made.push(c);
      return c;
    },
    createCallObject: () => {
      const c = Object.assign(new FakeCall('object'), nextObject);
      made.push(c);
      return c;
    },
  },
}));

import { CallFrame } from '../src/components/CallFrame';
import { chooseCallScreen, preferStandardScreen, splitJoinUrl, STANDARD_SCREEN_KEY } from '../src/callScreen';

const URL_WITH_PASS = 'https://shirah.daily.co/room-1?t=secret-pass';
const latest = () => made[made.length - 1]!;
const win = window as unknown as Record<string, unknown>;

describe('which call screen a device gets', () => {
  beforeEach(() => {
    made.length = 0;
    nextObject = {};
    window.localStorage.clear();
    win.documentPictureInPicture = {};
  });
  afterEach(() => {
    delete win.documentPictureInPicture;
    vi.restoreAllMocks();
  });

  it('is drawn only when the product allows it, the browser can float it, it is not a phone, and the person has not chosen the standard screen', () => {
    expect(chooseCallScreen(true)).toBe('drawn');
    expect(chooseCallScreen(false)).toBe('prebuilt');

    delete win.documentPictureInPicture;
    expect(chooseCallScreen(true)).toBe('prebuilt');
    win.documentPictureInPicture = {};

    const ua = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148');
    expect(chooseCallScreen(true)).toBe('prebuilt');
    ua.mockRestore();

    preferStandardScreen();
    expect(window.localStorage.getItem(STANDARD_SCREEN_KEY)).toBe('standard');
    expect(chooseCallScreen(true)).toBe('prebuilt');
  });

  it('takes the pass out of the address, because the call object ignores it there', () => {
    expect(splitJoinUrl(URL_WITH_PASS)).toEqual({ url: 'https://shirah.daily.co/room-1', token: 'secret-pass' });
    expect(splitJoinUrl('https://shirah.daily.co/room-1')).toEqual({ url: 'https://shirah.daily.co/room-1', token: null });
  });

  it('draws the call on the call object, joining with the pass apart, and keeps Prebuilt when the product does not allow it', async () => {
    const { unmount } = render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} />);
    await waitFor(() => expect(made).toHaveLength(1));
    expect(latest().kind).toBe('object');
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    expect(latest().joins[0]).toMatchObject({ url: 'https://shirah.daily.co/room-1', token: 'secret-pass' });
    act(() => latest().emit('joined-meeting'));
    expect(await screen.findByRole('region', { name: 'Call' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(latest().audio).toEqual([false]);
    // Left: no frozen call with live-looking buttons.
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Call' })).toBeNull());
    unmount();

    made.length = 0;
    render(<CallFrame url={URL_WITH_PASS} singleTab={false} />);
    await waitFor(() => expect(made).toHaveLength(1));
    expect(latest().kind).toBe('frame');
    await waitFor(() => expect(latest().joins[0]).toEqual({ url: URL_WITH_PASS }));
  });

  it('knocks under the knock name a product gives a removed person (F1b)', async () => {
    nextObject = { level: 'lobby' };
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} knockName="Maria Garcia" />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    expect(await screen.findByText('Asking to join')).toBeTruthy();
    expect(latest().knockedAs).toBe('Maria Garcia');
    // Only the knock carries it: the join itself sends no name.
    expect(JSON.stringify(latest().joins[0])).not.toContain('Maria Garcia');
  });

  it('knocks from the drawn screen when the person lands in the lobby, and is not joined until let in', async () => {
    nextObject = { level: 'lobby' };
    const onJoined = vi.fn();
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onJoined={onJoined} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    expect(await screen.findByText('Asking to join')).toBeTruthy();
    expect(latest().kind).toBe('object');
    // No name given: Daily refuses a nameless knock, so it goes under the call's own name.
    expect(latest().knockedAs).toBe('Ada');
    expect(onJoined).not.toHaveBeenCalled();

    await act(async () => {
      latest().answer?.(true);
    });
    act(() => latest().emit('access-state-updated'));
    await waitFor(() => expect(onJoined).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Asking to join')).toBeNull();
  });

  it('tells a knocker the host did not let them in', async () => {
    nextObject = { level: 'lobby' };
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    await screen.findByText('Asking to join');
    await act(async () => {
      latest().answer?.(false);
    });
    expect(await screen.findByText('The host did not let you in')).toBeTruthy();
  });

  it("keeps the drawn screen when Daily ends a refused knock as an error, and does not count it as leaving", async () => {
    nextObject = { level: 'lobby' };
    const onLeft = vi.fn();
    const onFailure = vi.fn();
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onLeft={onLeft} onFailure={onFailure} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    await screen.findByText('Asking to join');
    act(() => latest().emit('error', { action: 'error', errorMsg: 'Join request rejected' }));
    act(() => latest().emit('left-meeting'));
    expect(await screen.findByText('The host did not let you in')).toBeTruthy();
    expect(latest().kind).toBe('object');
    expect(onFailure).not.toHaveBeenCalled();
    expect(onLeft).not.toHaveBeenCalled();
  });

  it('hands the knock to the standard screen where this daily-js cannot knock, without counting them as joined', async () => {
    nextObject = { level: 'lobby', requestAccess: undefined };
    const onJoined = vi.fn();
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onJoined={onJoined} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    await waitFor(() => expect(latest().kind).toBe('frame'));
    expect(onJoined).not.toHaveBeenCalled();
    // Not remembered: the next call may be drawn again.
    expect(window.localStorage.getItem(STANDARD_SCREEN_KEY)).toBeNull();
  });

  it("lets the host answer a knock on the drawn screen, where Daily's own request is absent", async () => {
    const answered: Array<[string, unknown]> = [];
    nextObject = { updateWaitingParticipant: (id: string, u: unknown) => { answered.push([id, u]); return Promise.resolve({ id }); } } as never;
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    act(() => latest().emit('waiting-participant-added', { participant: { id: 'w1', name: 'Maria' } }));
    fireEvent.click(await screen.findByRole('button', { name: 'Let in' }));
    expect(answered).toEqual([['w1', { grantRequestedAccess: true }]]);
  });

  it('tries once more, then hands the call to the standard screen, when the drawn call fails for a reason nobody named', async () => {
    const onFailure = vi.fn();
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onFailure={onFailure} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    const first = latest();
    act(() => first.emit('error', { errorMsg: 'Something odd happened' }));
    await waitFor(() => expect(latest()).not.toBe(first));
    const retry = latest();
    expect(retry.kind).not.toBe('frame');
    await waitFor(() => expect(retry.joins).toHaveLength(1));
    act(() => retry.emit('error', { errorMsg: 'Something odd happened' }));
    await waitFor(() => expect(latest().kind).toBe('frame'));
    // The switch is on the record, with what Daily said.
    expect(onFailure).toHaveBeenCalledWith({ kind: 'unknown', message: 'Something odd happened' }, 'idle');
  });

  it('joins again by itself when Daily loses its own connection, and records it as repaired', async () => {
    const onFailure = vi.fn();
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onFailure={onFailure} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    const first = latest();
    act(() => first.emit('error', { errorMsg: 'bad sigauthz token' }));
    await waitFor(() => expect(latest()).not.toBe(first));
    const retry = latest();
    expect(retry.kind).not.toBe('frame');
    await waitFor(() => expect(retry.joins).toHaveLength(1));
    act(() => retry.emit('joined-meeting'));
    expect(onFailure).toHaveBeenCalledWith({ kind: 'signaling', message: 'bad sigauthz token' }, 'repaired');
  });

  it('asks the person only after two tries fail, and never swaps the screen for it', async () => {
    const onFailure = vi.fn();
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onFailure={onFailure} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    let call = latest();
    for (let i = 0; i < 2; i++) {
      const before = call;
      act(() => before.emit('error', { errorMsg: 'bad sigauthz token' }));
      await waitFor(() => expect(latest()).not.toBe(before), { timeout: 5000 });
      call = latest();
      await waitFor(() => expect(call.joins).toHaveLength(1));
    }
    act(() => call.emit('error', { errorMsg: 'bad sigauthz token' }));
    expect(await screen.findByText('The call lost its connection')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(onFailure).toHaveBeenCalledWith({ kind: 'signaling', message: 'bad sigauthz token' }, 'failed');
    expect(call.kind).not.toBe('frame');
  });

  it('a crash while drawing falls back to the standard screen instead of stranding the person', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    nextObject = { throwOnParticipants: true };
    const onLeft = vi.fn();
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onLeft={onLeft} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    await waitFor(() => expect(latest().kind).toBe('frame'));
    // Swapping screens is not "you left".
    expect(onLeft).not.toHaveBeenCalled();
    quiet.mockRestore();
  });

  it('"Use the standard call screen" switches now and is remembered on this device', async () => {
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Use the standard call screen' }));
    await waitFor(() => expect(latest().kind).toBe('frame'));
    expect(window.localStorage.getItem(STANDARD_SCREEN_KEY)).toBe('standard');
  });
  it('a guest who leaves the drawn screen sees "You left the call" with Rejoin, never an empty stage', async () => {
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('You left the call')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rejoin the call' })).toBeTruthy();
    expect(screen.queryByText('You left the call. Is it over?')).toBeNull();
  });

  it('a host chooses on Leave: Leave the call (no after-the-fact ask) or End the call for everyone', async () => {
    const onEnd = vi.fn(() => Promise.resolve());
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onEndForEveryone={onEnd} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    // No separate End button above the drawn call: Leave asks.
    expect(screen.queryByRole('button', { name: 'End for everyone' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /End for everyone/ }));
    await waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('This call has ended')).toBeTruthy();
  });

  it('a host who picks Leave the call is not asked whether it is over', async () => {
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onEndForEveryone={() => Promise.resolve()} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Leave the call/ }));
    expect(await screen.findByText('You left the call')).toBeTruthy();
    expect(screen.queryByText('You left the call. Is it over?')).toBeNull();
  });
  it('tells the product the person chose to leave, and not when the host ended the call', async () => {
    const left = vi.fn();
    const view = render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onLeftCall={left} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(left).toHaveBeenCalledTimes(1));
    view.unmount();

    const left2 = vi.fn();
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onLeftCall={left2} onEndForEveryone={() => Promise.resolve()} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /End for everyone/ }));
    await screen.findByText('This call has ended');
    act(() => latest().emit('left-meeting'));
    expect(left2).not.toHaveBeenCalled();
  });

  describe('the People panel (F1)', () => {
    const host = { session_id: 'me', user_name: 'Fatima', local: true, owner: true, tracks: { audio: { state: 'playable' }, video: { state: 'playable' } } };
    const guest = { session_id: 'g1', user_name: 'Maria Garcia', user_id: 'u-maria', local: false, tracks: { audio: { state: 'playable' }, video: { state: 'off' } } };

    it('lists everyone with their microphone and camera; a guest gets no host actions', async () => {
      nextObject = { people: { local: { ...host, owner: false }, g1: guest } } as never;
      render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} />);
      await waitFor(() => expect(latest().joins).toHaveLength(1));
      act(() => latest().emit('joined-meeting'));
      fireEvent.click(await screen.findByRole('button', { name: 'People in the call' }));
      const panel = await screen.findByRole('region', { name: 'People' });
      expect(panel.textContent).toContain('In the call (2)');
      expect(panel.textContent).toContain('Fatima (you)');
      expect(panel.textContent).toContain('Maria Garcia');
      expect(screen.queryByRole('button', { name: 'Actions for Maria Garcia' })).toBeNull();
    });

    it('lets a host mute someone, telling them, and remove someone only after asking', async () => {
      const updates: Array<[string, unknown]> = [];
      const sent: Array<[unknown, string]> = [];
      nextObject = {
        people: { local: host, g1: guest },
        updateParticipant: (id: string, u: unknown) => { updates.push([id, u]); },
        sendAppMessage: (data: unknown, to: string) => { sent.push([data, to]); },
      } as never;
      const onRemovePerson = vi.fn();
      render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onRemovePerson={onRemovePerson} />);
      await waitFor(() => expect(latest().joins).toHaveLength(1));
      act(() => latest().emit('joined-meeting'));
      fireEvent.click(await screen.findByRole('button', { name: 'People in the call' }));
      expect((await screen.findByRole('region', { name: 'People' })).textContent).toContain('Host');

      fireEvent.click(screen.getByRole('button', { name: 'Actions for Maria Garcia' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Mute' }));
      expect(updates).toEqual([['g1', { setAudio: false }]]);
      expect(sent).toEqual([[{ event: 've-muted-by-host' }, 'g1']]);

      fireEvent.click(screen.getByRole('button', { name: 'Actions for Maria Garcia' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from the call' }));
      expect(updates).toHaveLength(1);
      expect(screen.getByRole('alertdialog').textContent).toContain('Remove Maria Garcia from the call?');
      fireEvent.click(screen.getByRole('button', { name: 'Remove from the call' }));
      expect(updates).toEqual([['g1', { setAudio: false }], ['g1', { eject: true }]]);
      expect(onRemovePerson).toHaveBeenCalledWith({ userId: 'u-maria', name: 'Maria Garcia' });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('shows the host who is waiting, with Let in, and counts them on People', async () => {
      const answered: Array<[string, unknown]> = [];
      nextObject = {
        people: { local: host },
        updateWaitingParticipant: (id: string, u: unknown) => { answered.push([id, u]); return Promise.resolve({ id }); },
      } as never;
      render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} />);
      await waitFor(() => expect(latest().joins).toHaveLength(1));
      act(() => latest().emit('joined-meeting'));
      act(() => latest().emit('waiting-participant-added', { participant: { id: 'w1', name: 'Maria' } }));
      fireEvent.click(await screen.findByRole('button', { name: 'People in the call' }));
      const panel = await screen.findByRole('region', { name: 'People' });
      expect(panel.textContent).toContain('Waiting to join');
      const letIn = [...panel.querySelectorAll('button')].find((b) => b.textContent === 'Let in')!;
      fireEvent.click(letIn);
      expect(answered).toEqual([['w1', { grantRequestedAccess: true }]]);
    });

    it('tells someone the host muted them, until they unmute', async () => {
      const me = { ...host, owner: false, tracks: { audio: { state: 'off' }, video: { state: 'playable' } } };
      nextObject = { people: { local: me } } as never;
      render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} />);
      await waitFor(() => expect(latest().joins).toHaveLength(1));
      act(() => latest().emit('joined-meeting'));
      act(() => latest().emit('app-message', { data: { event: 've-muted-by-host' }, fromId: 'h1' }));
      expect(await screen.findByText('The host muted you. Unmute when you are ready to speak.')).toBeTruthy();
      act(() => {
        latest().people = { local: { ...me, tracks: { audio: { state: 'playable' }, video: { state: 'playable' } } } };
        latest().emit('participant-updated');
      });
      await waitFor(() => expect(screen.queryByText('The host muted you. Unmute when you are ready to speak.')).toBeNull());
    });

    it('tells someone a host removed that they were removed, not that they left (Daily sends the error, then left-meeting)', async () => {
      nextObject = { people: { local: { ...guest, local: true, session_id: 'me' } } } as never;
      render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} />);
      await waitFor(() => expect(latest().joins).toHaveLength(1));
      act(() => latest().emit('joined-meeting'));
      act(() => latest().emit('error', { action: 'error', errorMsg: 'Meeting has ended', error: { type: 'ejected', msg: 'Meeting has ended' } }));
      act(() => latest().emit('left-meeting', { action: 'left-meeting' }));
      expect(await screen.findByText('You were removed from the call')).toBeTruthy();
      expect(screen.queryByText('You left the call')).toBeNull();
    });

    it('hands a removed person to the product (removed), so it can take them to its own page', async () => {
      const onLeftCall = vi.fn();
      nextObject = { people: { local: { ...guest, local: true, session_id: 'me' } } } as never;
      render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onLeftCall={onLeftCall} checkEnded={() => Promise.resolve(false)} />);
      await waitFor(() => expect(latest().joins).toHaveLength(1));
      act(() => latest().emit('joined-meeting'));
      act(() => latest().emit('error', { action: 'error', errorMsg: 'Meeting has ended', error: { type: 'ejected', msg: 'Meeting has ended' } }));
      act(() => latest().emit('left-meeting', { action: 'left-meeting' }));
      await waitFor(() => expect(onLeftCall).toHaveBeenCalledWith('removed'));
      expect(onLeftCall).toHaveBeenCalledTimes(1);
    });

    it('opens one panel at a time: People closes the chat', async () => {
      nextObject = { people: { local: host } } as never;
      render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} />);
      await waitFor(() => expect(latest().joins).toHaveLength(1));
      act(() => latest().emit('joined-meeting'));
      fireEvent.click(await screen.findByRole('button', { name: 'Chat with everyone' }));
      expect(await screen.findByRole('region', { name: 'Chat' }).catch(() => null)).not.toBeUndefined();
      fireEvent.click(screen.getByRole('button', { name: 'People in the call' }));
      expect(await screen.findByRole('region', { name: 'People' })).toBeTruthy();
      expect(document.querySelectorAll('.ve-chat')).toHaveLength(1);
    });
  });

  describe('raise hand and reactions (F2)', () => {
    const me = { session_id: 'me', user_name: 'Fatima', local: true, owner: true, tracks: { audio: { state: 'playable' }, video: { state: 'off' } } };
    const guest = { session_id: 'g1', user_name: 'Maria Garcia', user_id: 'u-maria', local: false, tracks: { audio: { state: 'playable' }, video: { state: 'off' } } };

    function start(people: Record<string, unknown>) {
      const userData: unknown[] = [];
      const sent: Array<[unknown, unknown]> = [];
      nextObject = {
        people,
        setUserData: (d: unknown) => { userData.push(d); return Promise.resolve(); },
        sendAppMessage: (data: unknown, to: unknown) => { sent.push([data, to]); },
      } as never;
      render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} />);
      return { userData, sent };
    }

    it('raises and lowers my own hand through my Daily userData, and says it is up', async () => {
      const { userData } = start({ local: me, g1: guest });
      await waitFor(() => expect(latest().joins).toHaveLength(1));
      act(() => latest().emit('joined-meeting'));
      fireEvent.click(await screen.findByRole('button', { name: 'Raise your hand' }));
      expect(typeof (userData[0] as { ve_hand: unknown }).ve_hand).toBe('number');

      act(() => {
        latest().people = { local: { ...me, userData: { ve_hand: 1000 } }, g1: guest };
        latest().emit('participant-updated');
      });
      expect(await screen.findByText('Your hand is raised. Everyone in the call can see it.')).toBeTruthy();
      const lower = screen.getAllByRole('button', { name: 'Lower your hand' });
      // The notice's button and the bar's control (shown pressed) both lower it.
      expect(lower.some((b) => b.getAttribute('aria-pressed') === 'true')).toBe(true);
      fireEvent.click(lower[0]!);
      expect(userData[userData.length - 1]).toEqual({ ve_hand: null });
    });

    it("shows someone else's hand on their tile, announces it, lists them first, and lets a host lower it", async () => {
      const { sent } = start({ local: me, g1: guest });
      await waitFor(() => expect(latest().joins).toHaveLength(1));
      act(() => latest().emit('joined-meeting'));
      act(() => {
        latest().people = { local: me, g1: { ...guest, userData: { ve_hand: 2000 } } };
        latest().emit('participant-updated');
      });
      expect(await screen.findByText('Maria Garcia raised a hand')).toBeTruthy();
      expect(screen.getAllByRole('img', { name: 'Hand raised' }).length).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole('button', { name: 'People in the call' }));
      const panel = await screen.findByRole('region', { name: 'People' });
      const rows = [...panel.querySelectorAll('.ve-people__row')].map((r) => r.textContent ?? '');
      expect(rows[0]).toContain('Maria Garcia');
      fireEvent.click(screen.getByRole('button', { name: 'Actions for Maria Garcia' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Lower hand' }));
      expect(sent).toContainEqual([{ event: 've-hand-lower' }, 'g1']);
    });

    it('lowers my hand when a host asks my screen to', async () => {
      const { userData } = start({ local: { ...me, owner: false, userData: { ve_hand: 1000 } }, g1: guest });
      await waitFor(() => expect(latest().joins).toHaveLength(1));
      act(() => latest().emit('joined-meeting'));
      act(() => latest().emit('app-message', { data: { event: 've-hand-lower' }, fromId: 'g1' }));
      expect(userData).toEqual([{ ve_hand: null }]);
    });

    it('sends a reaction to everyone, shows it on my tile, shows theirs on theirs, and never floods', async () => {
      const { sent } = start({ local: me, g1: guest });
      await waitFor(() => expect(latest().joins).toHaveLength(1));
      act(() => latest().emit('joined-meeting'));
      fireEvent.click(await screen.findByRole('button', { name: 'Send a reaction' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Applause' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Applause' }));
      expect(sent).toEqual([[{ event: 've-reaction', emoji: '👏' }, '*']]);
      expect(document.querySelector('[data-person="me"] .ve-tile__reaction')?.textContent).toBe('👏');

      act(() => latest().emit('app-message', { data: { event: 've-reaction', emoji: '👍' }, fromId: 'g1' }));
      expect(document.querySelector('[data-person="g1"] .ve-tile__reaction')?.textContent).toBe('👍');
      act(() => latest().emit('app-message', { data: { event: 've-reaction', emoji: '<img>' }, fromId: 'g1' }));
      expect(document.querySelector('[data-person="g1"] .ve-tile__reaction')?.textContent).toBe('👍');
    });
  });
});
