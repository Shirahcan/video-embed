import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AskToJoin, type AskToJoinAdapter } from '../src/components/AskToJoin';
import { JoinRequestBar, useJoinRequests, type JoinRequestsAdapter } from '../src/components/JoinRequestBar';

afterEach(() => vi.useRealTimers());

describe('AskToJoin', () => {
  it('asks under the typed name, waits, and hands over once the host lets them in', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let polls = 0;
    const adapter: AskToJoinAdapter = {
      ask: vi.fn().mockResolvedValue({ id: 'r-1' }),
      status: vi.fn(async () => ({ status: polls++ === 0 ? ('waiting' as const) : ('admitted' as const) })),
    };
    const onAdmitted = vi.fn();
    render(<AskToJoin adapter={adapter} onAdmitted={onAdmitted} pollMs={100} />);

    const ask = screen.getByRole('button', { name: 'Ask to join' }) as HTMLButtonElement;
    expect(ask.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '  Ada Obi ' } });
    await act(async () => fireEvent.click(ask));

    expect(adapter.ask).toHaveBeenCalledWith('Ada Obi');
    expect(await screen.findByText('Waiting for the host to let you in')).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(250));
    await waitFor(() => expect(onAdmitted).toHaveBeenCalledWith('r-1'));
  });

  it('says so when the host declines, and offers to ask again when nobody answered', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const adapter: AskToJoinAdapter = { ask: vi.fn().mockResolvedValue({ id: 'r-1' }), status: vi.fn().mockResolvedValue({ status: 'expired' }) };
    render(<AskToJoin adapter={adapter} onAdmitted={vi.fn()} pollMs={100} />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ask to join' })));
    await act(async () => vi.advanceTimersByTime(150));

    expect(await screen.findByText('Nobody answered in time. You can ask again.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ask again' }));
    expect(screen.getByLabelText('Your name')).toBeTruthy();
  });

  it('keeps the form and says why when the request could not be sent', async () => {
    const onError = vi.fn();
    const adapter: AskToJoinAdapter = { ask: vi.fn().mockRejectedValue(new Error('gone')), status: vi.fn() };
    render(<AskToJoin adapter={adapter} onAdmitted={vi.fn()} onError={onError} />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ask to join' })));

    expect(screen.getByRole('alert').textContent).toBe('Your request could not be sent. Please try again.');
    expect(onError).toHaveBeenCalled();
  });
});

describe('JoinRequestBar', () => {
  it('lists who is waiting and lets the host answer each one', async () => {
    const adapter: JoinRequestsAdapter = {
      list: vi.fn().mockResolvedValue([{ id: 'r-1', name: 'Ada Obi' }, { id: 'r-2', name: 'Bayo' }]),
      decide: vi.fn().mockResolvedValue(undefined),
    };
    const { result } = renderHook(() => useJoinRequests(adapter, { pollMs: 60_000 }));
    await waitFor(() => expect(result.current.requests).toHaveLength(2));

    const { rerender } = render(<JoinRequestBar state={result.current} sound={false} />);
    expect(screen.getByText('2 people are asking to join')).toBeTruthy();

    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Let in' })[0]!));
    expect(adapter.decide).toHaveBeenCalledWith('r-1', true);
    rerender(<JoinRequestBar state={result.current} sound={false} />);
    expect(screen.getByText('Bayo is asking to join')).toBeTruthy();
  });

  it('never asks for someone who is not a host', () => {
    const adapter: JoinRequestsAdapter = { list: vi.fn(), decide: vi.fn() };
    const { result } = renderHook(() => useJoinRequests(adapter, { enabled: false }));
    expect(adapter.list).not.toHaveBeenCalled();
    expect(result.current.requests).toEqual([]);
  });
});

describe('polling', () => {
  it('never asks again while the last question is still out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let release: (v: { status: 'waiting' }) => void = () => {};
    const status = vi.fn(() => new Promise<{ status: 'waiting' }>((r) => { release = r; }));
    const adapter: AskToJoinAdapter = { ask: vi.fn().mockResolvedValue({ id: 'r-1' }), status };
    render(<AskToJoin adapter={adapter} onAdmitted={vi.fn()} pollMs={100} />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ask to join' })));

    await act(async () => vi.advanceTimersByTime(550));
    expect(status).toHaveBeenCalledTimes(1);
    await act(async () => release({ status: 'waiting' }));
    await act(async () => vi.advanceTimersByTime(150));
    expect(status).toHaveBeenCalledTimes(2);
  });
});
