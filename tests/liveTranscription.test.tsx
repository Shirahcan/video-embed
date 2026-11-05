import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveTranscription } from '../src/components/LiveTranscription';

describe('LiveTranscription', () => {
  it('offers Start transcription only while someone is in the call and nothing is running', () => {
    const onStart = vi.fn();
    render(<LiveTranscription state={{ running: false, present: ['client-1'], open: true }} onStart={onStart} />);

    expect(screen.getByText('Not being transcribed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start transcription' }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('says it is running, with no button', () => {
    render(<LiveTranscription state={{ running: true, present: ['client-1'], open: true }} onStart={() => {}} />);

    expect(screen.getByText('Being transcribed')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('waits calmly for the first join, with no button', () => {
    render(<LiveTranscription state={{ running: false, present: [], open: true }} onStart={() => {}} />);

    expect(screen.getByText('Transcription starts when someone joins')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing for a closed room or before the product has heard', () => {
    const { container, rerender } = render(<LiveTranscription state={{ running: false, present: ['a'], open: false }} onStart={() => {}} />);
    expect(container.textContent).toBe('');
    rerender(<LiveTranscription state={null} />);
    expect(container.textContent).toBe('');
  });

  it('shows the start in flight and the refusal in the service words', () => {
    render(<LiveTranscription state={{ running: false, present: ['a', 'b'], open: true }} onStart={() => {}} starting error="Daily is unavailable right now." />);

    expect((screen.getByRole('button', { name: 'Starting...' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/2 people are in the call/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Daily is unavailable right now.');
  });
});
