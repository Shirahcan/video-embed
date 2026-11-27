import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DailyCall } from '@daily-co/daily-js';
import { arrangeStage, arrangementLayers, chooseDrawnLayout, drawnPeople, fitTiles, receiveLayers, type DrawnPerson } from '../src/drawnLayout';
import { LAYOUT_MODE_KEY } from '../src/drawnView';
import { DrawnStage } from '../src/components/DrawnStage';

const track = (id: string) => ({ id, kind: 'video' }) as unknown as MediaStreamTrack;

function person(id: string, extra: Partial<DrawnPerson> = {}): DrawnPerson {
  return { id, name: id, local: false, video: null, audio: null, screen: null, audioOn: true, videoOn: true, ...extra };
}

const me = person('me', { local: true });

describe('the drawn call layout', () => {
  it('waits alone, focuses one person, grids a group, and gives a shared screen the stage', () => {
    expect(chooseDrawnLayout([me])).toBe('waiting');
    expect(chooseDrawnLayout([me, person('a')])).toBe('focus');
    expect(chooseDrawnLayout([me, person('a'), person('b')])).toBe('grid');
    expect(chooseDrawnLayout([me, person('a'), person('b', { screen: track('s') })])).toBe('share');
    // The viewer's own share is never mirrored back at them.
    expect(chooseDrawnLayout([{ ...me, screen: track('mine') }, person('a')])).toBe('focus');
  });

  it("fits 16:9 tiles the way Meet does: the column count that gives the biggest tiles for the stage's shape", () => {
    // A tall, narrow stage (the 2026-11-26 screenshot: 680x817): three people stack in one column, not two slivers.
    expect(fitTiles(3, 680, 817)).toEqual({ columns: 1, tileWidth: 472 });
    // A wide stage: three side by side would be tiny; two columns (one centred on the second row) win.
    expect(fitTiles(3, 1200, 700)).toEqual({ columns: 2, tileWidth: 595 });
    // Four on a wide stage: a 2x2.
    expect(fitTiles(4, 1200, 700).columns).toBe(2);
    // Every tile keeps its 16:9 frame inside the stage.
    for (const [n, w, h] of [[2, 680, 817], [5, 1400, 760], [9, 900, 500]] as const) {
      const { columns, tileWidth } = fitTiles(n, w, h);
      const rows = Math.ceil(n / columns);
      expect(columns * tileWidth + (columns - 1) * 10).toBeLessThanOrEqual(w);
      expect(rows * (tileWidth * 9) / 16 + (rows - 1) * 10).toBeLessThanOrEqual(h + 0.01);
    }
    expect(fitTiles(0, 800, 600).tileWidth).toBe(0);
  });

  it('spends bandwidth on what is large: faces beside a shared screen go low, a big grid goes medium', () => {
    const two = [me, person('a')];
    expect(receiveLayers(two, 'focus')).toEqual({ a: 2 });
    const share = [me, person('a', { screen: track('s') }), person('b')];
    expect(receiveLayers(share, 'share')).toEqual({ a: 0, b: 0 });
    const five = [me, ...['a', 'b', 'c', 'd', 'e'].map((id) => person(id))];
    expect(receiveLayers(five, 'grid')).toEqual({ a: 1, b: 1, c: 1, d: 1, e: 1 });
  });

  it("reads Daily's participants, screen share included, the viewer first", () => {
    const people = drawnPeople({
      x: { session_id: 'x', user_name: ' Maria ', local: false, tracks: { video: { state: 'playable', persistentTrack: track('v') }, audio: { state: 'off' }, screenVideo: { state: 'playable', persistentTrack: track('s') } } },
      local: { session_id: 'me', user_name: 'Ada', local: true, tracks: { video: { state: 'off' } } },
    } as never);
    expect(people.map((p) => p.id)).toEqual(['me', 'x']);
    expect(people[1]).toMatchObject({ name: 'Maria', audioOn: false, videoOn: true });
    expect(people[1]!.screen).not.toBeNull();
    expect(people[0]!.videoOn).toBe(false);
  });
});

type Handler = (event?: unknown) => void;
class StageCall {
  handlers = new Map<string, Handler[]>();
  people: Record<string, unknown> = {};
  received: unknown[] = [];
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
    return this.people;
  }
  updateReceiveSettings(s: unknown) {
    this.received.push(s);
    return Promise.resolve();
  }
  setLocalAudio() {}
  setLocalVideo() {}
}

