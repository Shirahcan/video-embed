import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TranscriptRetention } from '../src/components/TranscriptRetention';

describe('TranscriptRetention', () => {
  it('reads the product retention, saves a number, and saves empty as keep', async () => {
    const save = vi.fn(async (days: number | null) => ({ transcript_days: days, max_days: 3650 }));
    render(<TranscriptRetention adapter={{ load: async () => ({ transcript_days: null, max_days: 3650 }), save }} />);

    const input = (await screen.findByLabelText('Delete transcripts after (days)')) as HTMLInputElement;
    expect(input.value).toBe('');
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveProperty('disabled', true);

    fireEvent.change(input, { target: { value: '90' } });
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledWith(90));
    expect(await screen.findByText('Saved')).toBeTruthy();

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(null));
  });

  it('will not save a number out of range and shows a refusal', async () => {
    const save = vi.fn(async () => {
      throw new Error('The service refused it.');
    });
    render(<TranscriptRetention adapter={{ load: async () => ({ transcript_days: 30, max_days: 3650 }), save }} />);

    const input = (await screen.findByLabelText('Delete transcripts after (days)')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);

    fireEvent.change(input, { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The service refused it.');
  });
});
