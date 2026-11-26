import { useCallback, useEffect, useState } from 'react';
import type { DailyCall } from '@daily-co/daily-js';

/**
 * Presenting and the two effects on the drawn screen: noise reduction and background blur (Daily's
 * input processors). What this browser can do comes from Daily's own check, so a control is only
 * offered where it works; a processor the browser then refuses is put back and said.
 */
export interface DrawnSupport {
  present: boolean;
  noise: boolean;
  blur: boolean;
}

type StaticUtils = { supportedBrowser?: () => { supportsScreenShare?: boolean; supportsAudioProcessing?: boolean; supportsVideoProcessing?: boolean } };

export function drawnSupport(call: DailyCall): DrawnSupport {
  let info: ReturnType<NonNullable<StaticUtils['supportedBrowser']>> | undefined;
  try {
    info = (call.constructor as unknown as StaticUtils).supportedBrowser?.();
  } catch {
    info = undefined;
  }
  const canDisplay = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  return {
    present: canDisplay && info?.supportsScreenShare !== false,
    noise: info?.supportsAudioProcessing === true,
    blur: info?.supportsVideoProcessing === true,
  };
}

/** Share a screen or window, with a tab's sound where the browser offers it; never this tab itself. */
export const PRESENT_OPTIONS = {
  displayMediaOptions: { audio: true, video: true, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'exclude' },
} as const;

type Settings = { audio?: { processor?: { type?: string } }; video?: { processor?: { type?: string } } } | undefined;

export function useDrawnEffects(call: DailyCall) {
  const [support] = useState(() => drawnSupport(call));
  const [noise, setNoise] = useState(false);
  const [blur, setBlur] = useState(false);
  const [failed, setFailed] = useState<'noise' | 'blur' | null>(null);

  useEffect(() => {
    const read = (s: Settings) => {
      setNoise(s?.audio?.processor?.type === 'noise-cancellation');
      setBlur(s?.video?.processor?.type === 'background-blur');
    };
    const onUpdated = (e?: unknown) => read((e as { inputSettings?: Settings } | undefined)?.inputSettings);
    try {
      void Promise.resolve(call.getInputSettings?.()).then((s) => read(s as Settings), () => {});
    } catch {
      /* not in a call yet */
    }
    call.on('input-settings-updated', onUpdated);
    return () => {
      call.off('input-settings-updated', onUpdated);
    };
  }, [call]);

  const toggleNoise = useCallback(() => {
    const next = !noise;
    setNoise(next);
    setFailed(null);
    Promise.resolve()
      .then(() => call.updateInputSettings({ audio: { processor: { type: next ? 'noise-cancellation' : 'none' } } }))
      .catch(() => {
        setNoise(!next);
        setFailed('noise');
      });
  }, [call, noise]);

  const toggleBlur = useCallback(() => {
    const next = !blur;
    setBlur(next);
    setFailed(null);
    Promise.resolve()
      .then(() => call.updateInputSettings({ video: { processor: next ? { type: 'background-blur', config: { strength: 0.6 } } : { type: 'none' } } }))
      .catch(() => {
        setBlur(!next);
        setFailed('blur');
      });
  }, [call, blur]);

  return { support, noise, blur, failed, dismissFailed: () => setFailed(null), toggleNoise, toggleBlur };
}
