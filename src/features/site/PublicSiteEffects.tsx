import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePublicSiteStore } from '@/hooks/usePublicSiteStore';
import { applySeo, restoreStaticMetadata } from '@/lib/seo';

/**
 * Fetches the optional public site config once and applies admin-managed SEO.
 * The admin route is deliberately excluded and marked noindex by AdminPage.
 */
export function PublicSiteEffects() {
  const location = useLocation();
  const config = usePublicSiteStore((state) => state.config);
  const load = usePublicSiteStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (location.pathname.startsWith('/admin')) return;
    if (config) applySeo(config.seo);
    else restoreStaticMetadata();
  }, [config, location.pathname]);

  return null;
}
