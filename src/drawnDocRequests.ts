import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { DailyCall } from '@daily-co/daily-js';

/**
 * Asking for a document in the call (D1a, plan call-screen-features-2026-11-26).
 *
 * One person (a consultant) asks another (the client) for a named document; the client's screen
 * shows "Marcus asks for: Passport" with Upload and Later. The upload itself is the PRODUCT's
 * (`onDocumentUpload`): the kit only carries the ask, checks the size, and reports back "Received"
 * to the asker once the product's upload resolved. App messages go to that one person only.
 */
export const DOC_REQUEST_EVENT = 've-doc-request';
export const DOC_RECEIVED_EVENT = 've-doc-received';

export interface DocRequest {
  /** The product's own id for what is asked (a checklist item), echoed back on receipt. */
  id: string;
  /** What is asked for, in the asker's words ("Passport"). */
  title: string;
}

export interface IncomingDocRequest extends DocRequest {
  fromId: string;
  fromName: string;
  state: 'asked' | 'uploading' | 'failed';
  /** Why the last upload failed (too large, or the product's own reason). */
  error?: string;
}

export interface SentDocRequest extends DocRequest {
  toId: string;
  toName: string;
  state: 'sent' | 'received';
}

/** The product stores the file; resolve when it is safely kept, reject with a reason to show. */
export type DocumentUploadHandler = (request: DocRequest & { fromName: string }, file: File) => Promise<void>;

export interface DocRequestOptions {
  onUpload?: DocumentUploadHandler;
  /** The product's upload limit in bytes; a larger file is refused before upload. */
  maxBytes?: number;
  nameOf: (participantId: string) => string;
  tooLarge: (maxMb: number) => string;
  failed: string;
}

const MAX_ID = 100;
const MAX_TITLE = 200;

function validRequest(data: unknown): DocRequest | null {
  const d = data as { id?: unknown; title?: unknown } | null | undefined;
  if (typeof d?.id !== 'string' || typeof d.title !== 'string') return null;
  const id = d.id.trim();
  const title = d.title.trim();
  if (!id || !title || id.length > MAX_ID || title.length > MAX_TITLE) return null;
  return { id, title };
}

export function useDocRequests(call: DailyCall, options: DocRequestOptions) {
  const [incoming, setIncoming] = useState<IncomingDocRequest[]>([]);
  const [sent, setSent] = useState<SentDocRequest[]>([]);
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });
  const canReceive = Boolean(options.onUpload);

  useEffect(() => {
    const onMessage = (event?: unknown) => {
      const e = event as { data?: { event?: string }; fromId?: string } | undefined;
      const from = e?.fromId;
      if (!from) return;
      if (e?.data?.event === DOC_REQUEST_EVENT) {
        if (!opts.current.onUpload) return;
        const req = validRequest(e.data);
        if (!req) return;
        const fromName = opts.current.nameOf(from);
        // The same ask twice from one person is one card.
        setIncoming((list) => [
          ...list.filter((r) => !(r.id === req.id && r.fromId === from)),
          { ...req, fromId: from, fromName, state: 'asked' },
        ]);
        return;
      }
      if (e?.data?.event === DOC_RECEIVED_EVENT) {
        const req = validRequest(e.data);
        if (!req) return;
        setSent((list) => list.map((s) => (s.id === req.id && s.toId === from ? { ...s, state: 'received' } : s)));
      }
    };
    call.on('app-message', onMessage);
    return () => {
      call.off('app-message', onMessage);
    };
  }, [call]);

  const ask = useCallback(
    (toId: string, request: DocRequest) => {
      const req = validRequest(request);
      if (!req) return false;
      try {
        call.sendAppMessage({ event: DOC_REQUEST_EVENT, id: req.id, title: req.title }, toId);
      } catch {
        return false;
      }
      const toName = opts.current.nameOf(toId);
      setSent((list) => [...list.filter((s) => !(s.id === req.id && s.toId === toId)), { ...req, toId, toName, state: 'sent' }]);
      return true;
    },
    [call],
  );

  const later = useCallback((req: IncomingDocRequest) => {
    setIncoming((list) => list.filter((r) => !(r.id === req.id && r.fromId === req.fromId)));
  }, []);

  const upload = useCallback(
    async (req: IncomingDocRequest, file: File) => {
      const { onUpload, maxBytes, tooLarge, failed } = opts.current;
      if (!onUpload) return;
      const same = (r: IncomingDocRequest) => r.id === req.id && r.fromId === req.fromId;
      if (maxBytes && file.size > maxBytes) {
        const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
        setIncoming((list) => list.map((r) => (same(r) ? { ...r, state: 'failed', error: tooLarge(mb) } : r)));
        return;
      }
      setIncoming((list) => list.map((r) => (same(r) ? { ...r, state: 'uploading', error: undefined } : r)));
      try {
        await onUpload({ id: req.id, title: req.title, fromName: req.fromName }, file);
      } catch (err) {
        const reason = err instanceof Error && err.message ? err.message : failed;
        setIncoming((list) => list.map((r) => (same(r) ? { ...r, state: 'failed', error: reason } : r)));
        return;
      }
      setIncoming((list) => list.filter((r) => !same(r)));
      try {
        call.sendAppMessage({ event: DOC_RECEIVED_EVENT, id: req.id, title: req.title }, req.fromId);
      } catch {
        /* they left; the product still has the file */
      }
    },
    [call],
  );

  return { canReceive, incoming, sent, ask, later, upload };
}

/** What a product panel inside the drawn call can do: ask someone in it for a document. */
export interface CallDocumentRequests {
  /** The other people in the call, who can be asked. */
  people: { id: string; name: string; userId: string | null }[];
  /** Send the ask; false when it could not be sent (they left, or the request is not valid). */
  ask: (toId: string, request: DocRequest) => boolean;
  /** What this screen asked for in this call, and whether it has come back. */
  sent: SentDocRequest[];
}

export const DocRequestsContext = createContext<CallDocumentRequests | null>(null);

/** Inside a drawn call's product panel: the document-request API; null anywhere else. */
export function useCallDocumentRequests(): CallDocumentRequests | null {
  return useContext(DocRequestsContext);
}
