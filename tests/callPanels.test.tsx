import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JoinIssuesPanel } from '../src/components/JoinIssuesPanel';
import { TranscriptPanel, useCallTranscripts, type CallTranscriptItem, type CallTranscriptsAdapter } from '../src/components/TranscriptPanel';

function Harness({ adapter, ...rest }: { adapter: CallTranscriptsAdapter } & Omit<Parameters<typeof TranscriptPanel>[0], 'transcripts'>) {
  const transcripts = useCallTranscripts(adapter);
  return <TranscriptPanel transcripts={transcripts} {...rest} />;
}

const ready: CallTranscriptItem = {
  id: '1', source: 'captured', status: 'ready', text: 'Maria: hello', cleanText: 'Maria said hello.', durationSeconds: 600, createdAt: '2026-10-09T13:00:00Z',
};

describe('TranscriptPanel', () => {
  it('renders nothing while the call has no transcript', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const { container } = render(<Harness adapter={{ list }} />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('shows the tidied text first and the words as spoken on request', async () => {
    render(<Harness adapter={{ list: async () => [ready] }} formatWhen={() => 'Oct 9, 2:00 PM WAT'} />);
    await screen.findByText(/Oct 9, 2:00 PM WAT, 10 min/);
    fireEvent.click(screen.getByRole('button', { name: 'Show full transcript' }));
    expect(screen.getByText('Maria said hello.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'As spoken' }));
    expect(screen.getByText('Maria: hello')).toBeTruthy();
  });

  it('says who added a supplied transcript, and puts the product recap above it', async () => {
    const supplied: CallTranscriptItem = { id: '2', source: 'supplied', status: 'ready', text: 'We spoke by phone.', suppliedByName: 'Carlos Mendez' };
    render(<Harness adapter={{ list: async () => [supplied] }} renderRecap={() => <p>Porter recap</p>} />);
    await screen.findByText('Added by Carlos Mendez');
    expect(screen.getByText('Porter recap')).toBeTruthy();
  });

  it('says a failed capture plainly, and a preparing one calmly', async () => {
    render(<Harness adapter={{ list: async () => [{ id: '3', source: 'captured', status: 'error' }, { id: '4', source: 'captured', status: 'in_progress' }] }} />);
    await screen.findByText(/could not be made/);
    expect(screen.getByText(/being prepared/)).toBeTruthy();
  });

  it('copies through the kebab and tells the product', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onNotice = vi.fn();
    render(<Harness adapter={{ list: async () => [ready] }} onNotice={onNotice} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Transcript actions' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy transcript' }));
    });
    expect(writeText).toHaveBeenCalledWith('Maria said hello.');
    expect(onNotice).toHaveBeenCalledWith('Transcript copied');
  });

  it('offers the product way to add a record even when there is none yet', async () => {
    const onAdd = vi.fn();
    render(<Harness adapter={{ list: async () => [] }} onAdd={onAdd} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add transcript' }));
    expect(onAdd).toHaveBeenCalled();
  });
});

describe('JoinIssuesPanel', () => {
  it('says who could not get in, what stopped them and what happened', async () => {
    render(
      <JoinIssuesPanel
        adapter={{ list: async () => [{ id: '1', kind: 'in-use', device: 'camera', outcome: 'failed', who: 'Maria Garcia', occurredAt: '2026-10-09T13:00:00Z' }] }}
        formatWhen={() => '2:00 PM WAT'}
      />,
    );
    await screen.findByText('Maria Garcia');
    expect(screen.getByText(/Another app was using the device \(camera\), could not be fixed/)).toBeTruthy();
    expect(screen.getByText('2:00 PM WAT')).toBeTruthy();
  });

  it('renders nothing when the call went smoothly', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const { container } = render(<JoinIssuesPanel adapter={{ list }} />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
