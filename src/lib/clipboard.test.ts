import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '@/lib/clipboard';

function stubDocument(execResult: boolean | Error) {
  const textarea = {
    value: '',
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    select: vi.fn(),
  };
  const body = { appendChild: vi.fn(), removeChild: vi.fn() };
  const doc = {
    createElement: vi.fn(() => textarea),
    body,
    execCommand: vi.fn(() => {
      if (execResult instanceof Error) throw execResult;
      return execResult;
    }),
  };
  vi.stubGlobal('document', doc);
  return { textarea, body, doc };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyText', () => {
  it('uses the clipboard API in a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('window', { isSecureContext: true });

    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back when the clipboard API throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('window', { isSecureContext: true });
    const { textarea, body } = stubDocument(true);

    await expect(copyText('hello')).resolves.toBe(true);
    expect(textarea.value).toBe('hello');
    expect(body.appendChild).toHaveBeenCalledWith(textarea);
    expect(body.removeChild).toHaveBeenCalledWith(textarea);
  });

  it('skips the API outside a secure context', async () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('window', { isSecureContext: false });
    stubDocument(true);

    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('returns false when the fallback copy fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
    });
    vi.stubGlobal('window', { isSecureContext: false });
    const { body } = stubDocument(false);

    await expect(copyText('hello')).resolves.toBe(false);
    expect(body.removeChild).toHaveBeenCalled();
  });

  it('removes the textarea even when execCommand throws', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
    });
    vi.stubGlobal('window', { isSecureContext: false });
    const { body } = stubDocument(new Error('boom'));

    await expect(copyText('hello')).resolves.toBe(false);
    expect(body.removeChild).toHaveBeenCalled();
  });
});
