import { useEffect, useState } from 'react';
import { cx, useVideoUi } from '../theme';

/** One time somebody could not get into the call (GET /v1/calls/{ref}/issues). */
export interface JoinIssueItem {
  id: string;
  kind: string;
  category?: string;
  device?: string | null;
  outcome?: string | null;
  browser?: string | null;
  occurredAt?: string | null;
  /** Who it was, as the product names them ("the client", "Maria Garcia"). */
  who?: string | null;
}

export interface JoinIssuesAdapter {
  list: () => Promise<JoinIssueItem[]>;
}

export interface JoinIssuesPanelProps {
  adapter: JoinIssuesAdapter;
  formatWhen?: (iso: string) => string;
  className?: string;
}

/**
 * Who had trouble getting into this call, and what happened next, said the same way in every
 * product. For the call's hosts (the product decides who may see it). Renders nothing when the
 * call went smoothly, or when the list could not be read.
 */
export function JoinIssuesPanel({ adapter, formatWhen, className }: JoinIssuesPanelProps) {
  const { labels, classNames } = useVideoUi();
  const [items, setItems] = useState<JoinIssueItem[]>([]);

  useEffect(() => {
    let live = true;
    adapter.list().then((rows) => live && setItems(rows), () => undefined);
    return () => {
      live = false;
    };
  }, [adapter]);

  if (items.length === 0) return null;

  return (
    <section className={cx('ve-issues', classNames.transcript, className)} aria-label={labels.issuesHeading}>
      <h2 className="ve-tx__heading">{labels.issuesHeading}</h2>
      <p className="ve-tx__meta">{labels.issuesIntro}</p>
      <ul className="ve-issues__list">
        {items.map((row) => {
          const what = labels.issueWhat(row.kind) + (row.device ? ` (${row.device})` : '') + (row.outcome ? `, ${labels.issueOutcome(row.outcome)}` : '');
          const when = row.occurredAt ? (formatWhen ? formatWhen(row.occurredAt) : new Date(row.occurredAt).toLocaleString()) : null;
          return (
            <li key={row.id} className={cx('ve-issues__item', row.outcome === 'repaired' ? 've-issues__item--ok' : 've-issues__item--warn')}>
              <span className="ve-issues__dot" aria-hidden />
              <span>
                <strong>{row.who ?? labels.issueSomeone}</strong>: {what}
                <span className="ve-tx__meta ve-issues__when">{[when, row.browser].filter(Boolean).join(', ')}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
