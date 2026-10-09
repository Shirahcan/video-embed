import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { cx, useVideoUi } from '../theme';
import { ActionMenu } from './ActionMenu';

/** One transcript of a call as video-service keeps it (GET /v1/calls/{ref}/transcripts). */
export interface CallTranscriptItem {
  id: string;
  source: 'captured' | 'supplied';
  status: 'ready' | 'in_progress' | 'error' | string;
  text?: string | null;
  /** The product's tidied text (its AI), when it has made one. */
  cleanText?: string | null;
  durationSeconds?: number;
  createdAt?: string | null;
  /** Who supplied it, as the product names them (a supplied transcript only). */
  suppliedByName?: string | null;
}

/** Where the panel reads a call's transcripts. The product's endpoint relays the service. */
export interface CallTranscriptsAdapter {
  list: () => Promise<CallTranscriptItem[]>;
}

export interface CallTranscriptsState {
  items: CallTranscriptItem[];
  status: 'loading' | 'ready' | 'error';
  reload: () => Promise<void>;
}

/** A call's transcripts, loaded once and on reload (after the product adds one). */
export function useCallTranscripts(adapter: CallTranscriptsAdapter): CallTranscriptsState {
  const [items, setItems] = useState<CallTranscriptItem[]>([]);
  const [status, setStatus] = useState<CallTranscriptsState['status']>('loading');

  const reload = useCallback(async () => {
    try {
      setItems(await adapter.list());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [adapter]);

  useEffect(() => {
    let live = true;
    adapter.list().then(
      (rows) => live && (setItems(rows), setStatus('ready')),
      () => live && setStatus('error'),
    );
    return () => {
      live = false;
    };
  }, [adapter]);

  return { items, status, reload };
}

export interface TranscriptPanelProps {
  transcripts: CallTranscriptsState;
  /** "Oct 9, 2026, 2:00 PM WAT": the product formats a moment by its own time rules. */
  formatWhen?: (iso: string) => string;
  /** The product's own block above a transcript's text (Portify: Porter's recap). */
  renderRecap?: (item: CallTranscriptItem) => ReactNode;
  /** Shown in the heading row: the product's way to add a record by hand. */
  onAdd?: () => void;
  onNotice?: (message: string) => void;
  onError?: (error: unknown) => void;
  /** Render nothing while there is no transcript (default), or the heading with `empty`. */
  empty?: ReactNode;
  className?: string;
}

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function TranscriptCard({ item, formatWhen, renderRecap, onNotice, onError }: { item: CallTranscriptItem } & Pick<TranscriptPanelProps, 'formatWhen' | 'renderRecap' | 'onNotice' | 'onError'>) {
  const { labels, classNames } = useVideoUi();
  const [open, setOpen] = useState(false);
  const hasClean = !!item.cleanText?.trim();
  const [tidied, setTidied] = useState(hasClean);
  const text = (tidied && hasClean ? item.cleanText : item.text) ?? '';

  if (item.status === 'in_progress') return <p className="ve-tx__note">{labels.transcriptPreparing}</p>;
  if (item.status !== 'ready') return <p className="ve-tx__note ve-tx__note--warn">{labels.transcriptFailed}</p>;

  const when = item.createdAt ? (formatWhen ? formatWhen(item.createdAt) : new Date(item.createdAt).toLocaleString()) : null;
  const meta = [when, item.source === 'supplied' ? labels.transcriptAddedBy(item.suppliedByName ?? null) : item.durationSeconds ? labels.transcriptLength(item.durationSeconds) : null]
    .filter(Boolean)
    .join(', ');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      onNotice?.(labels.transcriptCopied);
    } catch (e) {
      onError?.(e);
    }
  };

  return (
    <div className="ve-tx__card">
      <div className="ve-tx__row">
        <p className="ve-tx__meta">{meta}</p>
        <ActionMenu
          label={labels.transcriptActions}
          items={[
            { label: labels.transcriptCopy, onSelect: () => void copy() },
            { label: labels.transcriptDownloadText, onSelect: () => download(text, `call-transcript-${item.createdAt?.slice(0, 10) ?? item.id}.txt`) },
          ]}
        />
      </div>
      {renderRecap?.(item)}
      {item.text ? (
        <div>
          <div className="ve-tx__row">
            <button type="button" className={cx('ve-tx__toggle', classNames.button)} aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? labels.transcriptHide : labels.transcriptShow}
            </button>
            {open && hasClean ? (
              <span className="ve-tx__seg" role="group">
                <button type="button" aria-pressed={tidied} onClick={() => setTidied(true)}>{labels.transcriptTidied}</button>
                <button type="button" aria-pressed={!tidied} onClick={() => setTidied(false)}>{labels.transcriptAsSpoken}</button>
              </span>
            ) : null}
          </div>
          {open ? <pre className="ve-tx__text">{text}</pre> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A call's transcripts, the same in every product (owner 2026-10-09: video-service keeps them by
 * the call). Captured and supplied ones read alike; a supplied one says who added it. Copy and
 * download sit behind one kebab. The product adds its own recap above the text and its own way
 * to add a record (`onAdd`). Renders nothing while there is nothing to show, unless `empty`.
 */
export function TranscriptPanel({ transcripts, formatWhen, renderRecap, onAdd, onNotice, onError, empty, className }: TranscriptPanelProps) {
  const { labels, classNames } = useVideoUi();
  const { items, status } = transcripts;
  if (status === 'loading' || (items.length === 0 && empty === undefined && !onAdd)) return null;
  if (status === 'error' && items.length === 0) return null;

  return (
    <section className={cx('ve-tx', classNames.transcript, className)} aria-label={labels.transcriptsHeading}>
      <div className="ve-tx__row">
        <h2 className="ve-tx__heading">{labels.transcriptsHeading}</h2>
        {onAdd ? (
          <button type="button" className={cx('ve-btn', classNames.button)} onClick={onAdd}>
            {labels.transcriptAdd}
          </button>
        ) : null}
      </div>
      {items.length === 0 ? empty ?? null : items.map((item) => (
        <TranscriptCard key={item.id} item={item} formatWhen={formatWhen} renderRecap={renderRecap} onNotice={onNotice} onError={onError} />
      ))}
    </section>
  );
}
