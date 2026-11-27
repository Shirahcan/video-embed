import { useEffect, useRef } from 'react';

/** Mac people read ⌘, everyone else Ctrl (shown in the tooltip, F6). */
export function shortcutLabel(key: string): string {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return mac ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}

function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

/**
 * Ctrl/Cmd+D mutes or unmutes, Ctrl/Cmd+E turns the camera off or on (F6, the keys Meet uses). Never
 * while typing (a chat message, a note), and the browser's own meaning (bookmark, search) is held
 * back only when the call takes the key.
 */
export function useCallShortcuts({ enabled, onMic, onCam }: { enabled: boolean; onMic: () => void; onCam: () => void }) {
  const handlers = useRef({ onMic, onCam });
  useEffect(() => {
    handlers.current = { onMic, onCam };
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.repeat) return;
      const key = e.key.toLowerCase();
      if (key !== 'd' && key !== 'e') return;
      if (typingIn(e.target)) return;
      e.preventDefault();
      if (key === 'd') handlers.current.onMic();
      else handlers.current.onCam();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
