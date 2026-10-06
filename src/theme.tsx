import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react';
import { DEFAULT_VIDEO_LABELS, type VideoLabels } from './labels';

/** Theme tokens; each becomes a `--ve-*` CSS variable on the provider's wrapper. */
export interface VideoTheme {
  accent?: string;
  accentInk?: string;
  surface?: string;
  surfaceMuted?: string;
  border?: string;
  ink?: string;
  inkMuted?: string;
  ok?: string;
  warn?: string;
  danger?: string;
  radius?: string;
  radiusPill?: string;
  font?: string;
}

export interface VideoClassNames {
  deviceCheck?: string;
  troubleshooter?: string;
  knockBar?: string;
  recovery?: string;
  transcript?: string;
  button?: string;
  buttonPrimary?: string;
}

interface VideoUiValue {
  labels: VideoLabels;
  classNames: VideoClassNames;
}

const VideoUiContext = createContext<VideoUiValue>({ labels: DEFAULT_VIDEO_LABELS, classNames: {} });

const VAR: Record<keyof VideoTheme, string> = {
  accent: '--ve-accent',
  accentInk: '--ve-accent-ink',
  surface: '--ve-surface',
  surfaceMuted: '--ve-surface-muted',
  border: '--ve-border',
  ink: '--ve-ink',
  inkMuted: '--ve-ink-muted',
  ok: '--ve-ok',
  warn: '--ve-warn',
  danger: '--ve-danger',
  radius: '--ve-radius',
  radiusPill: '--ve-radius-pill',
  font: '--ve-font',
};

export function videoThemeStyle(theme: VideoTheme = {}): CSSProperties {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme)) {
    if (value) style[VAR[key as keyof VideoTheme]] = value;
  }
  return style as CSSProperties;
}

export interface VideoUiProviderProps {
  children: ReactNode;
  labels?: Partial<VideoLabels>;
  classNames?: VideoClassNames;
  theme?: VideoTheme;
  /** Extra class on the wrapper (`display: contents`, so it adds no box). */
  className?: string;
}

export function VideoUiProvider({ children, labels, classNames, theme, className }: VideoUiProviderProps) {
  const value = useMemo(
    () => ({ labels: { ...DEFAULT_VIDEO_LABELS, ...labels }, classNames: classNames ?? {} }),
    [labels, classNames],
  );

  return (
    <VideoUiContext.Provider value={value}>
      <div className={cx('ve-root', className)} style={videoThemeStyle(theme)}>
        {children}
      </div>
    </VideoUiContext.Provider>
  );
}

export function useVideoUi(): VideoUiValue {
  return useContext(VideoUiContext);
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
