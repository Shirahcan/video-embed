import { useCallInAnotherTab } from '../callMemory';
import { cx, useVideoUi } from '../theme';

export interface CallInAnotherTabNoticeProps {
  /** Off: nothing is checked and nothing is drawn (the product's gate). */
  enabled?: boolean;
  className?: string;
}

/**
 * A small note on any page of a second tab while a call runs in another tab of this browser, so a
 * person who opened the product again does not wonder where their call went (or join it twice).
 * A page cannot bring another tab forward, so it only says where the call is.
 */
export function CallInAnotherTabNotice({ enabled = true, className }: CallInAnotherTabNoticeProps) {
  const { labels } = useVideoUi();
  const running = useCallInAnotherTab(enabled);
  if (!running) return null;

  return (
    <p className={cx('ve-hint ve-other-tab', className)} role="status">
      {labels.callInAnotherTab}
    </p>
  );
}
