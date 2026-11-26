import { Component, useEffect, useId, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { cx, useVideoUi } from '../theme';
import { CameraIcon, CameraOffIcon, LeaveIcon, MicIcon, MicOffIcon, MoreIcon, StandardScreenIcon } from './icons';

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

function Tile({ person, label, mutedLabel }: { person: DrawnPerson; label: string; mutedLabel: string }) {
  const ref = useMediaTrack(person.videoOn ? person.video : null);
  const initials = (person.name || label).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  return (
    <div className={cx('ve-tile', person.local && 've-tile--self')} data-person={person.id}>
      <video ref={ref} className="ve-tile__video" autoPlay playsInline muted hidden={!person.videoOn || !person.video} />
      {!person.videoOn || !person.video ? <span className="ve-tile__initials" aria-hidden="true">{initials || '?'}</span> : null}
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

function Sound({ track }: { track: MediaStreamTrack | null }) {
  const ref = useMediaTrack(track);
  return <audio ref={ref} autoPlay />;
}

/** A round icon button with its short label underneath (the call's control bar). */
function Control({ label, ariaLabel, icon, onClick, pressed, expanded, off = false, danger = false }: {
  label: string;
  ariaLabel: string;
  icon: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  expanded?: boolean;
  off?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx('ve-ctl', off && 've-ctl--off', danger && 've-ctl--danger')}
      aria-label={ariaLabel}
      title={ariaLabel}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      onClick={onClick}
    >
      <span className="ve-ctl__disc">{icon}</span>
      <span className="ve-ctl__label" aria-hidden="true">{label}</span>
    </button>
  );
}

export interface DrawnStageProps {
  call: DailyCall;
  /** Leave the call (CallFrame's own leave, so its "Is it over?" and presence follow). */
  onLeave: () => void;
  /** Switch this device to Daily Prebuilt. */
  onUseStandard: () => void;
}

export function DrawnStage({ call, onLeave, onUseStandard }: DrawnStageProps) {
  const { labels } = useVideoUi();
  const [people, setPeople] = useState<DrawnPerson[]>(() => drawnPeople(call.participants() as Record<string, DailyParticipant>));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const standardDetailId = useId();

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

  // The menu closes on Escape and on a click anywhere else.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [menuOpen]);

  const self = people.find((p) => p.local) ?? null;
  const others = people.filter((p) => !p.local);
  const micOff = self ? !self.audioOn : false;
  const camOff = self ? !self.videoOn : false;

  return (
    <div className="ve-drawn" role="region" aria-label={labels.drawnRegion}>
      <div className={cx('ve-drawn__grid', `ve-drawn__grid--${Math.min(others.length, 4)}`)}>
        {others.length === 0 ? <p className="ve-drawn__waiting">{labels.drawnWaiting}</p> : null}
        {others.map((p) => <Tile key={p.id} person={p} label={p.name || '?'} mutedLabel={labels.drawnMuted} />)}
      </div>
      {self ? <Tile person={self} label={labels.drawnYou} mutedLabel={labels.drawnMuted} /> : null}

      <div className="ve-drawn__sound" hidden>
        {others.map((p) => <Sound key={p.id} track={p.audio} />)}
      </div>

      <div className="ve-drawn__bar" role="toolbar" aria-label={labels.drawnControls}>
        <Control
          label={micOff ? labels.drawnUnmute : labels.drawnMute}
          ariaLabel={micOff ? labels.drawnUnmute : labels.drawnMute}
          pressed={micOff}
          off={micOff}
          onClick={() => call.setLocalAudio(micOff)}
          icon={micOff ? <MicOffIcon /> : <MicIcon />}
        />
        <Control
          label={camOff ? labels.drawnVideoStart : labels.drawnVideoStop}
          ariaLabel={camOff ? labels.drawnCameraOn : labels.drawnCameraOff}
          pressed={camOff}
          off={camOff}
          onClick={() => call.setLocalVideo(camOff)}
          icon={camOff ? <CameraOffIcon /> : <CameraIcon />}
        />
        <span className="ve-drawn__menu" ref={menuRef}>
          <Control
            label={labels.drawnMoreShort}
            ariaLabel={labels.drawnMore}
            expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            icon={<MoreIcon />}
          />
          {menuOpen ? (
            <span className="ve-drawn__menu-list" role="menu" aria-label={labels.drawnMore}>
              <button
                type="button"
                role="menuitem"
                className="ve-drawn__menu-item"
                aria-label={labels.drawnUseStandard}
                aria-describedby={standardDetailId}
                onClick={() => {
                  setMenuOpen(false);
                  onUseStandard();
                }}
              >
                <span className="ve-drawn__menu-icon"><StandardScreenIcon /></span>
                <span className="ve-drawn__menu-text">
                  <span className="ve-drawn__menu-title">{labels.drawnUseStandard}</span>
                  <span className="ve-drawn__menu-detail" id={standardDetailId}>{labels.drawnUseStandardDetail}</span>
                </span>
              </button>
            </span>
          ) : null}
        </span>
        <Control label={labels.drawnLeave} ariaLabel={labels.drawnLeave} danger onClick={onLeave} icon={<LeaveIcon />} />
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
