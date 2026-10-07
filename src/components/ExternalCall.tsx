import { useRef } from 'react';
import type { PresenceKind } from '../hooks/useCallPresence';
import { useVideoUi } from '../theme';

/** Hosts a call on another platform may live on. HTTPS only; anything else is not a call link. */
const PLATFORMS: Array<{ suffix: string; name: string }> = [
  { suffix: 'zoom.us', name: 'Zoom' },
  { suffix: 'meet.google.com', name: 'Google Meet' },
  { suffix: 'teams.microsoft.com', name: 'Microsoft Teams' },
  { suffix: 'teams.live.com', name: 'Microsoft Teams' },
];

function matches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/**
 * The platform an external call link is on, or null when the link is not a call link this UI
 * will open (not HTTPS, or not a known platform). These platforms refuse to be framed, so the
 * call always opens in a new tab.
 */
export function externalCallPlatform(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    return PLATFORMS.find((p) => matches(parsed.hostname, p.suffix))?.name ?? null;
  } catch {
    return null;
  }
}

export interface ExternalCallProps {
  /** The host's own Zoom / Google Meet / Teams link. */
  url: string | null | undefined;
  password?: string | null;
  /**
   * The same presence function CallFrame takes. Opening the call sends `join` (once) and a
   * `heartbeat`: the other platform's tab cannot report back, so opening it is the evidence.
   */
  presence?: (kind: PresenceKind) => Promise<void>;
  className?: string;
}

/** A call on another platform: says where it runs and opens it in a new tab. */
export function ExternalCall({ url, password, presence, className }: ExternalCallProps) {
  const { labels } = useVideoUi();
  const joined = useRef(false);
  const platform = externalCallPlatform(url);

  if (!url || !platform) {
    return (
      <div className={['ve-stage', 've-external', className].filter(Boolean).join(' ')}>
        <div className="ve-overlay" role="status">
          <p className="ve-overlay__title">{labels.externalMissing}</p>
          <p className="ve-overlay__detail">{labels.externalMissingDetail}</p>
        </div>
      </div>
    );
  }

  const open = () => {
    if (presence) {
      if (!joined.current) {
        joined.current = true;
        presence('join').catch(() => {});
      }
      presence('heartbeat').catch(() => {});
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={['ve-stage', 've-external', className].filter(Boolean).join(' ')}>
      <div className="ve-overlay">
        <p className="ve-overlay__title">{labels.externalTitle(platform)}</p>
        <p className="ve-overlay__detail">{labels.externalDetail}</p>
        <div className="ve-overlay__actions">
          <button type="button" className="ve-btn ve-btn--primary" onClick={open}>
            {labels.externalOpen(platform)}
          </button>
        </div>
        {password ? (
          <p className="ve-overlay__fine">
            {labels.externalPassword}: <code>{password}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}
