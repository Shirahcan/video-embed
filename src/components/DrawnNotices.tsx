import type { ReactNode } from 'react';
import { useVideoUi } from '../theme';
import { MicOffIcon, PresentIcon } from './icons';
import type { DrawnDevices } from '../drawnDevices';

/**
 * The drawn screen's notices stack (moved out of DrawnStage, which had grown past its size budget):
 * each line is one condition and its one action. Nothing shows when nothing is wrong.
 */
export interface DrawnNoticesProps {
  floatFailed: boolean;
  onDismissFloat: () => void;
  mutedByHost: boolean;
  onDismissMuted: () => void;
  presenting: boolean;
  onStopPresenting: () => void;
  effectFailed: 'noise' | 'blur' | null;
  onDismissEffect: () => void;
  connection: string;
  showWeak: boolean;
  onVideoOff: () => void;
  onDismissWeak: () => void;
  soundBlocked: boolean;
  onHearCall: () => void;
  notice: DrawnDevices['notice'];
  onDismissNotice: () => void;
  /** Further lines (raised hands, reactions), drawn after the rest. */
  children?: ReactNode;
}

export function DrawnNotices(props: DrawnNoticesProps) {
  const { labels } = useVideoUi();
  const { floatFailed, mutedByHost, presenting, effectFailed, connection, showWeak, soundBlocked, notice, children } = props;
  if (!(soundBlocked || notice || connection === 'reconnecting' || showWeak || presenting || effectFailed || floatFailed || mutedByHost || children)) return null;
  return (
    <div className="ve-drawn__notices">
      {floatFailed ? (
        <p className="ve-drawn__notice" role="status">
          <span>{labels.drawnFloatFailed}</span>
          <button type="button" className="ve-drawn__notice-btn" onClick={props.onDismissFloat}>{labels.drawnDismiss}</button>
        </p>
      ) : null}
      {mutedByHost ? (
        <p className="ve-drawn__notice" role="status">
          <MicOffIcon width={16} height={16} />
          <span>{labels.drawnMutedByHost}</span>
          <button type="button" className="ve-drawn__notice-btn" onClick={props.onDismissMuted}>{labels.drawnDismiss}</button>
        </p>
      ) : null}
      {presenting ? (
        <p className="ve-drawn__notice ve-drawn__notice--present" role="status">
          <PresentIcon width={16} height={16} />
          <span>{labels.drawnPresentingYou}</span>
          <button type="button" className="ve-drawn__notice-btn" onClick={props.onStopPresenting}>{labels.drawnPresentStop}</button>
        </p>
      ) : null}
      {effectFailed ? (
        <p className="ve-drawn__notice" role="status">
          <span>{labels.drawnEffectFailed(effectFailed)}</span>
          <button type="button" className="ve-drawn__notice-btn" onClick={props.onDismissEffect}>{labels.drawnDismiss}</button>
        </p>
      ) : null}
      {connection === 'reconnecting' ? (
        <p className="ve-drawn__notice ve-drawn__notice--warn" role="status">
          <span className="ve-drawn__spinner" aria-hidden="true" />
          <span>{labels.drawnReconnecting}</span>
        </p>
      ) : null}
      {showWeak ? (
        <p className="ve-drawn__notice" role="status">
          <span>{labels.drawnWeak}</span>
          <button type="button" className="ve-drawn__notice-btn" onClick={props.onVideoOff}>{labels.drawnWeakVideoOff}</button>
          <button type="button" className="ve-drawn__notice-btn ve-drawn__notice-btn--quiet" onClick={props.onDismissWeak}>{labels.drawnDismiss}</button>
        </p>
      ) : null}
      {soundBlocked ? (
        <p className="ve-drawn__notice ve-drawn__notice--warn" role="alert">
          <span>{labels.drawnSoundBlocked}</span>
          <button type="button" className="ve-drawn__notice-btn" onClick={props.onHearCall}>{labels.drawnHearCall}</button>
        </p>
      ) : null}
      {notice ? (
        <p className="ve-drawn__notice" role="status">
          <span>{notice.failed ? labels.drawnDeviceFailed(notice.label ?? '', notice.kept ?? null) : labels.drawnDeviceSwitched(notice.kind, notice.label)}</span>
          <button type="button" className="ve-drawn__notice-btn" onClick={props.onDismissNotice}>{labels.drawnDismiss}</button>
        </p>
      ) : null}
      {children}
    </div>
  );
}
