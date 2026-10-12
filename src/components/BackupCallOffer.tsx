import { useState } from 'react';
import { cx, useVideoUi } from '../theme';

export interface BackupCall {
  /**
   * Make (or fetch) the call's backup meeting and resolve with its URL. The product's backend
   * asks calendar-service, which makes ONE per booking, so everyone who switches lands in the
   * same meeting, and tells the others.
   */
  switchTo: () => Promise<string>;
  /** The backup meeting's URL when one already exists (someone else switched). */
  url?: string | null;
}

export interface BackupCallOfferProps extends BackupCall {
  /** `failure`: shown where the call failed; `notice`: a slim line on a call that still works. */
  variant?: 'failure' | 'notice';
  className?: string;
}

const open = (url: string) => {
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * The last rescue of a call: when its own room cannot be fixed, carry on in a matching Google
 * Meet made on the product's backup account. The same in every product, inside CallFrame's
 * failure screen and on a product's own "the room could not load" screen.
 */
export function BackupCallOffer({ switchTo, url: known = null, variant = 'failure', className }: BackupCallOfferProps) {
  const { labels, classNames } = useVideoUi();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const link = url ?? known;

  const start = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const made = await switchTo();
      setUrl(made);
      open(made);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const primary = cx('ve-btn ve-btn--primary', classNames.button, classNames.buttonPrimary);

  if (variant === 'notice') {
    if (!link) return null;
    return (
      <div className={cx('ve-banner', className)} role="status">
        <span>{labels.backupMoved}</span>
        <button type="button" className={cx('ve-btn', classNames.button)} onClick={() => open(link)}>{labels.backupOpen}</button>
      </div>
    );
  }

  return (
    <div className={cx('ve-backup', className)}>
      {link ? (
        <>
          <button type="button" className={primary} onClick={() => open(link)}>{labels.backupOpen}</button>
          <p className="ve-overlay__fine">{labels.backupSent}</p>
        </>
      ) : (
        <>
          <button type="button" className={primary} disabled={busy} onClick={() => void start()}>
            {busy ? labels.backupSwitching : labels.backupSwitch}
          </button>
          <p className="ve-overlay__fine" role={failed ? 'alert' : undefined}>{failed ? labels.backupFailed : labels.backupHint}</p>
        </>
      )}
    </div>
  );
}
