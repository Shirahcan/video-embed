import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX, type ChatMessage } from '../drawnChat';
import { useVideoUi } from '../theme';
import { CloseIcon, SendIcon } from './icons';

/**
 * The drawn screen's chat: a panel that slides over the right of the stage (it never shrinks the
 * call), newest at the bottom, Enter to send and Shift+Enter for a new line.
 */
export function DrawnChatPanel({ messages, onSend, onClose }: {
  messages: ChatMessage[];
  onSend: (text: string) => boolean;
  onClose: () => void;
}) {
  const { labels } = useVideoUi();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    if (onSend(draft)) setDraft('');
  };

  return (
    <section className="ve-chat" aria-label={labels.drawnChatTitle}>
      <header className="ve-chat__head">
        <h2 className="ve-chat__title">{labels.drawnChatTitle}</h2>
        <button type="button" className="ve-chat__close" aria-label={labels.drawnChatClose} title={labels.drawnChatClose} onClick={onClose}>
          <CloseIcon width={18} height={18} />
        </button>
      </header>
      <p className="ve-chat__note">{labels.drawnChatNote}</p>
      <ol className="ve-chat__list" ref={listRef} aria-live="polite">
        {messages.length === 0 ? <li className="ve-chat__empty">{labels.drawnChatEmpty}</li> : null}
        {messages.map((m) => (
          <li key={m.id} className={m.mine ? 've-chat__msg ve-chat__msg--mine' : 've-chat__msg'}>
            <span className="ve-chat__who">
              {m.mine ? labels.drawnYou : m.name || labels.knockSomeone}
              <time className="ve-chat__when" dateTime={new Date(m.at).toISOString()}>
                {new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </time>
            </span>
            <span className="ve-chat__text">{m.text}</span>
          </li>
        ))}
      </ol>
      <form
        className="ve-chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={inputRef}
          className="ve-chat__input"
          rows={1}
          maxLength={CHAT_MAX}
          value={draft}
          placeholder={labels.drawnChatPlaceholder}
          aria-label={labels.drawnChatPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="submit" className="ve-chat__send" aria-label={labels.drawnChatSend} title={labels.drawnChatSend} disabled={!draft.trim()}>
          <SendIcon width={18} height={18} />
        </button>
      </form>
    </section>
  );
}
