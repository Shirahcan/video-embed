import { act, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DailyCall } from '@daily-co/daily-js';
import { chooseDrawnLayout, drawnPeople, fitTiles, receiveLayers, type DrawnPerson } from '../src/drawnLayout';
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
