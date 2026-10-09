import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TranscriptStatus } from '../src/components/TranscriptStatus';
import { TranscriptReader } from '../src/components/TranscriptReader';

describe('TranscriptStatus readings', () => {
  it('offers the recap, the tidied text and the words as spoken from one kebab once held', () => {
    const onReadRecap = vi.fn();
    const onReadAsSpoken = vi.fn();
    render(<TranscriptStatus state="held" onReadRecap={onReadRecap} onReadTidied={vi.fn()} onReadAsSpoken={onReadAsSpoken} onDownload={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Transcript actions' }));
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(['Read the recap', 'Read the tidied transcript', 'Read it as spoken', 'Download']);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Read it as spoken' }));
    expect(onReadAsSpoken).toHaveBeenCalled();
    expect(onReadRecap).not.toHaveBeenCalled();
  });

  it('offers no reading before the transcript is held', () => {
    render(<TranscriptStatus state="preparing" onReadRecap={vi.fn()} onReadTidied={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Transcript actions' })).toBeNull();
    expect(screen.queryByText('Read the recap')).toBeNull();
  });
});

describe('TranscriptReader', () => {
  it('shows the text with its title and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<TranscriptReader open onClose={vi.fn()} title="As spoken" subtitle="Oct 9, 4 min" text={'Maria: hello\nConsultant: hi'} />);

    expect(screen.getByText('As spoken')).toBeTruthy();
    expect(screen.getByText(/Maria: hello/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy text' }));
    });
    expect(writeText).toHaveBeenCalledWith('Maria: hello\nConsultant: hi');
  });

  it('renders the product content and closes', () => {
    const onClose = vi.fn();
    render(<TranscriptReader open onClose={onClose} title="Recap"><p>Porter recap body</p></TranscriptReader>);
    expect(screen.getByText('Porter recap body')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy text' })).toBeNull();
    // Two Close controls: the corner ×, and the footer's button.
    const closes = screen.getAllByRole('button', { name: 'Close' });
    expect(closes).toHaveLength(2);
    fireEvent.click(closes[closes.length - 1]!);
    expect(onClose).toHaveBeenCalled();
  });
});
