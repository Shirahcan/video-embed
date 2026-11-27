import { useRef } from 'react';
import { useVideoUi } from '../theme';
import type { IncomingDocRequest } from '../drawnDocRequests';

export interface DrawnDocRequestCardsProps {
  requests: IncomingDocRequest[];
  onUpload: (request: IncomingDocRequest, file: File) => void;
  onLater: (request: IncomingDocRequest) => void;
  /** The product's accepted file types for the picker (e.g. ".pdf,.jpg,.png"); any file when absent. */
  accept?: string;
}

/**
 * D1a: "Marcus asks for: Passport", with Upload (the device's file picker) and Later, one line per
 * ask in the drawn screen's notices. While the file goes up the line says so; a refused file says why
 * and offers Upload again.
 */
export function DrawnDocRequestCards({ requests, onUpload, onLater, accept }: DrawnDocRequestCardsProps) {
  const { labels } = useVideoUi();
  return (
    <>
      {requests.map((req) => (
        <DocRequestCard key={`${req.fromId}:${req.id}`} req={req} onUpload={onUpload} onLater={onLater} accept={accept} labels={labels} />
      ))}
    </>
  );
}

function DocRequestCard({
  req,
  onUpload,
  onLater,
  accept,
  labels,
}: {
  req: IncomingDocRequest;
  onUpload: DrawnDocRequestCardsProps['onUpload'];
  onLater: DrawnDocRequestCardsProps['onLater'];
  accept?: string;
  labels: ReturnType<typeof useVideoUi>['labels'];
}) {
  const input = useRef<HTMLInputElement>(null);
  const busy = req.state === 'uploading';
  return (
    <div className={`ve-drawn__notice ve-drawn__notice--doc${req.state === 'failed' ? ' ve-drawn__notice--warn' : ''}`} role="status">
      {busy ? <span className="ve-drawn__spinner" aria-hidden="true" /> : null}
      <span className="ve-drawn__doc-text">
        <span>{busy ? labels.drawnDocUploading(req.title) : labels.drawnDocAsked(req.fromName, req.title)}</span>
        {req.state === 'failed' && req.error ? <span className="ve-drawn__doc-error">{req.error}</span> : null}
      </span>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        aria-label={labels.drawnDocChoose(req.title)}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onUpload(req, file);
        }}
      />
      {busy ? null : (
        <>
          <button type="button" className="ve-drawn__notice-btn" onClick={() => input.current?.click()}>
            {req.state === 'failed' ? labels.drawnDocTryAgain : labels.drawnDocUpload}
          </button>
          <button type="button" className="ve-drawn__notice-btn ve-drawn__notice-btn--quiet" onClick={() => onLater(req)}>
            {labels.drawnDocLater}
          </button>
        </>
      )}
    </div>
  );
}
