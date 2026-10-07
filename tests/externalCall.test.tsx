import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExternalCall, externalCallPlatform } from '../src/components/ExternalCall';

describe('externalCallPlatform', () => {
  it('names the known platforms and refuses anything else', () => {
    expect(externalCallPlatform('https://us02web.zoom.us/j/123')).toBe('Zoom');
    expect(externalCallPlatform('https://meet.google.com/abc-defg-hij')).toBe('Google Meet');
    expect(externalCallPlatform('https://teams.microsoft.com/l/meetup-join/x')).toBe('Microsoft Teams');
    expect(externalCallPlatform('http://zoom.us/j/1')).toBeNull();
    expect(externalCallPlatform('https://evilzoom.us/j/1')).toBeNull();
    expect(externalCallPlatform('https://example.daily.co/room')).toBeNull();
    expect(externalCallPlatform('not a url')).toBeNull();
    expect(externalCallPlatform(null)).toBeNull();
  });
});

describe('ExternalCall', () => {
  it('opens the call in a new tab and counts that as joining, once', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const presence = vi.fn().mockResolvedValue(undefined);
    render(<ExternalCall url="https://meet.google.com/abc-defg-hij" password="1234" presence={presence} />);

    expect(screen.getByText('This call runs on Google Meet')).toBeTruthy();
    expect(screen.getByText('1234')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Open Google Meet' });
    button.click();
    button.click();

    expect(open).toHaveBeenCalledWith('https://meet.google.com/abc-defg-hij', '_blank', 'noopener,noreferrer');
    expect(presence.mock.calls.map((c) => c[0])).toEqual(['join', 'heartbeat', 'heartbeat']);
    open.mockRestore();
  });

  it('says there is no call link instead of opening an unknown one', () => {
    render(<ExternalCall url="https://example.com/call" />);
    expect(screen.getByText('No call link yet')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
