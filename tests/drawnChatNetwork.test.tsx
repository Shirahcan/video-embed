import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DailyCall } from '@daily-co/daily-js';
import { readChatMessage } from '../src/drawnChat';
import { qualityOf } from '../src/drawnNetwork';
import { DrawnStage } from '../src/components/DrawnStage';

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

const stage = (call: TalkCall) => render(<DrawnStage call={call as unknown as DailyCall} onLeave={() => {}} onUseStandard={() => {}} />);

describe('chat on the drawn screen', () => {
  it("reads Daily Prebuilt's chat messages, and only those", () => {
    expect(readChatMessage({ event: 'chat-msg', message: ' hi ', name: 'Maria' })).toEqual({ name: 'Maria', text: 'hi' });
    expect(readChatMessage({ event: 'chat-msg', message: '   ' })).toBeNull();
    expect(readChatMessage({ event: 'something-else', message: 'x' })).toBeNull();
    expect(readChatMessage('not an object')).toBeNull();
  });

  it('counts unread messages on the Chat button, shows them when opened, and sends in the standard format', () => {
    const call = new TalkCall();
    stage(call);
    act(() => call.emit('app-message', { data: { event: 'chat-msg', message: 'Can you hear me?', name: 'Maria' }, fromId: 'm' }));
    const button = screen.getByRole('button', { name: 'Chat with everyone, 1 new message' });
    fireEvent.click(button);

    const panel = screen.getByRole('region', { name: 'In-call messages' });
    expect(within(panel).getByText('Can you hear me?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chat with everyone' })).toBeTruthy();

    const box = within(panel).getByRole('textbox', { name: 'Send a message to everyone' });
    fireEvent.change(box, { target: { value: 'Yes, clearly' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(call.sent).toEqual([[{ event: 'chat-msg', message: 'Yes, clearly', name: 'Ada Consultant', room: 'main-room' }, '*']]);
    expect(within(panel).getByText('Yes, clearly')).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe('');
  });
});

describe('the connection on the drawn screen', () => {
  it("reads Daily's network quality in both its new and old shapes", () => {
    expect(qualityOf({ networkState: 'bad' })).toBe('weak');
    expect(qualityOf({ threshold: 'very-low' })).toBe('weak');
    expect(qualityOf({ networkState: 'good' })).toBe('ok');
    expect(qualityOf({ networkState: 'unknown' })).toBeNull();
  });

  it('says it is reconnecting while the connection is broken', () => {
    const call = new TalkCall();
    stage(call);
    act(() => call.emit('network-connection', { type: 'signaling', event: 'interrupted' }));
    expect(screen.getByText('Your connection dropped. Reconnecting...')).toBeTruthy();
    act(() => call.emit('network-connection', { type: 'signaling', event: 'connected' }));
    expect(screen.queryByText('Your connection dropped. Reconnecting...')).toBeNull();
  });

  it('offers to turn the video off on a weak connection, once per drop', () => {
    const call = new TalkCall();
    stage(call);
    act(() => call.emit('network-quality-change', { networkState: 'bad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Turn off video' }));
    expect(call.video).toEqual([false]);
    expect(screen.queryByRole('button', { name: 'Turn off video' })).toBeNull();
  });
});
