import type { WaitingPerson } from '../hooks/useDailyFrame';
import { cx, useVideoUi } from '../theme';

/**
 * The host's view of people knocking on the private room (someone who arrived through an
 * old or pasted link, without a token). Daily's own notice is small and inside the frame;
 * this sits above the call so a knock is never missed and a client is never left waiting.
 */
export function KnockBar({ waiting, admit, deny, admitAll, className }: {
  waiting: WaitingPerson[];
  admit: (id: string) => void;
  deny: (id: string) => void;
  admitAll: () => void;
  className?: string;
}) {
  const { labels, classNames } = useVideoUi();
  if (waiting.length === 0) return null;

  return (
    <div className={cx('ve-knock', classNames.knockBar, className)} role="alert">
      <p className="ve-knock__title">
        {waiting.length === 1 ? labels.knockingOne(waiting[0]?.name ?? '') : labels.knockingMany(waiting.length)}
      </p>
      <ul className="ve-knock__list">
        {waiting.map((p) => (
          <li key={p.id} className="ve-knock__item">
            <span className="ve-knock__name">{p.name || '...'}</span>
            <button type="button" className={cx('ve-btn ve-btn--primary', classNames.button, classNames.buttonPrimary)} onClick={() => admit(p.id)}>
              {labels.admit}
            </button>
            <button type="button" className={cx('ve-btn', classNames.button)} onClick={() => deny(p.id)}>
              {labels.deny}
            </button>
          </li>
        ))}
      </ul>
      {waiting.length > 1 ? (
        <button type="button" className={cx('ve-btn ve-btn--primary', classNames.button, classNames.buttonPrimary)} onClick={admitAll}>
          {labels.admitAll}
        </button>
      ) : null}
    </div>
  );
}
