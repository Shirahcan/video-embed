import type { ReactNode } from 'react';
import { cx, useVideoUi } from '../theme';

/** video-service's answer (GET /v1/rooms/{name}/transcript-status), plus the product's own. */
export type TranscriptState =
  | 'not_transcribed'
  | 'not_started'
  | 'no_call'
  | 'in_call'
  | 'preparing'
  | 'ready'
  | 'overdue'
  /** The product could not find out (the service did not answer). */
  | 'unknown';

export interface TranscriptStatusProps {
  state: TranscriptState;
  /** "by 6:40 PM West Africa Time": the product formats the service's `expected_by` in its own zone rules. */
  expectedByLabel?: string | null;
  /** The service's `ready_within_minutes`, for the "usually within" sentence. */
  readyWithinMinutes?: number;
  /** The product's own reason, shown under `unknown` (or to add detail to any state). */
  reason?: string | null;
  /** Offered where a record can sensibly be added by hand; absent hides the button. */
  onAdd?: () => void;
  /** Extra actions (view, download) once the product holds the transcript. */
  actions?: ReactNode;
  className?: string;
}

/** States where nothing is wrong yet: drawn quiet, never as a warning. */
const CALM: ReadonlySet<TranscriptState> = new Set(['not_started', 'in_call', 'preparing', 'ready']);
/** States where a record added by hand is the sensible way forward. */
const ADDABLE: ReadonlySet<TranscriptState> = new Set(['not_transcribed', 'no_call', 'overdue', 'unknown', 'not_started']);

/**
 * Where a call's transcript is, said the same way in every product (owner 2026-10-06). The
 * state comes from video-service, which reads Daily's own records, so no product guesses: a
 * call still on, or one Daily is still writing up, is never called "ended without a
 * transcript". Only an absence that is really a problem is drawn as one, and "Add transcript"
 * is offered only where a record by hand makes sense (never while one is on its way, which
 * would leave two records of one call).
 */
export function TranscriptStatus({ state, expectedByLabel, readyWithinMinutes = 60, reason, onAdd, actions, className }: TranscriptStatusProps) {
  const { labels, classNames } = useVideoUi();
  const calm = CALM.has(state);
  const detail = labels.transcriptDetail(state, { expectedByLabel: expectedByLabel ?? null, readyWithinMinutes });

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
        {onAdd && ADDABLE.has(state) ? (
          <button type="button" className={cx('ve-btn', classNames.button)} onClick={onAdd}>
            {labels.transcriptAdd}
          </button>
        ) : null}
      </div>
    </div>
  );
}
