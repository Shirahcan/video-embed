import { useEffect, useId, useRef, useState } from 'react';
import { cx, useVideoUi } from '../theme';

/** Someone a call can be shared with: a person, or "anyone" (a guest link). */
export interface ShareCallOption {
  /** The product's key for them ("client", "participant:42", "guest"). */
  key: string;
  label: string;
  /** Their part in the call ("Client", "Participant", "Guest"). */
  role: string;
}

/** The product's own backend, which asks video-service (the package never calls the service). */
export interface ShareCallAdapter {
  options: () => Promise<ShareCallOption[]>;
  /** That person's link (made on first ask, the same one after). */
  linkFor: (key: string) => Promise<string>;
}

export interface ShareCallLinkProps {
  adapter: ShareCallAdapter;
  /** The call's name, for the device share sheet. */
  callTitle: string;
  /** `strip`: a compact panel with a line of explanation. `button`: the button alone (a toolbar). */
  variant?: 'strip' | 'button';
  /** Open the dialog from outside (a product menu item), and hear when it closes. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** A short success notice ("Copied"), for the product's toast. */
  onNotice?: (message: string) => void;
  onError?: (error: unknown) => void;
  className?: string;
}

const GUEST = 'guest';

/**
 * Hand someone a way into a call, from wherever the call is shown (the room, the meeting page, a
 * calendar's quick look, an admin's view). Pick a person for their own link, which opens the call
 * as them without signing in, or "Anyone" for a link where the person types a name and asks to
 * join, and the host lets them in. Copy it, or send it through the device's share sheet.
 */
export function ShareCallLink({ adapter, callTitle, variant = 'strip', open: openProp, onOpenChange, onNotice, onError, className }: ShareCallLinkProps) {
  const { labels, classNames } = useVideoUi();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  const button = (
    <button type="button" className={cx('ve-btn', classNames.button)} onClick={() => setOpen(true)}>
      {labels.shareOpen}
    </button>
  );

  return (
    <>
      {variant === 'strip' ? (
        <section className={cx('ve-share', className)} aria-label={labels.shareStripTitle}>
          <div className="ve-share__what">
            <p className="ve-share__title">{labels.shareStripTitle}</p>
            <p className="ve-tx__meta">{labels.shareStripHint}</p>
          </div>
          {button}
        </section>
      ) : openProp === undefined ? (
        button
      ) : null}
      {open ? <ShareCallDialog adapter={adapter} callTitle={callTitle} onClose={() => setOpen(false)} onNotice={onNotice} onError={onError} /> : null}
    </>
  );
}

function ShareCallDialog({ adapter, callTitle, onClose, onNotice, onError }: { adapter: ShareCallAdapter; callTitle: string; onClose: () => void; onNotice?: (m: string) => void; onError?: (e: unknown) => void }) {
  const { labels, classNames } = useVideoUi();
  const ref = useRef<HTMLDialogElement>(null);
  const ids = useId();
  const [options, setOptions] = useState<ShareCallOption[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal?.();
      if (!d.open) d.setAttribute('open', '');
    }
  }, []);

  // The latest error callback, kept out of the effect's dependencies: a product may pass a new
  // closure every render, and that must not re-read the options. Written in an effect.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let live = true;
    adapter.options().then(
      (o) => live && setOptions(o),
      (e) => {
        if (!live) return;
        setOptions([]);
        setFailed(true);
        onErrorRef.current?.(e);
      },
    );
    return () => {
      live = false;
    };
  }, [adapter]);

  const pick = async (key: string) => {
    setChosen(key);
    setCopied(false);
    setFailed(false);
    if (links[key]) return;
    setBusy(true);
    try {
      const url = await adapter.linkFor(key);
      setLinks((l) => ({ ...l, [key]: url }));
    } catch (e) {
      setFailed(true);
      onError?.(e);
    } finally {
      setBusy(false);
    }
  };

  const url = chosen ? links[chosen] ?? null : null;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onNotice?.(labels.shareCopied);
    } catch (e) {
      onError?.(e);
    }
  };

  const share = async () => {
    if (!url) return;
    try {
      await navigator.share({ title: callTitle, text: labels.shareText(callTitle), url });
    } catch (e) {
      // Closing the share sheet is not a failure.
      if (!(e instanceof DOMException && e.name === 'AbortError')) onError?.(e);
    }
  };

  return (
    <dialog
      ref={ref}
      className="ve-reader ve-sharedlg"
      aria-labelledby={`${ids}-t`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="ve-reader__panel">
        <header className="ve-reader__head">
          <h2 id={`${ids}-t`} className="ve-reader__title">{labels.shareTitle}</h2>
          <button type="button" className={cx('ve-menu__trigger', classNames.button)} aria-label={labels.shareClose} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="ve-reader__body">
          <fieldset className="ve-share__who">
            <legend className="ve-share__legend">{labels.shareWho}</legend>
            {options === null ? <p className="ve-tx__meta">{labels.shareLoading}</p> : null}
            {(options ?? []).map((o) => (
              <label key={o.key} className={cx('ve-share__option', chosen === o.key && 'is-selected')}>
                <input type="radio" name={`${ids}-who`} value={o.key} checked={chosen === o.key} onChange={() => void pick(o.key)} disabled={busy} />
                <span className="ve-share__name">{o.label}</span>
                <span className="ve-share__role">{o.role}</span>
              </label>
            ))}
          </fieldset>
          {chosen ? (
            <p className="ve-share__hint">{chosen === GUEST ? labels.shareGuestHint : labels.sharePersonHint}</p>
          ) : null}
          {busy ? <p className="ve-tx__meta" aria-live="polite">{labels.shareMaking}</p> : null}
          {url ? (
            <input className="ve-share__url" readOnly value={url} aria-label={labels.shareCopy} onFocus={(e) => e.currentTarget.select()} />
          ) : null}
          {failed ? <p className="ve-share__error" role="alert">{labels.shareFailed}</p> : null}
        </div>
        <footer className="ve-reader__foot">
          {canShare ? (
            <button type="button" className={cx('ve-btn', classNames.button)} disabled={!url} onClick={() => void share()}>
              {labels.shareShare}
            </button>
          ) : null}
          <button type="button" className={cx('ve-btn ve-btn--primary', classNames.buttonPrimary)} disabled={!url} onClick={() => void copy()}>
            {copied ? labels.shareCopied : labels.shareCopy}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
