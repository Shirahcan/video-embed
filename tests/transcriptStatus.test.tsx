import { fireEvent, render, screen } from '@testing-library/react';
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

  it('says the product sentence when it could not ask the service', () => {
    render(<TranscriptStatus state="overdue" detail="This call ended without a transcript." onAdd={vi.fn()} />);
    expect(screen.getByText('This call ended without a transcript.')).toBeTruthy();
    expect(screen.queryByText(/60 minutes/)).toBeNull();
  });

  it('puts view, download and replace behind one menu once the transcript is held', () => {
    const onView = vi.fn();
    const onReplace = vi.fn();
    render(<TranscriptStatus state="held" detail="Full record of the consultation call" onView={onView} onDownload={vi.fn()} onReplace={onReplace} onAdd={vi.fn()} />);

    expect(screen.getByText('Call transcript')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'View' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add transcript' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Transcript actions' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['View', 'Download', 'Replace']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Replace' }));
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('never offers replace before there is a transcript, and one action stays a plain button', () => {
    render(<TranscriptStatus state="ready" onView={vi.fn()} onReplace={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Transcript actions' })).toBeNull();
    expect(screen.getByRole('button', { name: 'View' })).toBeTruthy();
    expect(screen.queryByText('Replace')).toBeNull();
  });

  it('shows the running action and refuses a second click while it runs', () => {
    const onDownload = vi.fn();
    render(<TranscriptStatus state="held" onView={vi.fn()} onDownload={onDownload} working="download" />);
    fireEvent.click(screen.getByRole('button', { name: 'Transcript actions' }));
    const items = screen.getAllByRole('menuitem') as HTMLButtonElement[];
    expect(items.map((m) => m.textContent)).toEqual(['View', 'Working...']);
    expect(items.every((m) => m.disabled)).toBe(true);
  });

  it('closes the menu on Escape and hands focus back to its button', () => {
    render(<TranscriptStatus state="held" onView={vi.fn()} onDownload={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Transcript actions' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
