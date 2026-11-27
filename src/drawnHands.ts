import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailyCall } from '@daily-co/daily-js';

/** The reactions offered on the drawn screen, in the picker's order. */
export const REACTIONS = ['👍', '👏', '❤️', '😂', '👋'] as const;
export type Reaction = (typeof REACTIONS)[number];

/** How long a reaction shows on a tile, and the shortest gap between two from one person. */
export const REACTION_SHOW_MS = 3000;
export const REACTION_GAP_MS = 1000;

const LOWER_HAND_EVENT = 've-hand-lower';
const REACTION_EVENT = 've-reaction';

/** What a person carries in Daily's userData for the drawn screen: when they raised a hand. */
export interface HandUserData {
  ve_hand?: number | null;
}

/** When this participant raised a hand (ms), from their userData; null when it is down. */
export function handOf(userData: unknown): number | null {
  const at = (userData as HandUserData | null | undefined)?.ve_hand;
  return typeof at === 'number' && Number.isFinite(at) ? at : null;
}

export interface ShownReaction {
  emoji: Reaction;
  /** Changes with every reaction, so the same emoji twice replays its burst. */
  key: number;
}

/**
 * Raise hand and reactions on the drawn screen (F2, owner 2026-11-26).
 *
 * A hand lives in the person's own Daily `userData` (`ve_hand`: when it went up), so everyone, a late
 * joiner included, reads it straight off the participant list, and the raise order is the time.
 * Only the person can change their userData, so a host lowering someone's hand asks THEIR screen to
 * do it (an app message to that one person).
 *
 * Reactions are app messages to everyone; each shows for a few seconds over the sender's tile. One
 * person sends at most one a second, so a held click cannot flood the call.
 */
export function useHandsAndReactions(call: DailyCall, selfId: string | null, selfHandAt: number | null) {
  const [reactions, setReactions] = useState<Record<string, ShownReaction>>({});
  const seq = useRef(0);
  const lastSent = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const show = useCallback((id: string, emoji: Reaction) => {
    seq.current += 1;
    const key = seq.current;
    setReactions((r) => ({ ...r, [id]: { emoji, key } }));
    const prior = timers.current.get(id);
    if (prior) clearTimeout(prior);
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setReactions((r) => {
          if (r[id]?.key !== key) return r;
          const next = { ...r };
          delete next[id];
          return next;
        });
      }, REACTION_SHOW_MS),
    );
  }, []);

  const setHand = useCallback(
    (up: boolean) => {
      try {
        void Promise.resolve(call.setUserData({ ve_hand: up ? Date.now() : null } satisfies HandUserData)).catch(() => {});
      } catch {
        /* not in the call any more */
      }
    },
    [call],
  );

  useEffect(() => {
    const onMessage = (event?: unknown) => {
      const e = event as { data?: { event?: string; emoji?: unknown }; fromId?: string } | undefined;
      if (e?.data?.event === LOWER_HAND_EVENT) {
        setHand(false);
        return;
      }
      if (e?.data?.event === REACTION_EVENT && e.fromId && (REACTIONS as readonly unknown[]).includes(e.data.emoji)) {
        show(e.fromId, e.data.emoji as Reaction);
      }
    };
    const pending = timers.current;
    call.on('app-message', onMessage);
    return () => {
      call.off('app-message', onMessage);
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
    };
  }, [call, setHand, show]);

  const toggleHand = useCallback(() => setHand(selfHandAt === null), [setHand, selfHandAt]);

  /** A host lowers someone else's hand (their own screen does it). */
  const lowerHandOf = useCallback(
    (id: string) => {
      try {
        call.sendAppMessage({ event: LOWER_HAND_EVENT }, id);
      } catch {
        /* they left */
      }
    },
    [call],
  );

  const react = useCallback(
    (emoji: Reaction) => {
      const now = Date.now();
      if (now - lastSent.current < REACTION_GAP_MS) return;
      lastSent.current = now;
      try {
        call.sendAppMessage({ event: REACTION_EVENT, emoji }, '*');
      } catch {
        return;
      }
      if (selfId) show(selfId, emoji);
    },
    [call, selfId, show],
  );

  return { handUp: selfHandAt !== null, toggleHand, lowerHandOf, react, reactions };
}

/** How long "Maria Garcia raised a hand" shows for everyone else. */
export const HAND_NOTICE_MS = 5000;

/**
 * The name of whoever ELSE most recently raised a hand, for a few seconds after it went up (F2), so a
 * host deep in conversation notices without watching every tile. Hands already up when the viewer
 * joined are not announced: they are on the tiles and at the top of People.
 */
export function useRaisedHandNotice(people: ReadonlyArray<{ id: string; name: string; local: boolean; handAt?: number | null }>) {
  const [shown, setShown] = useState<{ id: string; name: string } | null>(null);
  const seen = useRef<Map<string, number> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const current = new Map<string, { name: string; at: number }>();
    for (const p of people) {
      if (!p.local && typeof p.handAt === 'number') current.set(p.id, { name: p.name, at: p.handAt });
    }
    const before = seen.current;
    seen.current = new Map([...current].map(([id, v]) => [id, v.at]));
    if (before === null) return;
    let newest: { id: string; name: string; at: number } | null = null;
    for (const [id, v] of current) {
      if (before.get(id) === v.at) continue;
      if (!newest || v.at > newest.at) newest = { id, ...v };
    }
    if (!newest) return;
    // Announcing another person's hand: a change from outside React (their Daily userData).
    setShown({ id: newest.id, name: newest.name });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), HAND_NOTICE_MS);
  }, [people]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { notice: shown, dismiss: () => setShown(null) };
}
