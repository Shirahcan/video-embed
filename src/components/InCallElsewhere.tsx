import { cx, useVideoUi } from '../theme';

export interface InCallElsewhereProps {
  /** True when the call was moved AWAY from this device (it has already left). */
  moved?: boolean;
  /** When the person joined on their other device (ISO), shown as a time. */
  since?: string | null;
  /** Move the call here: the other device leaves on its next beat. */
  onSwitchHere: () => void;
  /** Join here as well, with microphone and camera off. Not offered once the call moved away. */
  onJoinHereToo?: () => void;
}

/**
 * Call continuity (the same in every product): this person is already in the call on another device.
 * Before joining it offers "Switch here" or "Join here too" (muted, so two microphones of one person
 * never echo); after the call was moved away from this device it says so and offers to move it back.
 */
export function InCallElsewhere({ moved = false, since = null, onSwitchHere, onJoinHereToo }: InCallElsewhereProps) {
  const { labels, classNames } = useVideoUi();
  const at = since ? new Date(since) : null;
  const time = at && !Number.isNaN(at.getTime()) ? at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;

  return (
    <div className="ve-overlay" role="alertdialog" aria-labelledby="ve-elsewhere-title">
      <p id="ve-elsewhere-title" className="ve-overlay__title">{moved ? labels.movedElsewhereTitle : labels.inCallElsewhereTitle}</p>
      <p className="ve-overlay__detail">{moved ? labels.movedElsewhereDetail : labels.inCallElsewhereDetail(time)}</p>
      <div className="ve-overlay__actions">
        <button type="button" className={cx('ve-btn ve-btn--primary', classNames.button, classNames.buttonPrimary)} onClick={onSwitchHere}>
          {moved ? labels.moveCallBackHere : labels.switchHere}
        </button>
        {!moved && onJoinHereToo ? (
          <button type="button" className={cx('ve-btn', classNames.button)} onClick={onJoinHereToo}>
            {labels.joinHereToo}
          </button>
        ) : null}
      </div>
    </div>
  );
}
