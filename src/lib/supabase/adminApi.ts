import type {
  AdminNotice,
  AdminOverview,
  AdminSeo,
  AdminSession,
} from '@/types/admin';
import type { NoticeTone } from '@/types/site';
import { adminSupabase } from './adminClient';

function client() {
  if (!adminSupabase) throw new Error('NETWORK');
  return adminSupabase;
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function adminSignIn(email: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
}

export async function adminSignOut(): Promise<void> {
  if (!adminSupabase) return;
  // Keep the player's anonymous session (separate storage key) and other
  // admin devices signed in; this only clears the current admin session.
  await adminSupabase.auth.signOut({ scope: 'local' });
}

export async function adminGetSession(): Promise<AdminSession> {
  return rpc('admin_session');
}

export async function adminGetOverview(timezone: string): Promise<AdminOverview> {
  return rpc('admin_get_overview', { p_timezone: timezone });
}

export async function adminListNotices(): Promise<AdminNotice[]> {
  return rpc('admin_list_notices');
}

export async function adminSaveNotice(input: {
  id: string | null;
  titleEn: string;
  titleBn: string;
  bodyEn: string;
  bodyBn: string;
  tone: NoticeTone;
  linkUrl: string;
  linkLabelEn: string;
  linkLabelBn: string;
  isActive: boolean;
  isDismissible: boolean;
  startsAt: string | null;
  endsAt: string | null;
}): Promise<{ id: string }> {
  return rpc('admin_save_notice', {
    p_id: input.id,
    p_title_en: input.titleEn,
    p_title_bn: input.titleBn,
    p_body_en: input.bodyEn,
    p_body_bn: input.bodyBn,
    p_tone: input.tone,
    p_link_url: input.linkUrl.trim() || null,
    p_link_label_en: input.linkLabelEn.trim() || null,
    p_link_label_bn: input.linkLabelBn.trim() || null,
    p_is_active: input.isActive,
    p_is_dismissible: input.isDismissible,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
  });
}

export async function adminToggleNotice(id: string, isActive: boolean): Promise<void> {
  await rpc('admin_toggle_notice', { p_id: id, p_is_active: isActive });
}

export async function adminDeleteNotice(id: string): Promise<void> {
  await rpc('admin_delete_notice', { p_id: id });
}

export async function adminGetSeo(): Promise<AdminSeo> {
  return rpc('admin_get_seo');
}

export async function adminSaveSeo(input: {
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  ogImageUrl: string;
  twitterHandle: string;
  noindex: boolean;
}): Promise<AdminSeo> {
  return rpc('admin_save_seo', {
    p_title: input.title,
    p_description: input.description,
    p_keywords: input.keywords,
    p_canonical_url: input.canonicalUrl,
    p_og_image_url: input.ogImageUrl,
    p_twitter_handle: input.twitterHandle,
    p_noindex: input.noindex,
  });
}
