import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx, useVideoUi } from '../theme';

export interface TranscriptReaderProps {
  open: boolean;
  onClose: () => void;
  /** "Porter's recap", "Tidied transcript", "As spoken": what is being read. */
  title: string;
  /** A line under the title: when the call was, how long. */
  subtitle?: string | null;
  /** Plain text (kept line breaks, copyable) or the product's own rendering (a recap). */
  text?: string | null;
  children?: ReactNode;
  /** The text "Copy text" copies; defaults to `text`. Absent and no `text`: no copy button. */
  copyText?: string | null;
  onError?: (error: unknown) => void;
  className?: string;
}

/**
 * Reads one of a call's three records (recap, tidied, as spoken) in a modal, the same in every
 * product. A native dialog (focus trap, Escape, inert page) bounded to the viewport: the header
 * and footer stay put and the body scrolls, so a long call is readable on a short screen.
 */
export function TranscriptReader({ open, onClose, title, subtitle, text, children, copyText, onError, className }: TranscriptReaderProps) {
  const { labels, classNames } = useVideoUi();
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const toCopy = copyText ?? text ?? null;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal?.();
      if (!d.open) d.setAttribute('open', '');
    } else if (!open && d.open) {
      d.close?.();
      d.removeAttribute('open');
    }
  }, [open]);

  const copy = async () => {
    if (!toCopy) return;
    try {
      await navigator.clipboard.writeText(toCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      onError?.(e);
    }
  };

  return (
    <dialog
      ref={ref}
      className={cx('ve-reader', className)}
      aria-labelledby="ve-reader-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop (the dialog box itself, outside its panel) closes it.
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className="ve-reader__panel">
          <header className="ve-reader__head">
            <div>
              <h2 id="ve-reader-title" className="ve-reader__title">{title}</h2>
              {subtitle ? <p className="ve-tx__meta">{subtitle}</p> : null}
            </div>
            <button type="button" className={cx('ve-menu__trigger', classNames.button)} aria-label={labels.readerClose} onClick={onClose}>
              ×
            </button>
          </header>
          <div className="ve-reader__body">{children ?? <pre className="ve-reader__text">{text}</pre>}</div>
          <footer className="ve-reader__foot">
            {toCopy ? (
              <button type="button" className={cx('ve-btn', classNames.button)} onClick={() => void copy()}>
                {copied ? labels.readerCopied : labels.readerCopy}
              </button>
            ) : null}
            <button type="button" className={cx('ve-btn ve-btn--primary', classNames.buttonPrimary)} onClick={onClose}>
              {labels.readerClose}
            </button>
          </footer>
        </div>
      ) : null}
    </dialog>
  );
}
