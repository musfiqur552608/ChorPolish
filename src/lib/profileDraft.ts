const PROFILE_KEY = 'chorpolice.profile';
const RECENT_ROOM_KEY = 'chorpolice.recentRoom';

export interface ProfileDraft {
  name: string;
  avatar: string;
}

export function loadProfileDraft(): ProfileDraft | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProfileDraft>;
    if (typeof parsed.name !== 'string' || typeof parsed.avatar !== 'string') return null;
    return { name: parsed.name.slice(0, 20), avatar: parsed.avatar };
  } catch {
    return null;
  }
}

export function saveProfileDraft(profile: ProfileDraft): void {
  try {
    window.localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({ name: profile.name.slice(0, 20), avatar: profile.avatar }),
    );
  } catch {
    // private mode / quota: drafts are optional
  }
}

export function saveRecentRoom(code: string): void {
  try {
    window.localStorage.setItem(RECENT_ROOM_KEY, code.toUpperCase());
  } catch {
    // optional
  }
}

export function loadRecentRoom(): string | null {
  try {
    return window.localStorage.getItem(RECENT_ROOM_KEY)?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

export function clearRecentRoom(): void {
  try {
    window.localStorage.removeItem(RECENT_ROOM_KEY);
  } catch {
    // optional
  }
}
