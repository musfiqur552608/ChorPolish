import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Info, Megaphone, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePublicSiteStore } from '@/hooks/usePublicSiteStore';
import { cn } from '@/lib/cn';
import { sound } from '@/lib/sound';
import type { NoticeTone, PublicNotice } from '@/types/site';

const toneStyles: Record<
  NoticeTone,
  { shell: string; icon: string; accent: string }
> = {
  info: {
    shell: 'border-teal/25 bg-surface-teal/75',
    icon: 'bg-teal/[0.12] text-teal',
    accent: 'text-teal',
  },
  success: {
    shell: 'border-leaf/25 bg-surface-mint/80',
    icon: 'bg-leaf/[0.12] text-leaf',
    accent: 'text-leaf',
  },
  warning: {
    shell: 'border-mustard/40 bg-surface-cream/85',
    icon: 'bg-mustard/20 text-mustard-ink',
    accent: 'text-mustard-ink',
  },
};

const toneIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
};

function storageKey(notice: PublicNotice): string {
  return `chorpolice.notice.${notice.id}.${notice.updatedAt}`;
}

function safeLink(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

export function SiteNoticeBanner() {
  const { t, i18n } = useTranslation();
  const notice = usePublicSiteStore((state) => state.config?.notice ?? null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!notice) {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(window.localStorage.getItem(storageKey(notice)) === '1');
    } catch {
      setDismissed(false);
    }
  }, [notice]);

  const activeNotice = notice && !dismissed ? notice : null;
  const tone = toneStyles[activeNotice?.tone ?? 'info'] ?? toneStyles.info;
  const Icon = toneIcons[activeNotice?.tone ?? 'info'] ?? Megaphone;
  const title = activeNotice
    ? i18n.language === 'bn'
      ? activeNotice.titleBn || activeNotice.titleEn
      : activeNotice.titleEn || activeNotice.titleBn
    : '';
  const body = activeNotice
    ? i18n.language === 'bn'
      ? activeNotice.bodyBn || activeNotice.bodyEn
      : activeNotice.bodyEn || activeNotice.bodyBn
    : '';
  const label = activeNotice
    ? i18n.language === 'bn'
      ? activeNotice.linkLabelBn || activeNotice.linkLabelEn
      : activeNotice.linkLabelEn || activeNotice.linkLabelBn
    : '';
  const href = safeLink(activeNotice?.linkUrl ?? null);

  function dismiss() {
    if (!activeNotice) return;
    try {
      window.localStorage.setItem(storageKey(activeNotice), '1');
    } catch {
      // Storage may be blocked; hiding for this visit is still useful.
    }
    setDismissed(true);
    sound.play('click');
  }

  return (
    <AnimatePresence>
      {activeNotice && (
        <motion.aside
          key={activeNotice.id}
          initial={{ opacity: 0, y: -10, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.99 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          aria-label={t('notice.label')}
          className="relative z-10 mx-auto mt-3 w-full max-w-6xl px-5 sm:px-7"
        >
          <div
            className={cn(
              'premium-glass relative flex items-start gap-3 overflow-hidden rounded-[14px] border px-3.5 py-3 shadow-paper sm:items-center sm:gap-4 sm:px-4',
              tone.shell,
            )}
          >
            <span
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink/10',
                tone.icon,
              )}
              aria-hidden
            >
              <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className={cn('text-[10px] font-bold uppercase tracking-[0.16em]', tone.accent)}>
                  {t('notice.label')}
                </span>
                <span className="h-1 w-1 rounded-full bg-ink/20" aria-hidden />
                <p className="font-display text-[15px] font-bold leading-snug text-ink">{title}</p>
              </div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft sm:text-[13px]">{body}</p>
            </div>

            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label || t('notice.learnMore')}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink/10 bg-paper-light/70 px-2 py-1.5 text-xs font-bold text-ink transition-colors hover:border-ink/25 hover:bg-paper-light sm:px-3"
              >
                <span className="hidden sm:inline">{label || t('notice.learnMore')}</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}

            {activeNotice.isDismissible && (
              <button
                type="button"
                onClick={dismiss}
                aria-label={t('notice.dismiss')}
                title={t('notice.dismiss')}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
