import { Component, useEffect, useId, useRef, useState, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { cx, useVideoUi } from '../theme';
import { BlurIcon, CameraIcon, CameraOffIcon, ChatIcon, LeaveIcon, MicIcon, MicOffIcon, MoreIcon, NoiseIcon, PresentIcon, StandardScreenIcon } from './icons';
import { PRESENT_OPTIONS, useDrawnEffects } from '../drawnEffects';
import { DrawnChatPanel } from './DrawnChatPanel';
import { useDrawnChat } from '../drawnChat';
import { useDrawnNetwork } from '../drawnNetwork';
import { chooseDrawnLayout, drawnPeople, fitTiles, presenterOf, receiveLayers, type DrawnPerson } from '../drawnLayout';
import { ShareTile, Sound, Tile } from './DrawnTile';
import { DrawnDeviceMenu } from './DrawnDeviceMenu';
import { useDrawnDevices } from '../drawnDevices';
import type { CallAccess } from '../hooks/useDailyFrame';

export { drawnPeople, type DrawnPerson };

/**
 * The call drawn by the kit from Daily's call object: the people's tiles, their sound, and our own
 * controls (mute, camera, leave, "Use the standard call screen"). Everything around the call
 * (repair, knocks, ending, the clock, notices) stays CallFrame's, exactly as for Prebuilt.
 *
 * Drawn with plain DOM media elements, so the same nodes can later move into a floating window
 * without the call noticing (P1 spike, 2026-11-26). Remote SOUND always plays from elements that
 * never move, so it never pauses.
 */
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
  /** This person's access: while `asking` or `denied` the stage says so instead of the call. */
  access?: CallAccess;
  /**
   * Switch microphone / camera (the frame's setDevices). A blocked or busy device is said ABOVE the
   * call by CallFrame, with "Having trouble?"; the stage does not repeat it.
   */
  setDevices?: (devices: { audioDeviceId?: string; videoDeviceId?: string }) => void;
}

