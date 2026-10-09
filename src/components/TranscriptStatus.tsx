import type { ReactNode } from 'react';
import { cx, useVideoUi } from '../theme';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';

/** video-service's answer (GET /v1/rooms/{name}/transcript-status), plus the product's own. */
export type TranscriptState =
  | 'not_transcribed'
  | 'not_started'
  | 'no_call'
  | 'in_call'
  | 'preparing'
  | 'ready'
  | 'overdue'
  /** The product holds the transcript: it can be viewed, downloaded or replaced. */
  | 'held'
  /** The product could not find out (the service did not answer). */
  | 'unknown';

export interface TranscriptStatusProps {
  state: TranscriptState;
  /** "by 6:40 PM West Africa Time": the product formats the service's `expected_by` in its own zone rules. */
  expectedByLabel?: string | null;
  /** The service's `ready_within_minutes`, for the "usually within" sentence. */
  readyWithinMinutes?: number;
  /** The product's own reason, shown under `unknown`. */
  reason?: string | null;
  /**
   * The product's own sentence IN PLACE OF the state's default. For a product that could not
   * ask the service (no room yet, service off) and so cannot honestly claim the service's
   * timings ("more than 60 minutes ago").
   */
  detail?: string | null;
  /** Offered where a record can sensibly be added by hand; absent hides the button. */
  onAdd?: () => void;
  /**
   * The three readings of a held transcript (owner 2026-10-09), each opening it in the
   * TranscriptReader: the product's recap of the call, its tidied text, and the words as spoken.
   * Offered only under `held`, and only those the product has.
   */
  onReadRecap?: () => void;
  onReadTidied?: () => void;
  onReadAsSpoken?: () => void;
  /** Open the transcript. With download and replace, these sit behind ONE kebab menu. */
  onView?: () => void;
  onDownload?: () => void;
  /**
   * Put a better record in place of the one held (a cleaner export, the right call's file). Only
   * offered under `held`: before there is a transcript, adding one is `onAdd`.
   */
  onReplace?: () => void;
  /** The menu action that is running (the item reads "Working..." and cannot be chosen twice). */
  working?: 'view' | 'download' | 'replace' | null;
  /**
   * @deprecated Loose buttons beside the strip. Use onView / onDownload / onReplace, which sit
   * behind one menu so the row never grows a line of buttons.
   */
  actions?: ReactNode;
  className?: string;
}

/** States where nothing is wrong yet: drawn quiet, never as a warning. */
const CALM: ReadonlySet<TranscriptState> = new Set(['not_started', 'in_call', 'preparing', 'ready', 'held']);
/** States where a record added by hand is the sensible way forward. */
const ADDABLE: ReadonlySet<TranscriptState> = new Set(['not_transcribed', 'no_call', 'overdue', 'unknown', 'not_started']);

/**
 * Where a call's transcript is, said the same way in every product (owner 2026-10-06). The
 * state comes from video-service, which reads Daily's own records, so no product guesses: a
 * call still on, or one Daily is still writing up, is never called "ended without a
 * transcript". Only an absence that is really a problem is drawn as one, and "Add transcript"
 * is offered only where a record by hand makes sense (never while one is on its way, which
 * would leave two records of one call). Once the product holds it (`held`), view, download and
 * replace sit behind one kebab menu (owner 2026-10-08); a single action stays a plain button.
 */
export function TranscriptStatus({ state, expectedByLabel, readyWithinMinutes = 60, reason, detail: override, onAdd, onReadRecap, onReadTidied, onReadAsSpoken, onView, onDownload, onReplace, working = null, actions, className }: TranscriptStatusProps) {
  const { labels, classNames } = useVideoUi();
  const calm = CALM.has(state);
  const detail = override?.trim() ? override : labels.transcriptDetail(state, { expectedByLabel: expectedByLabel ?? null, readyWithinMinutes });
  const item = (key: 'view' | 'download' | 'replace', label: string, run?: () => void): ActionMenuItem[] =>
    run ? [{ label: working === key ? labels.transcriptWorking : label, onSelect: run, disabled: working !== null }] : [];
  const read = (label: string, run?: () => void): ActionMenuItem[] =>
    state === 'held' && run ? [{ label, onSelect: run, disabled: working !== null }] : [];
  const menu = [
    ...read(labels.transcriptReadRecap, onReadRecap),
    ...read(labels.transcriptReadTidied, onReadTidied),
    ...read(labels.transcriptReadAsSpoken, onReadAsSpoken),
    ...item('view', labels.transcriptView, onView),
    ...item('download', labels.transcriptDownload, onDownload),
    ...(state === 'held' ? item('replace', labels.transcriptReplace, onReplace) : []),
  ];
  const only = menu.length === 1 ? menu[0] : undefined;

  return (
    <div className={cx('ve-transcript', calm ? 've-transcript--calm' : 've-transcript--warn', classNames.transcript, className)} role="status">
      <div className="ve-transcript__text">
        <p className="ve-transcript__title">{labels.transcriptTitle(state)}</p>
        <p className="ve-transcript__detail">
          {detail}
          {reason && state === 'unknown' ? ` ${reason}` : ''}
        </p>
      </div>
      <div className="ve-transcript__actions">
        {actions}
        {only ? (
          <button type="button" className={cx('ve-btn', classNames.button)} disabled={only.disabled} onClick={only.onSelect}>
            {only.label}
          </button>
        ) : null}
        {menu.length > 1 ? <ActionMenu label={labels.transcriptActions} items={menu} /> : null}
        {onAdd && ADDABLE.has(state) ? (
          <button type="button" className={cx('ve-btn', classNames.button)} onClick={onAdd}>
            {labels.transcriptAdd}
          </button>
        ) : null}
      </div>
    </div>
  );
}
