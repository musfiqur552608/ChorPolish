export type NoticeTone = 'info' | 'success' | 'warning';

export interface PublicNotice {
  id: string;
  titleEn: string;
  titleBn: string;
  bodyEn: string;
  bodyBn: string;
  tone: NoticeTone;
  linkUrl: string | null;
  linkLabelEn: string | null;
  linkLabelBn: string | null;
  isDismissible: boolean;
  updatedAt: string;
}

export interface PublicSeo {
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  ogImageUrl: string;
  twitterHandle: string;
  noindex: boolean;
  updatedAt: string;
}

export interface PublicSiteConfig {
  notice: PublicNotice | null;
  seo: PublicSeo;
}
