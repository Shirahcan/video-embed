import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { cx, useVideoUi } from '../theme';

/**
 * The call drawn by the kit from Daily's call object: the people's tiles, their sound, and our own
 * controls (mute, camera, leave, "Use the standard call screen"). Everything around the call
 * (repair, knocks, ending, the clock, notices) stays CallFrame's, exactly as for Prebuilt.
 *
 * Drawn with plain DOM media elements, so the same nodes can later move into a floating window
 * without the call noticing (P1 spike, 2026-11-26). Remote SOUND always plays from elements that
 * never move, so it never pauses.
 */
export interface DrawnPerson {
  id: string;
  name: string;
  local: boolean;
  video: MediaStreamTrack | null;
  audio: MediaStreamTrack | null;
  audioOn: boolean;
  videoOn: boolean;
}

function playable(track: { state?: string; persistentTrack?: MediaStreamTrack } | undefined): MediaStreamTrack | null {
  if (!track || !track.persistentTrack) return null;
  return track.state === 'playable' ? track.persistentTrack : null;
}

/** Daily's participants() map as the people the stage draws: the viewer first. */
export function drawnPeople(raw: Record<string, DailyParticipant> | null | undefined): DrawnPerson[] {
  if (!raw) return [];
  const people = Object.values(raw).map((p) => {
    const tracks = (p as unknown as { tracks?: { audio?: { state?: string; persistentTrack?: MediaStreamTrack }; video?: { state?: string; persistentTrack?: MediaStreamTrack } } }).tracks;
    return {
      id: p.session_id,
      name: (p.user_name ?? '').trim(),
      local: Boolean(p.local),
      video: playable(tracks?.video),
      audio: playable(tracks?.audio),
      audioOn: tracks?.audio?.state !== 'off' && tracks?.audio?.state !== 'blocked',
      videoOn: tracks?.video?.state !== 'off' && tracks?.video?.state !== 'blocked',
    };
  });
  return people.sort((a, b) => Number(b.local) - Number(a.local));
}

function useMediaTrack(track: MediaStreamTrack | null) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const current = (el.srcObject as MediaStream | null)?.getTracks()[0];
    if (track && current?.id === track.id) return;
    el.srcObject = track ? new MediaStream([track]) : null;
    if (track) void el.play().catch(() => {});
  }, [track]);
  return ref;
}

function Tile({ person, label }: { person: DrawnPerson; label: string }) {
  const ref = useMediaTrack(person.videoOn ? person.video : null);
  const initials = (person.name || label).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  return (
    <div className={cx('ve-tile', person.local && 've-tile--self')} data-person={person.id}>
      <video ref={ref} className="ve-tile__video" autoPlay playsInline muted hidden={!person.videoOn || !person.video} />
      {!person.videoOn || !person.video ? <span className="ve-tile__initials" aria-hidden="true">{initials || '?'}</span> : null}
      <span className="ve-tile__name">
        {label}
        {!person.audioOn ? <span className="ve-tile__muted" aria-label="muted"> (muted)</span> : null}
      </span>
    </div>
  );
}

function Sound({ track }: { track: MediaStreamTrack | null }) {
  const ref = useMediaTrack(track);
  return <audio ref={ref} autoPlay />;
}

export interface DrawnStageProps {
  call: DailyCall;
  /** Leave the call (CallFrame's own leave, so its "Is it over?" and presence follow). */
  onLeave: () => void;
  /** Switch this device to Daily Prebuilt. */
  onUseStandard: () => void;
}

export function DrawnStage({ call, onLeave, onUseStandard }: DrawnStageProps) {
  const { labels, classNames } = useVideoUi();
  const [people, setPeople] = useState<DrawnPerson[]>(() => drawnPeople(call.participants() as Record<string, DailyParticipant>));
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      try {
        setPeople(drawnPeople(call.participants() as Record<string, DailyParticipant>));
      } catch {
        /* torn down mid-event */
      }
    };
    const events = ['joined-meeting', 'participant-joined', 'participant-updated', 'participant-left', 'track-started', 'track-stopped'] as const;
    for (const e of events) call.on(e, sync);
    sync();
    return () => {
      for (const e of events) call.off(e, sync);
    };
  }, [call]);

  const self = people.find((p) => p.local) ?? null;
  const others = people.filter((p) => !p.local);

  return (
    <div className="ve-drawn" role="region" aria-label={labels.drawnRegion}>
      <div className={cx('ve-drawn__grid', `ve-drawn__grid--${Math.min(others.length, 4)}`)}>
        {others.length === 0 ? <p className="ve-drawn__waiting">{labels.drawnWaiting}</p> : null}
        {others.map((p) => <Tile key={p.id} person={p} label={p.name || '?'} />)}
      </div>
      {self ? <Tile person={self} label={labels.drawnYou} /> : null}

      <div className="ve-drawn__sound" hidden>
        {others.map((p) => <Sound key={p.id} track={p.audio} />)}
      </div>

      <div className="ve-drawn__bar">
        <button
          type="button"
          className={cx('ve-btn', classNames.button)}
          aria-pressed={self ? !self.audioOn : false}
          onClick={() => call.setLocalAudio(!(self?.audioOn ?? true))}
        >
          {self?.audioOn === false ? labels.drawnUnmute : labels.drawnMute}
        </button>
        <button
          type="button"
          className={cx('ve-btn', classNames.button)}
          aria-pressed={self ? !self.videoOn : false}
          onClick={() => call.setLocalVideo(!(self?.videoOn ?? true))}
        >
          {self?.videoOn === false ? labels.drawnCameraOn : labels.drawnCameraOff}
        </button>
        <span className="ve-drawn__menu">
          <button type="button" className={cx('ve-btn', classNames.button)} aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((o) => !o)}>
            {labels.drawnMore}
          </button>
          {menuOpen ? (
            <span className="ve-drawn__menu-list" role="menu">
              <button
                type="button"
                role="menuitem"
                className="ve-drawn__menu-item"
                title={labels.drawnUseStandardDetail}
                onClick={() => {
                  setMenuOpen(false);
                  onUseStandard();
                }}
              >
                {labels.drawnUseStandard}
              </button>
            </span>
          ) : null}
        </span>
        <button type="button" className={cx('ve-btn ve-btn--danger-solid', classNames.button)} onClick={onLeave}>
          {labels.drawnLeave}
        </button>
      </div>
    </div>
  );
}

/** A crash while drawing the call never strands the person: it hands them to the standard screen. */
export class DrawnStageBoundary extends Component<{ children: ReactNode; onCrash: (error: Error) => void }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void info;
    this.props.onCrash(error);
  }

  render(): ReactNode {
    return this.state.crashed ? null : this.props.children;
  }
}