export function DrawnStage({ call, access = null, onLeave, onUseStandard, setDevices }: DrawnStageProps) {
  const { labels } = useVideoUi();
  const devices = useDrawnDevices(call, { microphone: labels.microphone, camera: labels.camera, speaker: labels.speaker }, setDevices);
  // The browser refused to play the call's sound (no click on the page yet): one button fixes it.
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const connection = useDrawnNetwork(call);
  const effects = useDrawnEffects(call);
  // The weak-connection offer is answered once per drop; a good spell lets it come back.
  const [weakDismissed, setWeakDismissed] = useState(false);
  const [lastConnection, setLastConnection] = useState(connection);
  if (connection !== lastConnection) {
    setLastConnection(connection);
    if (connection === 'ok') setWeakDismissed(false);
  }
  const soundRef = useRef<HTMLDivElement>(null);
  const hearCall = () => {
    const els = [...(soundRef.current?.querySelectorAll('audio') ?? [])];
    void Promise.all(els.map((el) => el.play())).then(() => setSoundBlocked(false), () => {});
  };
  // A device change the person did not make is said for a few seconds, then goes.
  const { notice, dismissNotice } = devices;
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(dismissNotice, 6000);
    return () => clearTimeout(t);
  }, [notice, dismissNotice]);
  const [people, setPeople] = useState<DrawnPerson[]>(() => drawnPeople(call.participants() as Record<string, DailyParticipant>));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const standardDetailId = useId();
  // Who is speaking now (Daily's active speaker), for the ring on their tile.
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  // The stage's inner size, so the tiles are fitted to it (as Meet does), not stretched by a grid.
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const css = getComputedStyle(el);
      const width = el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      const height = el.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
      setStage((s) => (s.width === width && s.height === height ? s : { width, height }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => {
      try {
        setPeople(drawnPeople(call.participants() as Record<string, DailyParticipant>));
      } catch {
        /* torn down mid-event */
      }
    };
    const onSpeaker = (e?: { activeSpeaker?: { peerId?: string } }) => setSpeakerId(e?.activeSpeaker?.peerId ?? null);
    const events = ['joined-meeting', 'participant-joined', 'participant-updated', 'participant-left', 'track-started', 'track-stopped'] as const;
    for (const e of events) call.on(e, sync);
    call.on('active-speaker-change', onSpeaker);
    sync();
    return () => {
      for (const e of events) call.off(e, sync);
      call.off('active-speaker-change', onSpeaker);
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
  const chat = useDrawnChat(call, self?.name ?? '', chatOpen);
  const micOff = self ? !self.audioOn : false;
  const camOff = self ? !self.videoOn : false;
  // You are presenting when your own screen track is live; you never see it back (no mirror tunnel).
  const presenting = Boolean(self?.screen);
  const togglePresent = () => {
    try {
      if (presenting) call.stopScreenShare();
      else call.startScreenShare(PRESENT_OPTIONS as never);
    } catch {
      /* not in the call any more */
    }
  };
  const layout = chooseDrawnLayout(people);
  const presenter = presenterOf(people);
  // Meet's tiles: with one other person they are large and you float in the corner; alone you see
  // yourself; with two or more others everyone, you included, shares one grid (you last).
  const tiles = layout === 'focus' ? others : layout === 'waiting' ? (self ? [self] : []) : self ? [...others, self] : others;
  const fit = fitTiles(tiles.length, stage.width, stage.height);
  // A ring only means something with someone to tell apart.
  const ringFor = (p: DrawnPerson) => others.length >= 1 && speakerId === p.id;

  // Spend a weak connection's bandwidth on what is large on screen.
  const layersKey = JSON.stringify(receiveLayers(people, layout));
  useEffect(() => {
    const layers = JSON.parse(layersKey) as Record<string, 0 | 1 | 2>;
    if (Object.keys(layers).length === 0) return;
    const settings: Record<string, { video: { layer: number } }> = {};
    for (const [id, layer] of Object.entries(layers)) settings[id] = { video: { layer } };
    try {
      void Promise.resolve(call.updateReceiveSettings?.(settings)).catch(() => {});
    } catch {
      /* not in a call (yet), or torn down: the default quality stays */
    }
  }, [call, layersKey]);

  return (
    <div className={cx('ve-drawn', chatOpen && 've-drawn--chat')} role="region" aria-label={labels.drawnRegion}>
      {layout === 'share' && presenter?.screen ? (
        <div className="ve-drawn__share" data-layout="share">
          <ShareTile track={presenter.screen} label={labels.drawnPresenting(presenter.name || '?')} />
          <div className="ve-drawn__strip">
            {people.map((p) => (
              <Tile key={p.id} person={p} label={p.local ? labels.drawnYou : p.name || '?'} mutedLabel={labels.drawnMuted} speaking={ringFor(p)} variant="strip" />
            ))}
          </div>
        </div>
      ) : (
        <div
          ref={stageRef}
          className={cx('ve-drawn__grid', `ve-drawn__grid--${layout}`)}
          data-layout={layout}
          data-columns={fit.columns}
          style={{ '--ve-tile-w': `${fit.tileWidth}px` } as CSSProperties}
        >
          {layout === 'waiting' ? <p className="ve-drawn__waiting">{labels.drawnWaiting}</p> : null}
          {tiles.map((p) => (
            <Tile key={p.id} person={p} label={p.local ? labels.drawnYou : p.name || '?'} mutedLabel={labels.drawnMuted} speaking={ringFor(p)} />
          ))}
        </div>
      )}
      {self && layout === 'focus' ? <Tile person={self} label={labels.drawnYou} mutedLabel={labels.drawnMuted} speaking={ringFor(self)} variant="self" /> : null}

      <div className="ve-drawn__sound" hidden ref={soundRef}>
        {others.map((p) => <Sound key={p.id} track={p.audio} sinkId={devices.speakerId} onBlocked={() => setSoundBlocked(true)} />)}
        {others.filter((p) => p.screenAudio).map((p) => <Sound key={`${p.id}-screen`} track={p.screenAudio ?? null} sinkId={devices.speakerId} onBlocked={() => setSoundBlocked(true)} />)}
      </div>

      {access === 'asking' || access === 'denied' ? (
        <div className="ve-drawn__knock" role="status" aria-live="polite">
          {access === 'asking' ? <span className="ve-drawn__knock-pulse" aria-hidden="true" /> : null}
          <p className="ve-drawn__knock-title">{access === 'asking' ? labels.drawnAsking : labels.drawnDenied}</p>
          <p className="ve-drawn__knock-detail">{access === 'asking' ? labels.drawnAskingDetail : labels.drawnDeniedDetail}</p>
        </div>
      ) : null}

      {soundBlocked || notice || connection !== 'ok' || presenting || effects.failed ? (
        <div className="ve-drawn__notices">
          {presenting ? (
            <p className="ve-drawn__notice ve-drawn__notice--present" role="status">
              <PresentIcon width={16} height={16} />
              <span>{labels.drawnPresentingYou}</span>
              <button type="button" className="ve-drawn__notice-btn" onClick={togglePresent}>{labels.drawnPresentStop}</button>
            </p>
          ) : null}
          {effects.failed ? (
            <p className="ve-drawn__notice" role="status">
              <span>{labels.drawnEffectFailed(effects.failed)}</span>
              <button type="button" className="ve-drawn__notice-btn" onClick={effects.dismissFailed}>{labels.drawnDismiss}</button>
            </p>
          ) : null}
          {connection === 'reconnecting' ? (
            <p className="ve-drawn__notice ve-drawn__notice--warn" role="status">
              <span className="ve-drawn__spinner" aria-hidden="true" />
              <span>{labels.drawnReconnecting}</span>
            </p>
          ) : null}
          {connection === 'weak' && !weakDismissed && !camOff ? (
            <p className="ve-drawn__notice" role="status">
              <span>{labels.drawnWeak}</span>
              <button type="button" className="ve-drawn__notice-btn" onClick={() => { call.setLocalVideo(false); setWeakDismissed(true); }}>{labels.drawnWeakVideoOff}</button>
              <button type="button" className="ve-drawn__notice-btn ve-drawn__notice-btn--quiet" onClick={() => setWeakDismissed(true)}>{labels.drawnDismiss}</button>
            </p>
          ) : null}
          {soundBlocked ? (
            <p className="ve-drawn__notice ve-drawn__notice--warn" role="alert">
              <span>{labels.drawnSoundBlocked}</span>
              <button type="button" className="ve-drawn__notice-btn" onClick={hearCall}>{labels.drawnHearCall}</button>
            </p>
          ) : null}
          {notice ? (
            <p className="ve-drawn__notice" role="status">
              <span>{notice.failed ? labels.drawnDeviceFailed(notice.label ?? '', notice.kept ?? null) : labels.drawnDeviceSwitched(notice.kind, notice.label)}</span>
              <button type="button" className="ve-drawn__notice-btn" onClick={dismissNotice}>{labels.drawnDismiss}</button>
            </p>
          ) : null}
        </div>
      ) : null}

      {chatOpen ? <DrawnChatPanel messages={chat.messages} onSend={chat.send} onClose={() => setChatOpen(false)} /> : null}

      <div className="ve-drawn__bar" role="toolbar" aria-label={labels.drawnControls}>
        <DrawnDeviceMenu
          label={labels.drawnMicSettings}
          onChoose={devices.choose}
          sections={[
            { kind: 'microphone', heading: labels.microphone, choices: devices.microphones, selected: devices.micId },
            ...(devices.canChooseSpeaker
              ? [{ kind: 'speaker' as const, heading: labels.speaker, choices: [{ id: '', label: labels.drawnDefaultDevice }, ...devices.speakers], selected: devices.speakerId }]
              : []),
          ]}
        >
          <Control
            label={micOff ? labels.drawnUnmute : labels.drawnMute}
            ariaLabel={micOff ? labels.drawnUnmute : labels.drawnMute}
            pressed={micOff}
            off={micOff}
            onClick={() => call.setLocalAudio(micOff)}
            icon={micOff ? <MicOffIcon /> : <MicIcon />}
          />
        </DrawnDeviceMenu>
        <DrawnDeviceMenu
          label={labels.drawnCameraSettings}
          onChoose={devices.choose}
          sections={[{ kind: 'camera', heading: labels.camera, choices: devices.cameras, selected: devices.cameraId }]}
        >
          <Control
            label={camOff ? labels.drawnVideoStart : labels.drawnVideoStop}
            ariaLabel={camOff ? labels.drawnCameraOn : labels.drawnCameraOff}
            pressed={camOff}
            off={camOff}
            onClick={() => call.setLocalVideo(camOff)}
            icon={camOff ? <CameraOffIcon /> : <CameraIcon />}
          />
        </DrawnDeviceMenu>
        {effects.support.present ? (
          <Control
            label={presenting ? labels.drawnPresentStop : labels.drawnPresent}
            ariaLabel={presenting ? labels.drawnPresentStop : labels.drawnPresent}
            pressed={presenting}
            onClick={togglePresent}
            icon={<PresentIcon />}
          />
        ) : null}
        <span className="ve-ctl-badged">
          <Control
            label={labels.drawnChatShort}
            ariaLabel={chat.unread > 0 ? labels.drawnChatUnread(chat.unread) : labels.drawnChat}
            pressed={chatOpen}
            onClick={() => setChatOpen((o) => !o)}
            icon={<ChatIcon />}
          />
          {chat.unread > 0 ? <span className="ve-ctl-badge" aria-hidden="true">{chat.unread > 9 ? '9+' : chat.unread}</span> : null}
        </span>
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
              {effects.support.noise ? (
                <button type="button" role="menuitemcheckbox" aria-checked={effects.noise} className="ve-drawn__menu-item" onClick={effects.toggleNoise}>
                  <span className="ve-drawn__menu-icon"><NoiseIcon /></span>
                  <span className="ve-drawn__menu-text">
                    <span className="ve-drawn__menu-title">{labels.drawnNoise}</span>
                    <span className="ve-drawn__menu-detail">{labels.drawnNoiseDetail}</span>
                  </span>
                  <span className={cx('ve-switch', effects.noise && 've-switch--on')} aria-hidden="true" />
                </button>
              ) : null}
              {effects.support.blur ? (
                <button type="button" role="menuitemcheckbox" aria-checked={effects.blur} className="ve-drawn__menu-item" onClick={effects.toggleBlur}>
                  <span className="ve-drawn__menu-icon"><BlurIcon /></span>
                  <span className="ve-drawn__menu-text">
                    <span className="ve-drawn__menu-title">{labels.drawnBlur}</span>
                    <span className="ve-drawn__menu-detail">{labels.drawnBlurDetail}</span>
                  </span>
                  <span className={cx('ve-switch', effects.blur && 've-switch--on')} aria-hidden="true" />
                </button>
              ) : null}
              {effects.support.noise || effects.support.blur ? <span className="ve-drawn__menu-sep" role="separator" /> : null}
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
