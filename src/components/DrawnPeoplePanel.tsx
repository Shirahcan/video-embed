import { useEffect, useRef, useState } from 'react';
import type { DrawnPerson } from '../drawnLayout';
import type { WaitingPerson } from '../hooks/useDailyFrame';
import { cx, useVideoUi } from '../theme';
import { CameraOffIcon, CloseIcon, HandIcon, KebabIcon, MicIcon, MicOffIcon } from './icons';

export interface DrawnPeoplePanelProps {
  people: DrawnPerson[];
  /** People asking to be let in (a host's list; empty for everyone else). */
  waiting: WaitingPerson[];
  onAnswer?: (id: string, letIn: boolean) => void;
  /** Present when this person may mute and remove others (the host). */
  host?: { mute: (id: string) => void; remove: (id: string) => void; lowerHand: (id: string) => void } | null;
  onClose: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** One person's row actions for a host: Mute, then Remove from the call (asks first). */
function RowMenu({ person, onMute, onRemove, onLowerHand }: { person: DrawnPerson; onMute: () => void; onRemove: () => void; onLowerHand: () => void }) {
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

  const name = person.name || labels.knockSomeone;
  return (
    <span className="ve-people__menu" ref={ref}>
      <button
        type="button"
        className="ve-people__kebab"
        aria-label={labels.drawnPersonActions(name)}
        title={labels.drawnPersonActions(name)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <KebabIcon width={18} height={18} />
      </button>
      {open ? (
        <span className="ve-people__menu-list" role="menu" aria-label={labels.drawnPersonActions(name)}>
          {person.handAt ? (
            <button
              type="button"
              role="menuitem"
              className="ve-people__menu-item"
              onClick={() => {
                setOpen(false);
                onLowerHand();
              }}
            >
              {labels.drawnPeopleLowerHand}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="ve-people__menu-item"
            disabled={!person.audioOn}
            onClick={() => {
              setOpen(false);
              onMute();
            }}
          >
            {person.audioOn ? labels.drawnPeopleMute : labels.drawnPeopleAlreadyMuted}
          </button>
          <span className="ve-people__menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="ve-people__menu-item ve-people__menu-item--danger"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            {labels.drawnPeopleRemove}
          </button>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Who is in the call (F1, owner 2026-11-26): a panel in the chat's place, so it slides over the stage
 * and never shrinks the call. Everyone sees the list with each person's microphone and camera; a host
 * also lets in the people waiting, and mutes or removes someone from that person's row menu.
 */
export function DrawnPeoplePanel({ people, waiting, onAnswer, host = null, onClose }: DrawnPeoplePanelProps) {
  const { labels } = useVideoUi();
  const [removing, setRemoving] = useState<DrawnPerson | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Raised hands first, in the order they went up (F2); then the viewer, then by name.
  const sorted = [...people].sort((a, b) => {
    const ah = a.handAt ?? null;
    const bh = b.handAt ?? null;
    if (ah !== null || bh !== null) {
      if (ah === null) return 1;
      if (bh === null) return -1;
      if (ah !== bh) return ah - bh;
    }
    return Number(b.local) - Number(a.local) || a.name.localeCompare(b.name);
  });

  return (
    <section className="ve-chat ve-people" aria-label={labels.drawnPeopleTitle}>
      <header className="ve-chat__head">
        <h2 className="ve-chat__title">{labels.drawnPeopleTitle}</h2>
        <button ref={closeRef} type="button" className="ve-chat__close" aria-label={labels.drawnPeopleClose} title={labels.drawnPeopleClose} onClick={onClose}>
          <CloseIcon width={18} height={18} />
        </button>
      </header>

      <div className="ve-people__body">
        {waiting.length > 0 ? (
          <>
            <h3 className="ve-people__heading">{labels.drawnPeopleWaiting(waiting.length)}</h3>
            <ul className="ve-people__list">
              {waiting.map((w) => (
                <li key={w.id} className="ve-people__row">
                  <span className="ve-people__avatar" aria-hidden="true">{initials(w.name)}</span>
                  <span className="ve-people__name">{w.name || labels.knockSomeone}</span>
                  {onAnswer ? (
                    <span className="ve-people__answer">
                      <button type="button" className="ve-people__btn" onClick={() => onAnswer(w.id, false)}>{labels.knockDeny}</button>
                      <button type="button" className="ve-people__btn ve-people__btn--primary" onClick={() => onAnswer(w.id, true)}>{labels.knockLetIn}</button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <h3 className="ve-people__heading">{labels.drawnPeopleInCall(people.length)}</h3>
        <ul className="ve-people__list">
          {sorted.map((p) => {
            const name = p.name || labels.knockSomeone;
            return (
              <li key={p.id} className="ve-people__row">
                <span className="ve-people__avatar" aria-hidden="true">{initials(p.name)}</span>
                <span className="ve-people__name">
                  {p.local ? labels.drawnPeopleYou(name) : name}
                  {p.owner ? <span className="ve-people__tag">{labels.drawnPeopleHost}</span> : null}
                </span>
                <span className="ve-people__state">
                  {p.handAt ? <span className="ve-people__icon ve-people__icon--hand" title={labels.drawnHandRaised}><HandIcon width={16} height={16} /><span className="ve-sr">{labels.drawnHandRaised}</span></span> : null}
                  {!p.videoOn ? <span className="ve-people__icon ve-people__icon--off" title={labels.drawnCameraOff}><CameraOffIcon width={16} height={16} /></span> : null}
                  <span className={cx('ve-people__icon', !p.audioOn && 've-people__icon--off')} title={p.audioOn ? labels.drawnPeopleMicOn : labels.drawnMuted}>
                    {p.audioOn ? <MicIcon width={16} height={16} /> : <MicOffIcon width={16} height={16} />}
                  </span>
                  <span className="ve-sr">{p.audioOn ? labels.drawnPeopleMicOn : labels.drawnMuted}</span>
                </span>
                {host && !p.local ? <RowMenu person={p} onMute={() => host.mute(p.id)} onRemove={() => setRemoving(p)} onLowerHand={() => host.lowerHand(p.id)} /> : null}
              </li>
            );
          })}
        </ul>
      </div>

      {removing && host ? (
        <div className="ve-people__confirm" role="alertdialog" aria-labelledby="ve-people-remove-title" aria-describedby="ve-people-remove-detail">
          <p id="ve-people-remove-title" className="ve-people__confirm-title">{labels.drawnRemoveTitle(removing.name || labels.knockSomeone)}</p>
          <p id="ve-people-remove-detail" className="ve-people__confirm-detail">{labels.drawnRemoveDetail}</p>
          <span className="ve-people__answer">
            <button type="button" className="ve-people__btn" onClick={() => setRemoving(null)}>{labels.drawnRemoveCancel}</button>
            <button
              type="button"
              className="ve-people__btn ve-people__btn--danger"
              onClick={() => {
                host.remove(removing.id);
                setRemoving(null);
              }}
            >
              {labels.drawnPeopleRemove}
            </button>
          </span>
        </div>
      ) : null}
    </section>
  );
}
