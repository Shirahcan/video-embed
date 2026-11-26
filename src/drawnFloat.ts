import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The floating window (Document Picture-in-Picture) for the drawn call screen (P3a).
 *
 * The call never moves: the kit renders a compact stage INTO the floating window through a React
 * portal, while the call object and every <audio> element stay in the page, so the sound never
 * pauses (P1 spike). Closing the window brings the full stage back. Browsers without Document PiP
 * never reach the drawn screen (chooseCallScreen), so there is nothing to offer there.
 */
export const AUTO_FLOAT_KEY = 've_auto_float';

/** The default size: a speaker, your corner tile and one row of round buttons. */
export const FLOAT_SIZE = { width: 360, height: 420 } as const;

const THEME_VARS = [
  '--ve-accent', '--ve-accent-ink', '--ve-surface', '--ve-surface-muted', '--ve-border', '--ve-ink', '--ve-ink-muted',
  '--ve-ok', '--ve-warn', '--ve-danger', '--ve-radius', '--ve-radius-pill', '--ve-font', '--ve-stage',
  '--ve-control', '--ve-control-label',
];

interface PipApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  window: Window | null;
}

function pipApi(): PipApi | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture ?? null;
}

export function prefersAutoFloat(): boolean {
  try {
    return window.localStorage.getItem(AUTO_FLOAT_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAutoFloat(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(AUTO_FLOAT_KEY);
    else window.localStorage.setItem(AUTO_FLOAT_KEY, 'off');
  } catch {
    /* blocked: lasts for this call only */
  }
}

/** Copy the page's stylesheets into the floating window, so it looks exactly like the page. */
export function copyStyles(from: Document, to: Document): void {
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      const style = to.createElement('style');
      style.textContent = css;
      to.head.appendChild(style);
    } catch {
      // A cross-origin sheet cannot be read: link the same file instead.
      if (sheet.href) {
        const link = to.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        to.head.appendChild(link);
      }
    }
  }
}

/**
 * Open / close the floating window and give back the element to portal into. `themeFrom` is the
 * stage element: its computed --ve-* values travel with the call, so a product's theme holds.
 */
export function useDrawnFloat(themeFrom: () => HTMLElement | null) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [failed, setFailed] = useState(false);
  const pipRef = useRef<Window | null>(null);
  const [autoFloat, setAutoFloatState] = useState(prefersAutoFloat);
  const supported = pipApi() !== null;

  const close = useCallback(() => {
    const w = pipRef.current;
    pipRef.current = null;
    setHost(null);
    try {
      w?.close();
    } catch {
      /* already gone */
    }
  }, []);

  const open = useCallback(async () => {
    const api = pipApi();
    if (!api || pipRef.current) return;
    setFailed(false);
    try {
      const w = await api.requestWindow({ width: FLOAT_SIZE.width, height: FLOAT_SIZE.height });
      pipRef.current = w;
      copyStyles(document, w.document);
      const root = w.document.createElement('div');
      root.className = 've-float-root';
      const from = themeFrom();
      if (from) {
        const computed = getComputedStyle(from);
        for (const v of THEME_VARS) {
          const value = computed.getPropertyValue(v).trim();
          if (value) root.style.setProperty(v, value);
        }
      }
      w.document.body.className = 've-float-body';
      w.document.body.appendChild(root);
      w.document.title = document.title;
      // The person closed the window (its X, or the browser's "back to tab"): the stage comes back.
      w.addEventListener('pagehide', () => {
        if (pipRef.current === w) {
          pipRef.current = null;
          setHost(null);
        }
      });
      setHost(root);
    } catch {
      // Refused (no user gesture, a policy, or another float already open): the stage stays put.
      setFailed(true);
    }
  }, [themeFrom]);

  // Leaving the page closes the float with it.
  useEffect(() => close, [close]);

  // Chrome opens the float on a tab switch when the page offers this Media Session action (the
  // browser asks the person once). Offered only while the person keeps "automatic" on.
  useEffect(() => {
    const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!supported || !session || !autoFloat) return undefined;
    try {
      session.setActionHandler('enterpictureinpicture' as MediaSessionAction, () => void open());
    } catch {
      return undefined; // this browser has no such action: the button still works
    }
    return () => {
      try {
        session.setActionHandler('enterpictureinpicture' as MediaSessionAction, null);
      } catch {
        /* gone */
      }
    };
  }, [supported, autoFloat, open]);

  const toggleAuto = useCallback(() => {
    setAutoFloat(!autoFloat);
    setAutoFloatState(!autoFloat);
  }, [autoFloat]);

  return { supported, host, open, close, failed, dismissFailed: () => setFailed(false), autoFloat, toggleAuto };
}
