import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { DailyCall } from '@daily-co/daily-js';
import { DrawnStage } from '../src/components/DrawnStage';
import { useCallDocumentRequests } from '../src/drawnDocRequests';
import type { CallPanel } from '../src/components/DrawnProductPanel';

type Handler = (event?: unknown) => void;
class TalkCall {
  handlers = new Map<string, Handler[]>();
  sent: Array<[unknown, unknown]> = [];
  video: boolean[] = [];
  people: Record<string, unknown> = {
    local: { session_id: 'me', user_name: 'Ada Consultant', local: true, tracks: { video: { state: 'playable' } } },
    m: { session_id: 'm', user_name: 'Maria', local: false, tracks: {} },
  };
  on(e: string, h: Handler) {
    this.handlers.set(e, [...(this.handlers.get(e) ?? []), h]);
    return this;
  }
  off(e: string, h: Handler) {
    this.handlers.set(e, (this.handlers.get(e) ?? []).filter((x) => x !== h));
    return this;
  }
  emit(e: string, p?: unknown) {
    for (const h of this.handlers.get(e) ?? []) h(p);
  }
  participants() {
    return this.people;
  }
  sendAppMessage(data: unknown, to: unknown) {
    this.sent.push([data, to]);
    return this;
  }
  enumerateDevices() {
    return Promise.resolve({ devices: [] });
  }
  getInputDevices() {
    return Promise.resolve({ mic: {}, camera: {} });
  }
  updateReceiveSettings() {
    return Promise.resolve();
  }
  setLocalAudio() {}
  setLocalVideo(on: boolean) {
    this.video.push(on);
  }
}

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});


const asked = (call: TalkCall, id = 'item-1', title = 'Passport') =>
  act(() => call.emit('app-message', { data: { event: 've-doc-request', id, title }, fromId: 'm' }));
const pick = (file: File) => {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
};

function AskPanel() {
  const docs = useCallDocumentRequests();
  if (!docs) return <p>no api</p>;
  return (
    <div>
      {docs.people.map((p) => (
        <button key={p.id} type="button" onClick={() => docs.ask(p.id, { id: 'item-1', title: 'Passport' })}>Ask {p.name}</button>
      ))}
      {docs.sent.map((s) => <p key={s.id}>{s.title}: {s.state}</p>)}
    </div>
  );
}

describe('document request in the call (D1a)', () => {
  it('shows the ask with Upload and Later, and Later puts it away', () => {
    const call = new TalkCall();
    render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} onDocumentUpload={async () => {}} />);
    asked(call);
    expect(screen.getByText('Maria asks for: Passport')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText('Maria asks for: Passport')).toBeNull();
  });

  it('ignores asks when the product takes no uploads, and malformed asks', () => {
    const call = new TalkCall();
    const { unmount } = render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} />);
    asked(call);
    expect(screen.queryByText(/asks for/)).toBeNull();
    unmount();
    render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} onDocumentUpload={async () => {}} />);
    asked(call, '', 'Passport');
    asked(call, 'x', 'y'.repeat(201));
    expect(screen.queryByText(/asks for/)).toBeNull();
  });

  it('uploads through the product, clears the card and tells the asker', async () => {
    const call = new TalkCall();
    const onUpload = vi.fn(async () => {});
    render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} onDocumentUpload={onUpload} uploadMaxBytes={5 * 1024 * 1024} />);
    asked(call);
    const file = new File(['abc'], 'passport.pdf', { type: 'application/pdf' });
    await act(async () => pick(file));
    expect(onUpload).toHaveBeenCalledWith({ id: 'item-1', title: 'Passport', fromName: 'Maria' }, file);
    await waitFor(() => expect(screen.queryByText(/asks for/)).toBeNull());
    expect(call.sent).toContainEqual([{ event: 've-doc-received', id: 'item-1', title: 'Passport' }, 'm']);
  });

  it('refuses a file over the limit before uploading, and shows a failed upload with Try again', async () => {
    const call = new TalkCall();
    const onUpload = vi.fn(async () => {
      throw new Error('That file type is not accepted.');
    });
    render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} onDocumentUpload={onUpload} uploadMaxBytes={5 * 1024 * 1024} />);
    asked(call);
    const big = new File(['x'], 'big.pdf');
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    await act(async () => pick(big));
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByText('That file is larger than 5 MB. Choose a smaller one.')).toBeTruthy();
    await act(async () => pick(new File(['x'], 'a.exe')));
    expect(await screen.findByText('That file type is not accepted.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(call.sent.some(([d]) => (d as { event?: string }).event === 've-doc-received')).toBe(false);
  });

  it("gives a product panel the people to ask, sends to that one person, and shows Received", async () => {
    const call = new TalkCall();
    const panels: CallPanel[] = [{ key: 'docs', label: 'Documents', title: 'Ask for documents', icon: <span />, render: () => <AskPanel /> }];
    render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} panels={panels} />);
    fireEvent.click(await screen.findByRole('button', { name: 'More options' }));
    const menu = await screen.findByRole('menu', { name: 'More options' });
    const item = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((el) => /documents/i.test(el.textContent ?? ''));
    fireEvent.click(item!);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Maria' }));
    expect(call.sent).toContainEqual([{ event: 've-doc-request', id: 'item-1', title: 'Passport' }, 'm']);
    expect(screen.getByText('Passport: sent')).toBeTruthy();
    act(() => call.emit('app-message', { data: { event: 've-doc-received', id: 'item-1', title: 'Passport' }, fromId: 'm' }));
    expect(screen.getByText('Passport: received')).toBeTruthy();
  });
});
