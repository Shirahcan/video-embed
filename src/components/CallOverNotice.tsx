import { cx, useVideoUi } from '../theme';
import type { CallOverHow } from '../hooks/useCallOverExit';

export interface CallOverNoticeProps {
  over: CallOverHow | null;
  /** Where they are going, in the product's words ("the case", "the vetting floor"). */
  destination: string;
  /** The scratchpad is still saving; the notice waits for it. */
  waitingOnPad?: boolean;
  onGoNow: () => void;
  className?: string;
}

/**
 * The brief "this call has ended" shown to someone the call was ended FOR, before useCallOverExit
 * moves them on. A host who ended it themselves is moved at once and never sees it. Centred,
 * viewport-bounded and scrollable on a short screen.
 */
export function CallOverNotice({ over, destination, waitingOnPad = false, onGoNow, className }: CallOverNoticeProps) {
  const { labels, classNames } = useVideoUi();
  if (over !== 'ended' || waitingOnPad) return null;

  return (
    <div className={cx('ve-over', className)} role="alertdialog" aria-labelledby="ve-over-title">
      <div className="ve-over__card">
        <p id="ve-over-title" className="ve-over__title">{labels.callEnded}</p>
        <p className="ve-over__detail">{labels.callOverMoving(destination)}</p>
        <button type="button" className={cx('ve-btn ve-btn--primary ve-over__go', classNames.button, classNames.buttonPrimary)} onClick={onGoNow}>
          {labels.callOverGoNow}
        </button>
      </div>
    </div>
  );
}
