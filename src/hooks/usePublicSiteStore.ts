import { create } from 'zustand';
import { getPublicSiteConfig } from '@/lib/supabase/siteApi';
import type { PublicSiteConfig } from '@/types/site';

interface PublicSiteState {
  config: PublicSiteConfig | null;
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
}

export const usePublicSiteStore = create<PublicSiteState>((set, get) => ({
  config: null,
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const config = await getPublicSiteConfig();
      set({ config, loaded: true, loading: false });
    } catch {
      // The site keeps its static metadata when the optional migration has not
      // been applied yet. Notices/SEO are enhancements, never a boot blocker.
      set({ loaded: true, loading: false });
    }
  },
}));

/** Pull fresh notice/SEO copy after an admin save without a full page reload. */
export function refreshPublicSite(): void {
  void usePublicSiteStore.getState().load();
}
