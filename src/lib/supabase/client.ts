import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);
export const demoEnabled =
  import.meta.env.VITE_ENABLE_DEMO !== 'false' && (isSupabaseConfigured || import.meta.env.DEV);

/**
 * Public Supabase client. The anonymous key is safe to ship; all privileged
 * actions are handled by security-definer RPCs with their own checks.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: {
        params: { eventsPerSecond: 8 },
      },
    })
  : null;

let sessionPromise: Promise<string> | null = null;

export async function ensureAnonymousUser(): Promise<string> {
  if (!supabase) {
    throw new Error('UNAUTHENTICATED');
  }
  const existing = await supabase.auth.getSession();
  if (existing.data.session?.user.id) {
    return existing.data.session.user.id;
  }
  if (!sessionPromise) {
    sessionPromise = supabase.auth
      .signInAnonymously()
      .then(({ data, error }) => {
        if (error) throw error;
        const id = data.user?.id;
        if (!id) throw new Error('UNAUTHENTICATED');
        return id;
      })
      .finally(() => {
        sessionPromise = null;
      });
  }
  return sessionPromise;
}
