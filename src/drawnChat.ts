import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailyCall } from '@daily-co/daily-js';

/**
 * In-call chat on the drawn screen, over Daily app messages in Daily Prebuilt's own chat format
 * (`event: 'chat-msg'`), so a person on the drawn screen and a person on the standard screen read
 * each other in the same call. Lives only as long as the call: nothing is stored.
 */
export interface ChatMessage {
  id: string;
  name: string;
  text: string;
  at: number;
  mine: boolean;
}

/** The longest message: Daily Prebuilt's own chat limit, so both screens accept the same messages. */
export const CHAT_MAX = 256;

export function readChatMessage(data: unknown): { name: string; text: string } | null {
  const d = data as { event?: string; message?: unknown; name?: unknown } | null;
  if (!d || d.event !== 'chat-msg' || typeof d.message !== 'string') return null;
  const text = d.message.trim();
  if (!text) return null;
  return { name: typeof d.name === 'string' ? d.name.trim() : '', text: text.slice(0, CHAT_MAX) };
}

export function useDrawnChat(call: DailyCall, selfName: string, open: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(open);
  const seq = useRef(0);
  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(0);
  }, [open]);

  useEffect(() => {
    const onMessage = (event?: unknown) => {
      const e = event as { data?: unknown; fromId?: string } | undefined;
      const msg = readChatMessage(e?.data);
      if (!msg) return;
      seq.current += 1;
      setMessages((list) => [...list, { id: `${e?.fromId ?? 'x'}-${seq.current}`, name: msg.name, text: msg.text, at: Date.now(), mine: false }]);
      if (!openRef.current) setUnread((n) => n + 1);
    };
    call.on('app-message', onMessage);
    return () => {
      call.off('app-message', onMessage);
    };
  }, [call]);

  const send = useCallback(
    (raw: string): boolean => {
      const text = raw.trim().slice(0, CHAT_MAX);
      if (!text) return false;
      try {
        call.sendAppMessage({ event: 'chat-msg', message: text, name: selfName, room: 'main-room' }, '*');
      } catch {
        return false;
      }
      seq.current += 1;
      setMessages((list) => [...list, { id: `me-${seq.current}`, name: selfName, text, at: Date.now(), mine: true }]);
      return true;
    },
    [call, selfName],
  );

  return { messages, unread, send };
}
