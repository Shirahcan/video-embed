import { useCallback, useEffect, useState } from 'react';
import type { DailyCall } from '@daily-co/daily-js';

/** The app message a host sends with a mute, so the person knows who turned their microphone off. */
export const MUTED_BY_HOST_EVENT = 've-muted-by-host';

export interface HostControls {
  /** This person may mute and remove others (Daily's room owner: a host's token). */
  isHost: boolean;
  /** Turn someone's microphone off. They are told, and unmute themselves when ready. */
  mute: (id: string) => void;
  /** Take someone out of the call. Their screen says they were removed. */
  remove: (id: string) => void;
  /** A host turned THIS person's microphone off, and they have not dismissed the notice. */
  mutedByHost: boolean;
  dismissMutedByHost: () => void;
}

function localIsOwner(call: DailyCall): boolean {
  try {
    return Boolean((call.participants()?.local as { owner?: boolean } | undefined)?.owner);
  } catch {
    return false;
  }
}

/**
 * What a host can do to the others in a drawn call (F1, owner 2026-11-26), on Daily's call object:
 * mute (`updateParticipant setAudio: false`) and remove (`eject: true`). Daily lets only a room
 * owner do either, so a guest never sees the controls. A muted person hears about it through an
 * app message, because Daily's own track change does not say who made it.
 */
export function useHostControls(call: DailyCall): HostControls {
  const [isHost, setIsHost] = useState(() => localIsOwner(call));
  const [mutedByHost, setMutedByHost] = useState(false);

  useEffect(() => {
    const syncOwner = () => setIsHost(localIsOwner(call));
    const onMessage = (event?: { data?: { event?: string } }) => {
      if (event?.data?.event === MUTED_BY_HOST_EVENT) setMutedByHost(true);
    };
    call.on('joined-meeting', syncOwner);
    call.on('participant-updated', syncOwner);
    call.on('app-message', onMessage);
    syncOwner();
    return () => {
      call.off('joined-meeting', syncOwner);
      call.off('participant-updated', syncOwner);
      call.off('app-message', onMessage);
    };
  }, [call]);

  const mute = useCallback((id: string) => {
    try {
      call.updateParticipant(id, { setAudio: false });
      call.sendAppMessage({ event: MUTED_BY_HOST_EVENT }, id);
    } catch {
      /* they left, or the call is closing: nothing to mute */
    }
  }, [call]);

  const remove = useCallback((id: string) => {
    try {
      call.updateParticipant(id, { eject: true });
    } catch {
      /* already gone */
    }
  }, [call]);

  const dismissMutedByHost = useCallback(() => setMutedByHost(false), []);

  return { isHost, mute, remove, mutedByHost, dismissMutedByHost };
}
