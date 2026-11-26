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
    unmount();

    made.length = 0;
    render(<CallFrame url={URL_WITH_PASS} singleTab={false} />);
    await waitFor(() => expect(made).toHaveLength(1));
    expect(latest().kind).toBe('frame');
    await waitFor(() => expect(latest().joins[0]).toEqual({ url: URL_WITH_PASS }));
  });

  it('hands a person left in the lobby to the standard screen, which runs the knock, without counting them as joined', async () => {
    nextObject = { level: 'lobby' };
    const onJoined = vi.fn();
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} onJoined={onJoined} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('joined-meeting'));
    await waitFor(() => expect(latest().kind).toBe('frame'));
    expect(onJoined).not.toHaveBeenCalled();
    // Not remembered: the next call may be drawn again.
    expect(window.localStorage.getItem(STANDARD_SCREEN_KEY)).toBeNull();
  });

  it('falls back to the standard screen when the drawn call fails before the person gets in', async () => {
    render(<CallFrame url={URL_WITH_PASS} drawn singleTab={false} />);
    await waitFor(() => expect(latest().joins).toHaveLength(1));
    act(() => latest().emit('error', { errorMsg: 'Something went wrong connecting' }));
    await waitFor(() => expect(latest().kind).toBe('frame'));
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
});
