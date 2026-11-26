import type { DailyParticipant } from '@daily-co/daily-js';

/**
 * What the drawn call screen draws, and how it lays it out. Pure functions, so the layout rules are
 * tested without a browser. Calls on these products are small (a consultant, a client, family or an
 * interpreter), so there is no large-meeting paging.
 */
export interface DrawnPerson {
  id: string;
  name: string;
  local: boolean;
  video: MediaStreamTrack | null;
  audio: MediaStreamTrack | null;
  /** Their shared screen, when they are presenting. */
  screen: MediaStreamTrack | null;
  /** The sound of the tab they are presenting, when they shared it. */
  screenAudio?: MediaStreamTrack | null;
  audioOn: boolean;
  videoOn: boolean;
  /** A room owner (a host's token): may mute and remove others. */
  owner?: boolean;
}

type RawTrack = { state?: string; persistentTrack?: MediaStreamTrack };

function playable(track: RawTrack | undefined): MediaStreamTrack | null {
  if (!track || !track.persistentTrack) return null;
  return track.state === 'playable' ? track.persistentTrack : null;
}

/** Daily's participants() map as the people the stage draws: the viewer first. */
export function drawnPeople(raw: Record<string, DailyParticipant> | null | undefined): DrawnPerson[] {
  if (!raw) return [];
  const people = Object.values(raw).map((p) => {
    const tracks = (p as unknown as { tracks?: { audio?: RawTrack; video?: RawTrack; screenVideo?: RawTrack; screenAudio?: RawTrack } }).tracks;
    return {
      id: p.session_id,
      name: (p.user_name ?? '').trim(),
      local: Boolean(p.local),
      video: playable(tracks?.video),
      audio: playable(tracks?.audio),
      screen: playable(tracks?.screenVideo),
      screenAudio: playable(tracks?.screenAudio),
      audioOn: tracks?.audio?.state !== 'off' && tracks?.audio?.state !== 'blocked',
      videoOn: tracks?.video?.state !== 'off' && tracks?.video?.state !== 'blocked',
      owner: Boolean((p as unknown as { owner?: boolean }).owner),
    };
  });
  return people.sort((a, b) => Number(b.local) - Number(a.local));
}

/**
 * The tiles on the stage, the way Google Meet lays them out:
 * - `waiting`: nobody else is in yet; the viewer's own tile, large.
 * - `focus`: one other person, large; the viewer small in the corner.
 * - `grid`: two or more others; EVERYONE (the viewer too) in one even grid of 16:9 tiles.
 * - `share`: someone else is presenting: their screen large, everyone (the viewer too) in a strip.
 *   The viewer's OWN share is never mirrored back to them (P2e shows "You are presenting" instead).
 */
export type DrawnLayout = 'waiting' | 'focus' | 'grid' | 'share';

export function chooseDrawnLayout(people: DrawnPerson[]): DrawnLayout {
  const others = people.filter((p) => !p.local);
  if (others.some((p) => p.screen)) return 'share';
  if (others.length === 0) return 'waiting';
  return others.length === 1 ? 'focus' : 'grid';
}

/**
 * The largest 16:9 tile that fits `count` tiles into a `width` x `height` stage, and the columns that
 * give it (Meet's tiling: try every column count, keep the one with the biggest tiles). A short last
 * row is centred by the stage. Never a stretched, cropped sliver: every tile keeps its frame.
 */
export function fitTiles(count: number, width: number, height: number, gap = 10, aspect = 16 / 9): { columns: number; tileWidth: number } {
  if (count <= 0 || width <= 0 || height <= 0) return { columns: 1, tileWidth: 0 };
  let best = { columns: 1, tileWidth: 0 };
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const byWidth = (width - gap * (columns - 1)) / columns;
    const byHeight = ((height - gap * (rows - 1)) / rows) * aspect;
    const tileWidth = Math.floor(Math.min(byWidth, byHeight));
    if (tileWidth > best.tileWidth) best = { columns, tileWidth };
  }
  return best;
}

/** The presenter: the first other person sharing a screen. */
export function presenterOf(people: DrawnPerson[]): DrawnPerson | null {
  return people.find((p) => !p.local && p.screen) ?? null;
}

/**
 * The video quality each person is received at (Daily simulcast layers: 0 low, 1 medium, 2 high), so a
 * weak connection spends its bandwidth on what is large on screen: the presenter's screen stays high
 * and the faces in the strip go low; a grid of five or more goes medium.
 */
export function receiveLayers(people: DrawnPerson[], layout: DrawnLayout): Record<string, 0 | 1 | 2> {
  const others = people.filter((p) => !p.local);
  const layer: 0 | 1 | 2 = layout === 'share' ? 0 : layout === 'grid' && others.length >= 5 ? 1 : 2;
  const out: Record<string, 0 | 1 | 2> = {};
  for (const p of others) out[p.id] = layer;
  return out;
}
