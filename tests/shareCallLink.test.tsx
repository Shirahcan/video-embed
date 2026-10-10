import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ShareCallLink, type ShareCallAdapter } from '../src/components/ShareCallLink';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
});

const adapter = (): ShareCallAdapter & { linkFor: ReturnType<typeof vi.fn> } => ({
  options: vi.fn().mockResolvedValue([
    { key: 'client', label: 'Maria Garcia', role: 'Client' },
    { key: 'guest', label: 'Anyone with the link', role: 'Guest' },
  ]),
  linkFor: vi.fn(async (key: string) => `https://app.test/m/${key}-token`),
});

describe('ShareCallLink', () => {
  it('makes the chosen person their link, says what kind it is, and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const a = adapter();
    render(<ShareCallLink adapter={a} callTitle="Study permit review" />);

    expect(screen.getByText('Invite someone to this call')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Share link' }));
    const copy = screen.getByRole('button', { name: 'Copy link' }) as HTMLButtonElement;
    expect(copy.disabled).toBe(true);

    const anyone = await screen.findByRole('radio', { name: /Anyone with the link/ });
    await act(async () => fireEvent.click(anyone));
    expect(a.linkFor).toHaveBeenCalledWith('guest');
    expect(screen.getByText(/types their name and asks to join/)).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('https://app.test/m/guest-token');

    await act(async () => fireEvent.click(copy));
    expect(writeText).toHaveBeenCalledWith('https://app.test/m/guest-token');

    // Choosing a person again reuses the link already made.
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: /Maria Garcia/ })));
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: /Anyone with the link/ })));
    expect(a.linkFor).toHaveBeenCalledTimes(2);
  });

  it('offers the device share sheet where there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    render(<ShareCallLink adapter={adapter()} callTitle="Study permit review" variant="button" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share link' }));
    const maria = await screen.findByRole('radio', { name: /Maria Garcia/ });
    await act(async () => fireEvent.click(maria));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Share...' }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share...' })));
    expect(share).toHaveBeenCalledWith({ title: 'Study permit review', text: 'Join "Study permit review"', url: 'https://app.test/m/client-token' });
  });
});
