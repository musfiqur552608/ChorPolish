import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeLanguage, LANG_STORAGE_KEY, storedLanguage } from '@/i18n';

afterEach(() => {
  // Reset the shared i18n instance without depending on a browser.
  changeLanguage('bn');
  vi.unstubAllGlobals();
});

describe('storedLanguage', () => {
  it('defaults to Bengali without a window', () => {
    vi.stubGlobal('window', undefined);
    expect(storedLanguage()).toBe('bn');
  });

  it('reads a stored English preference', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });

    expect(storedLanguage()).toBe('bn');
    store.set(LANG_STORAGE_KEY, 'en');
    expect(storedLanguage()).toBe('en');
  });

  it('survives blocked storage', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });

    expect(storedLanguage()).toBe('bn');
    expect(() => changeLanguage('en')).not.toThrow();
  });

  it('persists a language choice', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });

    changeLanguage('en');
    expect(store.get(LANG_STORAGE_KEY)).toBe('en');
  });
});
