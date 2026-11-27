import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { DrawnLayoutMode } from './drawnLayout';

/** Remembered on this device: the person's layout choice for the drawn call (F5). */
export const LAYOUT_MODE_KEY = 've_call_layout';
const MODES: readonly DrawnLayoutMode[] = ['auto', 'tiled', 'spotlight'];

function readMode(): DrawnLayoutMode {
  try {
    const v = window.localStorage.getItem(LAYOUT_MODE_KEY);
    return MODES.includes(v as DrawnLayoutMode) ? (v as DrawnLayoutMode) : 'auto';
  } catch {
    return 'auto';
  }
}

/** Auto, Tiled or Spotlight, kept on this device across calls (F5). */
export function useLayoutMode() {
  const [mode, setModeState] = useState<DrawnLayoutMode>(readMode);
  const setMode = useCallback((next: DrawnLayoutMode) => {
    setModeState(next);
    try {
      if (next === 'auto') window.localStorage.removeItem(LAYOUT_MODE_KEY);
      else window.localStorage.setItem(LAYOUT_MODE_KEY, next);
    } catch {
      /* private window: the choice lasts this call only */
    }
  }, []);
  return { mode, setMode };
}

/**
 * The stage in full screen (F5): the call's own element, so its bar, panels and notices come with
 * it. Esc leaves (the browser's own). `supported` is false where the browser has no full screen
 * (iPhone Safari), and the control is then not offered.
 */
export function useStageFullscreen(rootRef: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  const supported = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);

  useEffect(() => {
    const sync = () => setOn(document.fullscreenElement !== null && document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [rootRef]);

  const toggle = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen().catch(() => {});
  }, [rootRef]);

  return { supported, on, toggle };
}
