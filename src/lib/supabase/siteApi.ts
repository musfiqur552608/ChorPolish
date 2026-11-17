import type { PublicSiteConfig } from '@/types/site';
import { supabase } from './client';

export async function getPublicSiteConfig(): Promise<PublicSiteConfig | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_public_site_config');
  if (error) throw new Error(error.message);
  const config = data as PublicSiteConfig | null;
  // A partially applied migration must not break the public site.
  return config?.seo ? config : null;
}
