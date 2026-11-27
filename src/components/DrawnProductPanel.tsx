import { useEffect, useRef, type ReactNode } from 'react';
import { useVideoUi } from '../theme';
import { CloseIcon } from './icons';

/**
 * A side panel a PRODUCT adds to the drawn call (F3): notes, the meeting's details, an assistant. The
 * kit draws the bar control, the panel frame and its scrolling body; the product draws only what goes
 * inside. One panel at a time shares the slot with Chat and People, and none show in the float or the
 * corner window (the four-button rule).
 */
export interface CallPanel {
  /** Unique among the product's panels. */
  key: string;
  /** The short label under the bar control ("Notes"). */
  label: string;
  /** The panel's heading and the control's accessible name; defaults to `label`. */
  title?: string;
  icon: ReactNode;
  /** Bar folding order (lower folds into More first). Chat is 3, People 4; default 2. */
  priority?: number;
  /** A count on the control (unread items, say); 0 or absent shows none. */
  badge?: number;
  /** The panel's content. Called only while the panel is open. */
  render: () => ReactNode;
}

export function DrawnProductPanel({ panel, onClose }: { panel: CallPanel; onClose: () => void }) {
  const { labels } = useVideoUi();
  const closeRef = useRef<HTMLButtonElement>(null);
  const title = panel.title ?? panel.label;

  useEffect(() => {
    closeRef.current?.focus();
  }, [panel.key]);

  return (
    <section className="ve-chat ve-panel" aria-label={title} data-panel={panel.key}>
      <header className="ve-chat__head">
        <h2 className="ve-chat__title">{title}</h2>
        <button ref={closeRef} type="button" className="ve-chat__close" aria-label={labels.drawnPanelClose(title)} title={labels.drawnPanelClose(title)} onClick={onClose}>
          <CloseIcon width={18} height={18} />
        </button>
      </header>
      <div className="ve-panel__body">{panel.render()}</div>
    </section>
  );
}
