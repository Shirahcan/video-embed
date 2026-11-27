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

  /** `quiet`: an automatic attempt; if the browser refuses, nothing is shown (the corner window is the fallback). */
  const open = useCallback(async (options?: { quiet?: boolean }) => {
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
      if (!options?.quiet) setFailed(true);
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

/** Remembered on this device once the person has seen (or dismissed) the app-switch tip. */
export const APP_SWITCH_TIP_KEY = 've_float_app_switch_tip';
/** Away at least this long counts as switching to another app (not a stray focus blip). */
export const APP_SWITCH_MIN_MS = 3000;

/**
 * Chrome opens the corner window by itself only on a TAB switch; switching to another app's window
 * gives a page no way to open it (owner 2026-11-27 asked; Chrome needs a click for that). So when
 * someone comes back after leaving the window mid-call with the tab still showing, say once, on this
 * device, that Pop out first keeps the call on top. A tab switch is not counted (the page was hidden
 * and the corner window handled it), and neither is focus moving into a frame inside the page.
 */
export function useAppSwitchTip(active: boolean) {
  const [show, setShow] = useState(false);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    let seen = false;
    try {
      seen = window.localStorage.getItem(APP_SWITCH_TIP_KEY) === 'seen';
    } catch {
      seen = false;
    }
    if (seen) return undefined;
    const onBlur = () => {
      // Focus moving into an iframe on this page blurs the window too; that is not leaving.
      setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) return;
        if (document.visibilityState !== 'visible') return;
        leftAt.current = Date.now();
      }, 0);
    };
    const onHidden = () => {
      if (document.visibilityState !== 'visible') leftAt.current = null;
    };
    const onFocus = () => {
      const at = leftAt.current;
      leftAt.current = null;
      if (at !== null && Date.now() - at >= APP_SWITCH_MIN_MS && document.visibilityState === 'visible') setShow(true);
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [active]);

  const dismiss = useCallback(() => {
    setShow(false);
    try {
      window.localStorage.setItem(APP_SWITCH_TIP_KEY, 'seen');
    } catch {
      /* private window: it may show again next call, which is harmless */
    }
  }, []);

  return { show: show && active, dismiss };
}
