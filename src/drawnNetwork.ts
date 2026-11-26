import { useEffect, useState } from 'react';
import type { DailyCall } from '@daily-co/daily-js';

/**
 * The connection as the drawn screen says it: `reconnecting` while Daily's connection is broken and
 * it is trying again, `weak` while the network cannot carry everything (Daily's `warning` / `bad`, or
 * the older `low` / `very-low` threshold). Prebuilt draws its own; the drawn screen has to.
 */
export type ConnectionState = 'ok' | 'weak' | 'reconnecting';

export function qualityOf(event: unknown): 'ok' | 'weak' | null {
  const e = event as { networkState?: string; threshold?: string } | undefined;
  const v = e?.networkState ?? e?.threshold;
  if (v === 'warning' || v === 'bad' || v === 'low' || v === 'very-low') return 'weak';
  if (v === 'good') return 'ok';
  return null;
}

export function useDrawnNetwork(call: DailyCall): ConnectionState {
  const [weak, setWeak] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const onQuality = (event?: unknown) => {
      const q = qualityOf(event);
      if (q) setWeak(q === 'weak');
    };
    const onConnection = (event?: unknown) => {
      const what = (event as { event?: string } | undefined)?.event;
      if (what === 'interrupted') setBroken(true);
      else if (what === 'connected') setBroken(false);
    };
    call.on('network-quality-change', onQuality);
    call.on('network-connection', onConnection);
    return () => {
      call.off('network-quality-change', onQuality);
      call.off('network-connection', onConnection);
    };
  }, [call]);

  return broken ? 'reconnecting' : weak ? 'weak' : 'ok';
}
