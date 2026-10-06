import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TranscriptStatus } from '../src/components/TranscriptStatus';

describe('TranscriptStatus', () => {
  it('says the transcript is on its way, with when, and never offers a second record', () => {
    render(<TranscriptStatus state="preparing" expectedByLabel="by 6:40 PM" onAdd={vi.fn()} />);
    expect(screen.getByText('Transcript on its way')).toBeTruthy();
    expect(screen.getByText(/Expect it by 6:40 PM/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add transcript' })).toBeNull();
  });

  it('never calls a call in progress "ended without a transcript"', () => {
    render(<TranscriptStatus state="in_call" onAdd={vi.fn()} />);
    expect(screen.getByText(/The call is on now/)).toBeTruthy();
    expect(screen.queryByText(/without a transcript/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add transcript' })).toBeNull();
  });

  it('offers adding a record once the wait is over, or when nothing will come', () => {
    const onAdd = vi.fn();
    const { rerender } = render(<TranscriptStatus state="overdue" readyWithinMinutes={60} onAdd={onAdd} />);
    expect(screen.getByText('No transcript yet')).toBeTruthy();
    screen.getByRole('button', { name: 'Add transcript' }).click();
    expect(onAdd).toHaveBeenCalledTimes(1);

    rerender(<TranscriptStatus state="not_transcribed" onAdd={onAdd} />);
    expect(screen.getByText('Not transcribed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add transcript' })).toBeTruthy();
  });
});
