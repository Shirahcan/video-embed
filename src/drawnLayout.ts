import type { DailyParticipant } from '@daily-co/daily-js';
import { handOf } from './drawnHands';

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
  /** The product's id for this person (the token's user_id); null for someone let in from the lobby. */
  userId?: string | null;
  /** When they raised a hand (ms), from their own Daily userData; null when it is down (F2). */
  handAt?: number | null;
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
      userId: (p as unknown as { user_id?: string }).user_id || null,
      handAt: handOf((p as unknown as { userData?: unknown }).userData),
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

/** The person's choice of layout (F5), remembered per device. Auto is the layout above. */
export type DrawnLayoutMode = 'auto' | 'tiled' | 'spotlight';

/**
 * What the stage draws, once the person's layout choice and pin are applied (F5):
 * - `grid` / `focus` / `waiting`: tiles, as chooseDrawnLayout has always drawn them;
 * - `spotlight`: ONE large thing (`main`: a person's video, or a presenter's screen) beside a strip
 *   of everyone else. A shared screen in Auto or Tiled is a spotlight on that screen (`share`).
 *
 * A pin wins over everything, a shared screen included (the person chose to watch that face), and
 * holds while the speaker changes; a pin on someone who left is simply ignored.
 */
export interface DrawnArrangement {
  kind: DrawnLayout | 'spotlight';
  /** What is drawn large on a spotlight or share; null otherwise. */
  main: { person: DrawnPerson; screen: boolean } | null;
  /** Beside `main` on a spotlight or share. */
  strip: DrawnPerson[];
  /** The grid's tiles (grid / focus / waiting). */
  tiles: DrawnPerson[];
  /** The viewer floats in the corner over the tiles (focus). */
  selfCorner: boolean;
}

export function arrangeStage(
  people: DrawnPerson[],
  { mode = 'auto', pinnedId = null, speakerId = null }: { mode?: DrawnLayoutMode; pinnedId?: string | null; speakerId?: string | null } = {},
): DrawnArrangement {
  const others = people.filter((p) => !p.local);
  const self = people.find((p) => p.local) ?? null;
  const none: Pick<DrawnArrangement, 'main' | 'strip' | 'tiles' | 'selfCorner'> = { main: null, strip: [], tiles: [], selfCorner: false };
  if (others.length === 0) return { ...none, kind: 'waiting', tiles: self ? [self] : [] };

  const pinned = pinnedId ? people.find((p) => p.id === pinnedId) ?? null : null;
  if (pinned) {
    return { ...none, kind: 'spotlight', main: { person: pinned, screen: Boolean(pinned.screen) && !pinned.local }, strip: people.filter((p) => p.id !== pinned.id) };
  }
  const presenter = presenterOf(people);
  if (presenter) return { ...none, kind: 'share', main: { person: presenter, screen: true }, strip: people };
  if (mode === 'spotlight') {
    const lead = others.find((p) => p.id === speakerId) ?? others[0]!;
    return { ...none, kind: 'spotlight', main: { person: lead, screen: false }, strip: people.filter((p) => p.id !== lead.id) };
  }
  if (mode === 'tiled' || others.length >= 2) return { ...none, kind: 'grid', tiles: self ? [...others, self] : others };
  return { ...none, kind: 'focus', tiles: others, selfCorner: Boolean(self) };
}

/** receiveLayers for an arrangement: whoever is large is received high, the strip low (F5). */
export function arrangementLayers(people: DrawnPerson[], arrangement: DrawnArrangement): Record<string, 0 | 1 | 2> {
  if (arrangement.kind !== 'spotlight') return receiveLayers(people, arrangement.kind);
  const out: Record<string, 0 | 1 | 2> = {};
  for (const p of people) if (!p.local) out[p.id] = arrangement.main && !arrangement.main.screen && arrangement.main.person.id === p.id ? 2 : 0;
  return out;
}
