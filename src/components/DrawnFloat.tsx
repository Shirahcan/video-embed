import type { ReactNode } from 'react';
import type { DrawnPerson } from '../drawnLayout';
import { cx, useVideoUi } from '../theme';
import { ShareTile, Tile } from './DrawnTile';
import { BackToTabIcon, CameraIcon, CameraOffIcon, LeaveIcon, MicIcon, MicOffIcon } from './icons';

/**
 * The call in the floating window: made for a small window (360x420 by default, resizable). The
 * person you are talking to (or the shared screen) fills it, you sit small in the corner, and one
 * row of icon-only round buttons runs along the bottom, clear of every tile. Container queries in
 * the stylesheet re-flow it as the window is resized. Labels are tooltips and accessible names.
 */
export function DrawnFloat({ main, presenterScreen, presenterName, self, micOff, camOff, mirror, speakingId, onMic, onCam, onBack, onLeave, backLabel, clock = null, className }: {
  /** Who fills the window: the other person (or the loudest of several), null while alone. */
  main: DrawnPerson | null;
  presenterScreen: MediaStreamTrack | null;
  presenterName: string;
  self: DrawnPerson | null;
  micOff: boolean;
  camOff: boolean;
  mirror: boolean;
  speakingId: string | null;
  onMic: () => void;
  onCam: () => void;
  onBack: () => void;
  onLeave: () => void;
  /** The way back: "Back to the tab" in the floating window, "Back to the call" in the corner window. */
  backLabel?: string;
  /** The call clock, shown over the speaker (the corner window). */
  clock?: ReactNode;
  className?: string;
}) {
  const { labels } = useVideoUi();
  return (
    <div className={cx('ve-float', className)} role="region" aria-label={labels.drawnRegion}>
      {clock ? <span className="ve-float__clock">{clock}</span> : null}
      <div className="ve-float__main">
        {presenterScreen ? (
          <ShareTile track={presenterScreen} label={labels.drawnPresenting(presenterName || '?')} />
        ) : main ? (
          <Tile person={main} label={main.name || '?'} mutedLabel={labels.drawnMuted} speaking={speakingId === main.id} />
        ) : self ? (
          <Tile person={self} label={labels.drawnYou} mutedLabel={labels.drawnMuted} mirror={mirror} />
        ) : null}
        {!main && !presenterScreen ? <p className="ve-float__waiting">{labels.drawnWaiting}</p> : null}
      </div>
      {self && (main || presenterScreen) ? (
        <div className="ve-float__self">
          <Tile person={self} label={labels.drawnYou} mutedLabel={labels.drawnMuted} mirror={mirror} variant="strip" />
        </div>
      ) : null}
      <div className="ve-float__bar" role="toolbar" aria-label={labels.drawnControls}>
        <FloatButton label={micOff ? labels.drawnUnmute : labels.drawnMute} off={micOff} pressed={micOff} onClick={onMic} icon={micOff ? <MicOffIcon /> : <MicIcon />} />
        <FloatButton label={camOff ? labels.drawnCameraOn : labels.drawnCameraOff} off={camOff} pressed={camOff} onClick={onCam} icon={camOff ? <CameraOffIcon /> : <CameraIcon />} />
        <FloatButton label={backLabel ?? labels.drawnFloatBack} onClick={onBack} icon={<BackToTabIcon />} />
        <FloatButton label={labels.drawnLeave} danger onClick={onLeave} icon={<LeaveIcon />} />
      </div>
    </div>
  );
}

function FloatButton({ label, icon, onClick, pressed, off = false, danger = false }: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  off?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx('ve-float__btn', off && 've-float__btn--off', danger && 've-float__btn--danger')}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}
