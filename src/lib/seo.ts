import type { PublicSeo } from '@/types/site';

type MetaKey = 'name' | 'property';

function setMeta(key: MetaKey, value: string, content: string | null): void {
  if (typeof document === 'undefined') return;
  const selector = `meta[${key}="${value}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!content) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(key, value);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setLink(rel: string, href: string | null): void {
  if (typeof document === 'undefined') return;
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('link');
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
}

export function applySeo(seo: PublicSeo): void {
  if (typeof document === 'undefined') return;

  document.title = seo.title;

  setMeta('name', 'description', seo.description);
  setMeta('name', 'keywords', seo.keywords || null);
  setMeta('name', 'robots', seo.noindex ? 'noindex,nofollow' : 'index,follow');
  setLink('canonical', seo.canonicalUrl || null);

  const pageUrl =
    seo.canonicalUrl ||
    (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : null);

  setMeta('property', 'og:title', seo.title);
  setMeta('property', 'og:description', seo.description);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', 'Chor Police');
  setMeta('property', 'og:url', pageUrl);
  setMeta('property', 'og:image', seo.ogImageUrl || null);

  setMeta('name', 'twitter:card', seo.ogImageUrl ? 'summary_large_image' : 'summary');
  setMeta('name', 'twitter:title', seo.title);
  setMeta('name', 'twitter:description', seo.description);
  setMeta('name', 'twitter:image', seo.ogImageUrl || null);
  setMeta('name', 'twitter:site', seo.twitterHandle ? `@${seo.twitterHandle}` : null);
}

export function applyAdminRobots(): void {
  if (typeof document === 'undefined') return;
  setMeta('name', 'robots', 'noindex,nofollow');
}

const staticTitle = typeof document !== 'undefined' ? document.title : '';

/** Restore the static head when returning from admin without saved SEO. */
export function restoreStaticMetadata(): void {
  if (typeof document === 'undefined') return;
  setMeta('name', 'robots', null);
  if (staticTitle) document.title = staticTitle;
}
