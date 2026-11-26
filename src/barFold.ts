import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** A control the bar may move into More when the call is too narrow for it (B1). */
export interface FoldableControl {
  key: string;
  /** Lower folds first. Mic, camera, More and Leave are never foldable. */
  priority: number;
}

/** A width for a control the bar has not drawn yet (one round button with its label). */
export const FALLBACK_CONTROL_WIDTH = 64;

/**
 * Which controls go into More so the bar fits `available` pixels. `fixed` is everything that never
 * folds (the always-there buttons, the bar's padding); each foldable control costs its own width plus
 * one gap. Folds the lowest priority first and stops as soon as the bar fits, so a wide window keeps
 * every control in the bar and a narrow one loses the least important first. Never returns a set
 * that still overflows while something foldable is left.
 */
export function foldControls(
  controls: FoldableControl[],
  widths: Record<string, number>,
  fixed: number,
  gap: number,
  available: number,
): string[] {
  const cost = (key: string) => (widths[key] ?? FALLBACK_CONTROL_WIDTH) + gap;
  let needed = fixed + controls.reduce((sum, c) => sum + cost(c.key), 0);
  const folded: string[] = [];
  const order = [...controls].sort((a, b) => a.priority - b.priority);
  for (const c of order) {
    if (needed <= available) break;
    folded.push(c.key);
    needed -= cost(c.key);
  }
  return folded;
}

/**
 * Measures the bar against its stage and keeps the list of folded controls. Each foldable control in
 * the bar carries `data-fold-key`; its width is remembered while it is shown, so a folded control can
 * come back once the stage is wide enough for it again.
 */
export function useBarFold(
  stageRef: RefObject<HTMLElement | null>,
  barRef: RefObject<HTMLElement | null>,
  controls: FoldableControl[],
  margin = 24,
): string[] {
  const [folded, setFolded] = useState<string[]>([]);
  const [available, setAvailable] = useState<number | null>(null);
  const widths = useRef<Record<string, number>>({});
  const signature = controls.map((c) => `${c.key}:${c.priority}`).join(',');

  // Syncing with the DOM (outside React): follow the stage's width.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const read = () => setAvailable(Math.max(0, stage.clientWidth - margin));
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stageRef, margin]);

  // Syncing with the DOM: measure what is drawn, then decide what fits.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || available === null || available === 0) return;
    const style = getComputedStyle(bar);
    const gap = Number.parseFloat(style.columnGap || style.gap || '0') || 0;
    let shown = 0;
    bar.querySelectorAll<HTMLElement>('[data-fold-key]').forEach((el) => {
      const key = el.dataset.foldKey ?? '';
      const w = el.getBoundingClientRect().width;
      if (w > 0) widths.current[key] = w;
      shown += (widths.current[key] ?? FALLBACK_CONTROL_WIDTH) + gap;
    });
    // scrollWidth, not the box: a bar held to the stage's width still reports its full content.
    const fixed = Math.max(bar.getBoundingClientRect().width, bar.scrollWidth) - shown;
    const next = foldControls(controls, widths.current, fixed, gap, available);
    setFolded((prev) => (prev.length === next.length && prev.every((k, i) => k === next[i]) ? prev : next));
    // `controls` is read through its signature: a new array with the same keys is the same bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, signature, barRef, folded]);

  return folded;
}
