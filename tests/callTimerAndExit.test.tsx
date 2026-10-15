import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CallOverNotice } from '../src/components/CallOverNotice';
import { CallTimer, formatCallElapsed } from '../src/components/CallTimer';
import { CALL_OVER_NOTICE_MS, useCallOverExit } from '../src/hooks/useCallOverExit';

describe('CallTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('formats minutes, then hours', () => {
    expect(formatCallElapsed(0)).toBe('0:00');
    expect(formatCallElapsed(65)).toBe('1:05');
    expect(formatCallElapsed(3600 + 125)).toBe('1:02:05');
    expect(formatCallElapsed(-4)).toBe('0:00');
  });

  it('counts from the call start everyone shares', () => {
    render(<CallTimer startedAt="2026-10-15T14:47:30Z" />);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Call time 12:30');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('12:32')).toBeTruthy();
  });

  it('counts from this person joining when the start is unknown', () => {
    render(<CallTimer startedAt={null} />);
    expect(screen.getByText('0:00')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(screen.getByText('1:01')).toBeTruthy();
  });
});

describe('useCallOverExit', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('moves a host who ended it at once', () => {
    const navigate = vi.fn();
    const { result } = renderHook(() => useCallOverExit({ href: '/admin/roles/r1/vetting?focus=7', navigate }));
    act(() => result.current.onEnded('by-me'));
    expect(navigate).toHaveBeenCalledWith('/admin/roles/r1/vetting?focus=7');
  });

  it('shows the notice first to someone it was ended for', () => {
    const navigate = vi.fn();
    const { result } = renderHook(() => useCallOverExit({ href: '/x', navigate }));
    act(() => result.current.onEnded('ended'));
    expect(navigate).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(CALL_OVER_NOTICE_MS); });
    expect(navigate).toHaveBeenCalledWith('/x');
  });

  it('waits for the pad to save, and for a destination', () => {
    const navigate = vi.fn();
    const { result, rerender } = renderHook(
      ({ href }: { href: string | null }) => useCallOverExit({ href, navigate, padMounted: true }),
      { initialProps: { href: null as string | null } },
    );
    act(() => result.current.onEnded('by-me'));
    expect(result.current.waitingOnPad).toBe(true);
    act(() => result.current.settlePad());
    expect(navigate).not.toHaveBeenCalled();
    rerender({ href: '/meeting' });
    expect(navigate).toHaveBeenCalledWith('/meeting');
  });

  it('reads an end the server already knows', () => {
    const navigate = vi.fn();
    const { result } = renderHook(() => useCallOverExit({ href: '/x', navigate, endedElsewhere: true }));
    expect(result.current.over).toBe('ended');
  });
});

describe('CallOverNotice', () => {
  it('names where the person is going, and lets them go now', () => {
    const go = vi.fn();
    render(<CallOverNotice over="ended" destination="the vetting floor" onGoNow={go} />);
    expect(screen.getByText('This call has ended')).toBeTruthy();
    expect(screen.getByText('Taking you back to the vetting floor...')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go now' }));
    expect(go).toHaveBeenCalledOnce();
  });

  it('is not shown to the host who ended it', () => {
    const { container } = render(<CallOverNotice over="by-me" destination="x" onGoNow={() => {}} />);
    expect(container.textContent).toBe('');
  });
});
