import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canNativeShare,
  canShareFiles,
  inviteText,
  messengerUrl,
  nativeShare,
  roomUrl,
  shareFile,
  telegramUrl,
  whatsappUrl,
} from '@/lib/share';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('roomUrl', () => {
  it('uses the current origin', () => {
    vi.stubGlobal('window', { location: { origin: 'https://chor.example' } });
    expect(roomUrl('ABC234')).toBe('https://chor.example/room/ABC234');
  });

  it('falls back to a relative path without a window', () => {
    vi.stubGlobal('window', undefined);
    expect(roomUrl('ABC234')).toBe('/room/ABC234');
  });
});

describe('inviteText', () => {
  it('writes English invites', () => {
    const text = inviteText('Rafi', 'ABC234', 'https://chor.example/room/ABC234', 'en');
    expect(text).toContain('Rafi');
    expect(text).toContain('ABC234');
    expect(text).toContain('https://chor.example/room/ABC234');
  });

  it('writes Bengali invites', () => {
    const text = inviteText('রাফি', 'ABC234', 'https://chor.example', 'bn');
    expect(text).toContain('রাফি');
    expect(text).toContain('রুম কোড');
  });
});

describe('share URLs', () => {
  it('encodes WhatsApp text', () => {
    expect(whatsappUrl('a b&c')).toBe('https://wa.me/?text=a%20b%26c');
  });

  it('encodes Telegram text and URL separately', () => {
    expect(telegramUrl('hi there', 'https://x/y?a=1')).toBe(
      'https://t.me/share/url?url=https%3A%2F%2Fx%2Fy%3Fa%3D1&text=hi%20there',
    );
  });

  it('encodes the Messenger share URL', () => {
    expect(messengerUrl('https://x/y?a=1')).toBe(
      'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fx%2Fy%3Fa%3D1',
    );
  });
});

describe('nativeShare', () => {
  it('reports unsupported without navigator.share', async () => {
    vi.stubGlobal('navigator', {});
    expect(canNativeShare()).toBe(false);
    await expect(nativeShare({ title: 'x' })).resolves.toBe('unsupported');
  });

  it('returns shared on success', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    expect(canNativeShare()).toBe(true);
    await expect(nativeShare({ title: 'x' })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'x' });
  });

  it('returns cancelled for a user abort', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    vi.stubGlobal('navigator', { share });
    await expect(nativeShare({})).resolves.toBe('cancelled');
  });

  it('returns unsupported for any other failure', async () => {
    const share = vi.fn().mockRejectedValue(new Error('not allowed'));
    vi.stubGlobal('navigator', { share });
    await expect(nativeShare({})).resolves.toBe('unsupported');
  });
});

describe('shareFile', () => {
  const file = new File(['x'], 'score.png', { type: 'image/png' });

  it('is unsupported without native share', async () => {
    vi.stubGlobal('navigator', {});
    expect(canShareFiles()).toBe(false);
    await expect(shareFile(file, 'Title', 'Text')).resolves.toBe('unsupported');
  });

  it('refuses when canShare says files are not supported', async () => {
    const share = vi.fn();
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(false) });
    await expect(shareFile(file, 'Title', 'Text')).resolves.toBe('unsupported');
    expect(share).not.toHaveBeenCalled();
  });

  it('shares the file when supported', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { share, canShare });
    expect(canShareFiles()).toBe(true);
    await expect(shareFile(file, 'Title', 'Text')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Title', text: 'Text', files: [file] });
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
  });

  it('treats a cancelled share as cancelled', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true) });
    await expect(shareFile(file, 'Title', 'Text')).resolves.toBe('cancelled');
  });

  it('tries files when canShare is absent', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    await expect(shareFile(file, 'Title', 'Text')).resolves.toBe('shared');
  });
});
