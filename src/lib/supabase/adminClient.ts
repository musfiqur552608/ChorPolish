import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/**
 * The admin client deliberately uses a different auth storage key from the
 * player client. An admin can therefore sign in without replacing the
 * anonymous session used by the game in the same browser.
 */
export const adminSupabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storageKey: 'chorpolice.admin.auth',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
        realtime: {
          params: { eventsPerSecond: 4 },
        },
      })
    : null;
