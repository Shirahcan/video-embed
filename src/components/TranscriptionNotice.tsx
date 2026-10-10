import { cx, useVideoUi } from '../theme';

export interface TranscriptionNoticeProps {
  /**
   * Who is reading it: the HOST keeps the record; everyone else (an invited person or a guest)
   * is told who keeps it and whom to ask.
   */
  audience: 'host' | 'attendee';
  className?: string;
}

/** The notice shown in a call that is being transcribed, worded for who is reading it. */
export function TranscriptionNotice({ audience, className }: TranscriptionNoticeProps) {
  const { labels } = useVideoUi();

  return (
    <p className={cx('ve-notice', className)} role="note">
      {audience === 'host' ? labels.transcriptionNoticeHost : labels.transcriptionNoticeAttendee}
    </p>
  );
}
