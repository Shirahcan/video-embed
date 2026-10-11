import { useEffect, useId, useState } from 'react';
import { cx, useVideoUi } from '../theme';

/** A product's transcript retention as video-service reports it (GET /v1/policy/retention). */
export interface TranscriptRetentionState {
  transcript_days: number | null;
  max_days: number;
  updated_at?: string | null;
}

/** The product's own backend, which calls video-service (the package never calls the service). */
export interface TranscriptRetentionAdapter {
  load: () => Promise<TranscriptRetentionState>;
  /** null = keep transcripts. The service validates and refuses with reasons. */
  save: (transcriptDays: number | null) => Promise<TranscriptRetentionState>;
}

export interface TranscriptRetentionProps {
  adapter: TranscriptRetentionAdapter;
  describeError?: (error: unknown) => string;
  className?: string;
}

/**
 * How long a product's call transcripts are kept, for its admins. The value lives in video-service
 * (each product's own row); an admin changes it here without a developer or a deploy. Empty keeps
 * transcripts; a number deletes each one (on the service and on Daily) that many days after its call.
 */
export function TranscriptRetention({ adapter, describeError, className }: TranscriptRetentionProps) {
  const { labels, classNames } = useVideoUi();
  const id = useId();
  const [saved, setSaved] = useState<TranscriptRetentionState | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [justSaved, setJustSaved] = useState(false);

  const adopt = (s: TranscriptRetentionState) => {
    setSaved(s);
    setValue(s.transcript_days == null ? '' : String(s.transcript_days));
  };

  useEffect(() => {
    let live = true;
    adapter.load().then((s) => live && adopt(s), (e) => live && setError(e));
    return () => {
      live = false;
    };
  }, [adapter]);

  const days = value.trim() === '' ? null : Math.round(Number(value));
  const dirty = saved !== null && days !== saved.transcript_days;
  const valid = days === null || (Number.isFinite(days) && days >= 1 && days <= (saved?.max_days ?? 3650));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      adopt(await adapter.save(days));
      setJustSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const describe = describeError ?? ((e: unknown) => (e instanceof Error && e.message ? e.message : labels.retentionFailed));

  return (
    <section className={cx('ve-retention', classNames.transcript, className)} aria-labelledby={`${id}-t`}>
      <h3 className="ve-tx__heading" id={`${id}-t`}>{labels.retentionTitle}</h3>
      <p className="ve-tx__meta">{labels.retentionIntro}</p>
      {error ? <p className="ve-retention__error" role="alert">{describe(error)}</p> : null}
      {saved !== null ? (
        <div className="ve-retention__row">
          <label htmlFor={`${id}-days`}>{labels.retentionDays}</label>
          <input
            id={`${id}-days`}
            className="ve-retention__input"
            type="number"
            min={1}
            max={saved.max_days}
            inputMode="numeric"
            aria-describedby={`${id}-hint`}
            value={value}
            disabled={busy}
            onChange={(e) => {
              setJustSaved(false);
              setValue(e.target.value);
            }}
          />
          <button type="button" className={cx('ve-btn ve-btn--primary', classNames.button, classNames.buttonPrimary)} disabled={busy || !dirty || !valid} onClick={() => void save()}>
            {labels.retentionSave}
          </button>
          <span className="ve-tx__meta" id={`${id}-hint`} role={justSaved && !dirty ? 'status' : undefined}>
            {justSaved && !dirty ? labels.retentionSaved : labels.retentionHint(saved.max_days)}
          </span>
        </div>
      ) : null}
    </section>
  );
}
