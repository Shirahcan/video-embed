import type { ReactNode, SVGProps } from 'react';

/**
 * The call screen's icons: kit-owned inline SVGs (no icon dependency), one 24px grid, one stroke
 * weight, drawn in currentColor so a button's state colours them. Decorative: the button carries
 * the accessible name.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  );
}

export function MicIcon() {
  return (
    <Icon>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 18v4" />
    </Icon>
  );
}

export function MicOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M2 2l20 20" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v2a3 3 0 0 0 5.12 2.12" />
      <path d="M16.95 16.95A7 7 0 0 1 5 11v-1" />
      <path d="M19 10v1a7 7 0 0 1-.11 1.23" />
      <path d="M12 18v4" />
    </Icon>
  );
}

export function CameraIcon() {
  return (
    <Icon>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M16 10.5l5-3v9l-5-3" />
    </Icon>
  );
}

export function CameraOffIcon() {
  return (
    <Icon>
      <path d="M2 2l20 20" />
      <path d="M10.66 6H14a2 2 0 0 1 2 2v2.34l1 .66 4-2.67v9.34" />
      <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
    </Icon>
  );
}

export function MoreIcon() {
  return (
    <Icon>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </Icon>
  );
}

/** Leave: a handset turned down. */
export function LeaveIcon() {
  return (
    <Icon>
      <path d="M3.3 13.6c4.9-4.1 12.5-4.1 17.4 0 .6.5.7 1.4.2 2l-1.4 1.6c-.4.5-1.2.6-1.7.3l-2.4-1.4c-.5-.3-.8-.9-.7-1.5l.2-1.3a11.4 11.4 0 0 0-5.8 0l.2 1.3c.1.6-.2 1.2-.7 1.5l-2.4 1.4c-.5.3-1.3.2-1.7-.3L3.1 15.6c-.5-.6-.4-1.5.2-2z" />
    </Icon>
  );
}

/** The standard call screen: a window with a toolbar. */
export function StandardScreenIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 14h18" />
      <path d="M9 21h6" />
    </Icon>
  );
}
