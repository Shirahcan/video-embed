import { useEffect, useRef, useState } from 'react';
import { useVideoUi } from '../theme';
import { REACTIONS, type Reaction } from '../drawnHands';
import { Control } from './DrawnControl';
import { ReactIcon } from './icons';

/**
 * The drawn screen's React control (F2): a small row of emoji above the bar. Choosing one shows it over
 * the sender's tile for everyone for a few seconds; the picker stays open so a second one is one click.
 */
export function DrawnReactMenu({ onReact }: { onReact: (emoji: Reaction) => void }) {
  const { labels } = useVideoUi();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <span className="ve-drawn__menu" ref={ref}>
      <Control label={labels.drawnReactShort} ariaLabel={labels.drawnReact} expanded={open} onClick={() => setOpen((o) => !o)} icon={<ReactIcon />} />
      {open ? (
        <span className="ve-drawn__menu-list ve-react" role="menu" aria-label={labels.drawnReact}>
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              className="ve-react__btn"
              aria-label={labels.drawnReactionName(emoji)}
              title={labels.drawnReactionName(emoji)}
              onClick={() => onReact(emoji)}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