describe('layout choice and pin (F5)', () => {
  const a = person('a');
  const b = person('b');
  const presenter = person('p', { screen: track('s') });

  it('Auto is the layout people already know', () => {
    expect(arrangeStage([me, a]).kind).toBe('focus');
    expect(arrangeStage([me, a]).selfCorner).toBe(true);
    expect(arrangeStage([me, a, b]).kind).toBe('grid');
    expect(arrangeStage([me]).kind).toBe('waiting');
    expect(arrangeStage([me, a, presenter]).main).toEqual({ person: presenter, screen: true });
  });

  it('Tiled puts everyone in one grid, the viewer included, even with one other', () => {
    const t = arrangeStage([me, a], { mode: 'tiled' });
    expect(t.kind).toBe('grid');
    expect(t.tiles.map((p) => p.id)).toEqual(['a', 'me']);
  });

  it('Spotlight puts the speaker large and everyone else beside them', () => {
    const s = arrangeStage([me, a, b], { mode: 'spotlight', speakerId: 'b' });
    expect(s.kind).toBe('spotlight');
    expect(s.main?.person.id).toBe('b');
    expect(s.strip.map((p) => p.id)).toEqual(['me', 'a']);
    // Nobody speaking yet: the first other person.
    expect(arrangeStage([me, a, b], { mode: 'spotlight' }).main?.person.id).toBe('a');
  });

  it('a pin wins over the speaker and a shared screen, and is ignored once that person left', () => {
    const pinned = arrangeStage([me, a, presenter], { mode: 'auto', pinnedId: 'a', speakerId: 'p' });
    expect(pinned.main).toEqual({ person: a, screen: false });
    expect(pinned.strip.map((p) => p.id)).toEqual(['me', 'p']);
    expect(arrangeStage([me, b], { pinnedId: 'a' }).kind).toBe('focus');
  });

  it('receives the large person high and the strip low', () => {
    const s = arrangeStage([me, a, b], { pinnedId: 'b' });
    expect(arrangementLayers([me, a, b], s)).toEqual({ a: 0, b: 2 });
  });
});

describe('the drawn call stage', () => {
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
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: () => Promise.resolve() });
  });

  it('puts a shared screen on the stage with everyone in the strip, rings the speaker, and lowers the strip quality', () => {
    const call = new StageCall();
    call.people = {
      local: { session_id: 'me', user_name: 'Ada', local: true, tracks: {} },
      m: { session_id: 'm', user_name: 'Maria Garcia', local: false, tracks: { screenVideo: { state: 'playable', persistentTrack: track('s') } } },
    };
    const { container } = render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} />);
    expect(screen.getByText('Maria Garcia is presenting')).toBeTruthy();
    expect(container.querySelectorAll('.ve-tile--strip')).toHaveLength(2);
    expect(container.querySelector('.ve-tile--self')).toBeNull();
    expect(call.received.at(-1)).toEqual({ m: { video: { layer: 0 } } });

    act(() => call.emit('active-speaker-change', { activeSpeaker: { peerId: 'm' } }));
    expect(container.querySelector('[data-person="m"]')!.className).toContain('ve-tile--speaking');
  });
});

describe('layout choice and pin on the stage (F5)', () => {
  const group = () => ({
    local: { session_id: 'me', user_name: 'Ada', local: true, tracks: {} },
    m: { session_id: 'm', user_name: 'Maria Garcia', local: false, tracks: {} },
    j: { session_id: 'j', user_name: 'Jon', local: false, tracks: {} },
  });

  it('pins a tile large, keeps it while the speaker changes, and unpins it', () => {
    window.localStorage.removeItem(LAYOUT_MODE_KEY);
    const call = new StageCall();
    call.people = group();
    const { container } = render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} />);
    expect(container.querySelector('[data-layout="grid"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pin Jon' }));
    expect(container.querySelector('.ve-tile--main')?.getAttribute('data-person')).toBe('j');
    act(() => call.emit('active-speaker-change', { activeSpeaker: { peerId: 'm' } }));
    expect(container.querySelector('.ve-tile--main')?.getAttribute('data-person')).toBe('j');
    fireEvent.click(screen.getByRole('button', { name: 'Unpin Jon' }));
    expect(container.querySelector('.ve-tile--main')).toBeNull();
  });

  it('More > Layout switches to Spotlight and remembers it on this device', () => {
    window.localStorage.removeItem(LAYOUT_MODE_KEY);
    const call = new StageCall();
    call.people = group();
    const first = render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Spotlight/ }));
    expect(first.container.querySelector('[data-layout="spotlight"]')).toBeTruthy();
    expect(window.localStorage.getItem(LAYOUT_MODE_KEY)).toBe('spotlight');
    first.unmount();
    const again = render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} />);
    expect(again.container.querySelector('[data-layout="spotlight"]')).toBeTruthy();
    window.localStorage.removeItem(LAYOUT_MODE_KEY);
  });

  it('offers full screen only where the browser has it', () => {
    const call = new StageCall();
    call.people = group();
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    const off = render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.queryByRole('menuitem', { name: 'Full screen' })).toBeNull();
    off.unmount();
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    const requested: Element[] = [];
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: function (this: Element) { requested.push(this); return Promise.resolve(); } });
    render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Full screen' }));
    expect(requested[0]?.classList.contains('ve-drawn')).toBe(true);
  });
});
