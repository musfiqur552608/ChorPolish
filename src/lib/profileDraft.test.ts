import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRecentRoom,
  loadProfileDraft,
  loadRecentRoom,
  saveProfileDraft,
  saveRecentRoom,
} from '@/lib/profileDraft';

const PROFILE_KEY = 'chorpolice.profile';
const RECENT_KEY = 'chorpolice.recentRoom';

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
};

beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', { localStorage: localStorageMock });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('profile draft', () => {
  it('returns null when nothing is stored', () => {
    expect(loadProfileDraft()).toBeNull();
  });

  it('round-trips a draft and truncates long names', () => {
    saveProfileDraft({ name: 'x'.repeat(30), avatar: '🦊' });
    expect(loadProfileDraft()).toEqual({ name: 'x'.repeat(20), avatar: '🦊' });
  });

  it('ignores malformed or mistyped drafts', () => {
    store.set(PROFILE_KEY, '{not json');
    expect(loadProfileDraft()).toBeNull();

    store.set(PROFILE_KEY, JSON.stringify({ name: 5, avatar: '🦊' }));
    expect(loadProfileDraft()).toBeNull();

    store.set(PROFILE_KEY, JSON.stringify({ name: 'Rafi' }));
    expect(loadProfileDraft()).toBeNull();
  });

  it('swallows storage failures', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {
          throw new Error('blocked');
        },
      },
    });

    expect(loadProfileDraft()).toBeNull();
    expect(loadRecentRoom()).toBeNull();
    expect(() => saveProfileDraft({ name: 'Rafi', avatar: '🦊' })).not.toThrow();
    expect(() => saveRecentRoom('abc234')).not.toThrow();
    expect(() => clearRecentRoom()).not.toThrow();
  });
});

describe('recent room', () => {
  it('stores and returns the code upper-cased', () => {
    saveRecentRoom('abc234');
    expect(store.get(RECENT_KEY)).toBe('ABC234');
    expect(loadRecentRoom()).toBe('ABC234');
  });

  it('returns null after clearing', () => {
    saveRecentRoom('ABC234');
    clearRecentRoom();
    expect(loadRecentRoom()).toBeNull();
  });
});
