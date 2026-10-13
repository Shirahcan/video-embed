import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduledEndCue } from '../src/components/ScheduledEndCue';

describe('ScheduledEndCue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('says nothing early, counts down the last five minutes, then says the booked time is up', () => {
    const onMore = vi.fn();
    render(<ScheduledEndCue scheduledEnd="2026-10-14T15:15:00Z" action={{ label: 'Need more time?', onSelect: onMore }} />);
    expect(screen.queryByText(/left in the scheduled time/)).toBeNull();

    act(() => { vi.setSystemTime(new Date('2026-10-14T15:10:01Z')); vi.advanceTimersByTime(1000); });
    expect(screen.getByText('4:58 left in the scheduled time')).toBeTruthy();
    expect(screen.getByText('About 5 minutes left in the scheduled time')).toBeTruthy();

    act(() => { vi.setSystemTime(new Date('2026-10-14T15:15:00Z')); vi.advanceTimersByTime(1000); });
    expect(screen.getByText('You are at the end of the scheduled meeting time')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Need more time?' }));
    expect(onMore).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('You are at the end of the scheduled meeting time')).toBeNull();
  });
});
