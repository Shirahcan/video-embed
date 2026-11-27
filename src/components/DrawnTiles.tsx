import type { CSSProperties, Ref } from 'react';
import { cx, useVideoUi } from '../theme';
import type { DrawnArrangement, DrawnPerson } from '../drawnLayout';
import type { ShownReaction } from '../drawnHands';
import { ShareTile, Tile } from './DrawnTile';

interface Props {
  arrangement: DrawnArrangement;
  /** The grid's measured box (it sizes the tiles). */
  stageRef: Ref<HTMLDivElement>;
  fit: { columns: number; tileWidth: number };
  reactions: Record<string, ShownReaction>;
  ringFor: (p: DrawnPerson) => boolean;
  mirror: boolean;
  pinnedId: string | null;
  onPin: (id: string | null) => void;
  /** The viewer, for the corner tile beside one other person. */
  self: DrawnPerson | null;
}

/**
 * The people on the drawn stage, laid out as `arrangeStage` decided (F5): a grid (the viewer in the
 * corner with one other), or ONE large thing (a person, or a presenter's screen) beside a strip of
 * everyone else. Every person's tile carries a Pin; a pin wins until it is taken off.
 */
export function DrawnTiles({ arrangement, stageRef, fit, reactions, ringFor, mirror, pinnedId, onPin, self }: Props) {
  const { labels } = useVideoUi();
  const nameOf = (p: DrawnPerson) => (p.local ? labels.drawnYou : p.name || '?');
  const pinLabel = (p: DrawnPerson, pinned: boolean) =>
    p.local ? (pinned ? labels.drawnUnpinSelf : labels.drawnPinSelf) : pinned ? labels.drawnUnpin(nameOf(p)) : labels.drawnPin(nameOf(p));
  const tile = (p: DrawnPerson, variant: 'stage' | 'self' | 'strip' | 'main') => {
    const pinned = pinnedId === p.id;
    // Alone there is nothing to pin over; the corner tile is the viewer's own and stays small.
    const pinnable = arrangement.kind !== 'waiting' && variant !== 'self';
    return (
      <Tile
        key={`${variant}-${p.id}`}
        person={p}
        label={nameOf(p)}
        mutedLabel={labels.drawnMuted}
        handLabel={labels.drawnHandRaised}
        reaction={reactions[p.id] ?? null}
        speaking={ringFor(p)}
        variant={variant}
        mirror={mirror}
        pin={pinnable ? { pinned, label: pinLabel(p, pinned), onToggle: () => onPin(pinned ? null : p.id) } : null}
      />
    );
  };
  const main = arrangement.main;

  if (main) {
    return (
      <div className="ve-drawn__share" data-layout={arrangement.kind}>
        {main.screen && main.person.screen ? (
          <ShareTile track={main.person.screen} label={labels.drawnPresenting(main.person.name || '?')} />
        ) : (
          tile(main.person, 'main')
        )}
        <div className="ve-drawn__strip">{arrangement.strip.map((p) => tile(p, 'strip'))}</div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={stageRef}
        className={cx('ve-drawn__grid', `ve-drawn__grid--${arrangement.kind}`)}
        data-layout={arrangement.kind}
        data-columns={fit.columns}
        style={{ '--ve-tile-w': `${fit.tileWidth}px` } as CSSProperties}
      >
        {arrangement.kind === 'waiting' ? <p className="ve-drawn__waiting">{labels.drawnWaiting}</p> : null}
        {arrangement.tiles.map((p) => tile(p, 'stage'))}
      </div>
      {arrangement.selfCorner && self ? tile(self, 'self') : null}
    </>
  );
}
