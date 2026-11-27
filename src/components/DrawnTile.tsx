import { useEffect, useRef } from 'react';
import type { DrawnPerson } from '../drawnLayout';
import { cx } from '../theme';
import { MicOffIcon, HandIcon, PinIcon } from './icons';

/**
 * Keeps a media element playing one track; the element itself never changes, so it can move windows.
 * `onBlocked` hears when the browser refuses to play (autoplay rules: no click on the page yet).
 */
export function useMediaTrack(track: MediaStreamTrack | null, onBlocked?: () => void) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const blockedRef = useRef(onBlocked);
  useEffect(() => {
    blockedRef.current = onBlocked;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const current = (el.srcObject as MediaStream | null)?.getTracks()[0];
    if (track && current?.id === track.id) return;
    el.srcObject = track ? new MediaStream([track]) : null;
    if (track) {
      void el.play().catch((e: unknown) => {
        if ((e as { name?: string } | null)?.name === 'NotAllowedError') blockedRef.current?.();
      });
    }
  }, [track]);
  return ref;
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Tile({ person, label, mutedLabel, speaking = false, variant = 'stage', mirror = true, handLabel, reaction = null, pin = null }: {
  person: DrawnPerson;
  /** Said for a raised hand (its badge is drawn whenever `person.handAt` is set). */
  handLabel?: string;
  /** A reaction showing over the tile right now (F2); its `key` replays the burst. */
  reaction?: { emoji: string; key: number } | null;
  /** Show the viewer's own video as in a mirror (their choice; others never see it flipped). */
  mirror?: boolean;
  label: string;
  mutedLabel: string;
  speaking?: boolean;
  /** `stage`: in the grid; `self`: the viewer's corner tile; `strip`: beside a shared screen; `main`: the spotlight. */
  variant?: 'stage' | 'self' | 'strip' | 'main';
  /** F5: pin this tile large (or unpin it); a pinned tile shows its pin. */
  pin?: { pinned: boolean; label: string; onToggle: () => void } | null;
}) {
  const showVideo = person.videoOn && Boolean(person.video);
  const ref = useMediaTrack(showVideo ? person.video : null);
  return (
    <div
      className={cx('ve-tile', variant === 'self' && 've-tile--self', variant === 'strip' && 've-tile--strip', variant === 'main' && 've-tile--main', speaking && 've-tile--speaking', person.local && mirror && 've-tile--mirror', pin?.pinned && 've-tile--pinned')}
      data-person={person.id}
    >
      <video ref={ref} className="ve-tile__video" autoPlay playsInline muted hidden={!showVideo} />
      {!showVideo ? <span className="ve-tile__initials" aria-hidden="true">{initialsOf(person.name || label)}</span> : null}
      {person.handAt ? (
        <span className="ve-tile__hand" role="img" aria-label={handLabel}>
          <HandIcon width={18} height={18} />
        </span>
      ) : null}
      {pin ? (
        <button type="button" className="ve-tile__pin" aria-label={pin.label} title={pin.label} aria-pressed={pin.pinned} onClick={pin.onToggle}>
          <PinIcon width={16} height={16} />
        </button>
      ) : null}
      {reaction ? <span key={reaction.key} className="ve-tile__reaction" aria-hidden="true">{reaction.emoji}</span> : null}
      <span className="ve-tile__name">
        {!person.audioOn ? (
          <span className="ve-tile__muted" role="img" aria-label={mutedLabel}>
            <MicOffIcon width={14} height={14} />
          </span>
        ) : null}
        {label}
      </span>
    </div>
  );
}

/** A shared screen, shown whole (never cropped), with who is presenting. */
export function ShareTile({ track, label }: { track: MediaStreamTrack; label: string }) {
  const ref = useMediaTrack(track);
  return (
    <div className="ve-tile ve-tile--share">
      <video ref={ref} className="ve-tile__video ve-tile__video--contain" autoPlay playsInline muted />
      <span className="ve-tile__name">{label}</span>
    </div>
  );
}

/**
 * One person's sound. Kept outside the tiles, so moving tiles (the float) never pauses it. Plays on
 * the chosen speaker (`sinkId`, '' = the system default) where the browser allows choosing one.
 */
export function Sound({ track, sinkId = '', onBlocked }: { track: MediaStreamTrack | null; sinkId?: string; onBlocked?: () => void }) {
  const ref = useMediaTrack(track, onBlocked);
  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el?.setSinkId) return;
    void el.setSinkId(sinkId).catch(() => {});
  }, [ref, sinkId]);
  return <audio ref={ref} autoPlay data-sound="" />;
}
