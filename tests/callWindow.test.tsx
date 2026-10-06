import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callWindowPhase, isCallJoinable, useCallWindowPhase } from '../src/callWindow';

const times = { opensAt: '2026-11-02T14:30:00Z', closesAt: '2026-11-02T16:00:00Z' };
const at = (iso: string) => Date.parse(iso);

describe('callWindowPhase', () => {
  it('reads only the instants the API gave', () => {
    expect(callWindowPhase(times, at('2026-11-02T14:29:59Z'))).toBe('before');
    expect(callWindowPhase(times, at('2026-11-02T14:30:00Z'))).toBe('open');
    expect(callWindowPhase(times, at('2026-11-02T16:00:00Z'))).toBe('open');
    expect(callWindowPhase(times, at('2026-11-02T16:00:01Z'))).toBe('closed');
    expect(isCallJoinable(times, at('2026-11-02T15:00:00Z'))).toBe(true);
  });

  it('says unknown rather than guessing when a time is missing', () => {
    expect(callWindowPhase({ opensAt: times.opensAt }, at('2026-11-02T15:00:00Z'))).toBe('unknown');
    expect(isCallJoinable({}, at('2026-11-02T15:00:00Z'))).toBe(false);
  });
});

describe('useCallWindowPhase', () => {
  afterEach(() => vi.useRealTimers());

  it('opens on its own while someone waits on the page', () => {
    vi.useFakeTimers();
    vi.setSystemTime(at('2026-11-02T14:29:00Z'));
    const { result } = renderHook(() => useCallWindowPhase(times));
    expect(result.current).toBe('before');

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current).toBe('open');
  });
});
