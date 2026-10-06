import { useEffect, useRef } from 'react';
import type { WaitingPerson } from '../hooks/useDailyFrame';
import { cx, useVideoUi } from '../theme';

/** A short two-note chime, quiet, so a knock is heard by a host looking at another window. */
function chime() {
  const Ctx = typeof window !== 'undefined'
    ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    : undefined;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    [659.25, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.32);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 800);
  } catch {
    /* sound is a courtesy; the bar is the signal */
  }
}

/**
 * The host's notice that someone is knocking on the private room (they came through an old or
 * pasted link, without a pass). Daily's own request inside the call is small and easy to miss;
 * this sits above the call, names them and chimes.
 *
 * ⚠ It does not admit. With Daily Prebuilt, admitting is only possible from Daily's own request
 * in the frame (updateWaitingParticipant is call-object-only), so the bar says where to click.
 */
export function KnockBar({ waiting, sound = true, className }: { waiting: WaitingPerson[]; sound?: boolean; className?: string }) {
  const { labels, classNames } = useVideoUi();
  const heard = useRef(0);

  useEffect(() => {
    if (sound && waiting.length > heard.current) chime();
    heard.current = waiting.length;
  }, [waiting.length, sound]);

  if (waiting.length === 0) return null;

  return (
    <div className={cx('ve-knock', classNames.knockBar, className)} role="alert">
      <p className="ve-knock__title">
        {waiting.length === 1 ? labels.knockingOne(waiting[0]?.name ?? '') : labels.knockingMany(waiting.length)}
      </p>
      {waiting.length > 1 ? (
        <ul className="ve-knock__list">
          {waiting.map((p) => (
            <li key={p.id} className="ve-knock__name">{p.name || '...'}</li>
          ))}
        </ul>
      ) : null}
      <p className="ve-knock__hint">{labels.knockingHint}</p>
    </div>
  );
}
