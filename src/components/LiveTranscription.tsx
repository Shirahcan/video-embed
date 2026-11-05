import { cx, useVideoUi } from '../theme';

/** video-service's answer (GET /v1/rooms/{name}/transcription), as the product passes it on. */
export interface LiveTranscriptionState {
  /** Daily says transcription is running in the call's current session. */
  running: boolean;
  /** Who is in the call now (the service's own presence record). */
  present: string[];
  /** The room still admits people (not ended, not past its close). */
  open: boolean;
}

export interface LiveTranscriptionProps {
  /** Null while the product has not heard: renders nothing. */
  state: LiveTranscriptionState | null;
  /**
   * Start it now (the product calls video-service's POST /v1/rooms/{name}/transcription/start
   * for a person allowed to). Absent: the strip reports the state and offers nothing.
   */
  onStart?: () => void;
  /** The start is in flight. */
  starting?: boolean;
  /** The product asked and the service accepted: says so until the state shows it running. */
  asked?: boolean;
  /** Why the last start was refused, in the service's words. */
  error?: string | null;
  className?: string;
}

/**
 * A call's LIVE transcription, said the same way in every product (owner 2026-11-05), with the
 * way to start it when it is not running. video-service starts transcription itself on the first
 * join; this is for the person an alert reached ("A call is not being transcribed") and anyone
 * looking at a call in progress: it says whether the call is being transcribed now and, when
 * somebody is in it and it is not, offers "Start transcription".
 *
 * Renders nothing for a call whose room has closed: there is nothing left to start.
 */
export function LiveTranscription({ state, onStart, starting = false, asked = false, error = null, className }: LiveTranscriptionProps) {
  const { labels, classNames } = useVideoUi();
  if (state === null || !state.open) return null;

  const someone = state.present.length > 0;
  const warn = !state.running && someone;
  const title = state.running
    ? labels.liveTranscriptionRunningTitle
    : someone ? labels.liveTranscriptionStoppedTitle : labels.liveTranscriptionWaitingTitle;
  const detail = state.running
    ? labels.liveTranscriptionRunningDetail
    : asked ? labels.liveTranscriptionAsked
      : someone ? labels.liveTranscriptionStoppedDetail(state.present.length) : labels.liveTranscriptionWaitingDetail;

  return (
    <div className={cx('ve-transcript', warn ? 've-transcript--warn' : 've-transcript--calm', classNames.transcript, className)} role="status">
      <div className="ve-transcript__text">
        <p className="ve-transcript__title">{title}</p>
        <p className="ve-transcript__detail">{detail}</p>
        {error ? <p className="ve-transcript__detail" role="alert">{error}</p> : null}
      </div>
      {warn && onStart ? (
        <div className="ve-transcript__actions">
          <button type="button" className={cx('ve-btn', classNames.button)} disabled={starting} onClick={onStart}>
            {starting ? labels.liveTranscriptionStarting : labels.liveTranscriptionStart}
          </button>
        </div>
      ) : null}
    </div>
  );
}
