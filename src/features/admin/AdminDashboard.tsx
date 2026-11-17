import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  BellRing,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { PreferenceButtons } from '@/components/ui/PreferenceButtons';
import { useSettingsStore } from '@/hooks/useSettingsStore';
import { toast } from '@/hooks/useToastStore';
import { adminGetOverview } from '@/lib/supabase/adminApi';
import { normalizeApiError } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { sound } from '@/lib/sound';
import type { AdminOverview, AdminSession } from '@/types/admin';
import { formatDateTime } from './adminFormat';
import { AdminBadge, LiveDot } from './AdminUi';
import { AdminNotices } from './AdminNotices';
import { AdminPulse } from './AdminPulse';
import { AdminSeo } from './AdminSeo';

type Tab = 'pulse' | 'notices' | 'seo';

const tabs: Array<{ id: Tab; icon: typeof Activity; label: string }> = [
  { id: 'pulse', icon: Activity, label: 'admin.nav.pulse' },
  { id: 'notices', icon: BellRing, label: 'admin.nav.notices' },
  { id: 'seo', icon: Search, label: 'admin.nav.seo' },
];

function NavButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Activity;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-bold transition-all',
        active
          ? 'bg-[#f0c35a] text-[#101b26] shadow-[0_6px_18px_-8px_rgba(240,195,90,0.7)]'
          : 'text-paper/60 hover:bg-white/[0.06] hover:text-paper',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-[#101b26]' : 'text-paper/45 group-hover:text-paper/80')} aria-hidden />
      {label}
    </button>
  );
}

export function AdminDashboard({
  session,
  onSignOut,
}: {
  session: AdminSession;
  onSignOut: () => void;
}) {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const [tab, setTab] = useState<Tab>('pulse');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  const loadOverview = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const next = await adminGetOverview(timezone);
        setOverview(next);
        setError(null);
        setLastUpdated(new Date());
      } catch (cause) {
        const code = normalizeApiError(cause).code;
        const message =
          code === 'NOT_ADMIN' ? i18n.t('admin.gate.forbiddenTitle') : i18n.t('admin.shell.error');
        setError(message);
        if (silent) toast(message, 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [i18n, timezone],
  );

  useEffect(() => {
    void loadOverview(false);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadOverview(true);
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [loadOverview]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadOverview(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadOverview]);

  const activeLabel = t(tabs.find((item) => item.id === tab)?.label ?? 'admin.nav.pulse');

  return (
    <div className="admin-shell min-h-screen bg-paper text-ink">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[252px_minmax(0,1fr)]">
        <aside className="relative hidden overflow-hidden bg-[#101b26] text-paper-light lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:p-4">
          <div className="admin-sidebar-glow" aria-hidden />
          <div className="relative">
            <Logo inverted />
            <p className="mt-3 font-hand text-[12px] font-semibold tracking-[0.16em] text-[#f0c35a]/80">
              {t('admin.brandKicker')}
            </p>
          </div>

          <nav className="relative mt-7 space-y-1" aria-label={t('admin.shell.menu')}>
            {tabs.map((item) => (
              <NavButton
                key={item.id}
                active={tab === item.id}
                icon={item.icon}
                label={t(item.label)}
                onClick={() => setTab(item.id)}
              />
            ))}
          </nav>

          <div className="relative mt-auto space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
              <div className="flex items-center gap-2">
                <LiveDot />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9fe3d8]">
                  {t('admin.shell.live')}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-paper/50">{t('admin.shell.autoRefresh')}</p>
              {lastUpdated && (
                <p className="mt-1.5 text-[10px] font-semibold text-paper/35">
                  {t('admin.shell.updated', {
                    time: formatDateTime(lastUpdated.toISOString(), i18n.language, timezone),
                  })}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#f0c35a]/30 bg-[#f0c35a]/[0.12] text-sm font-bold text-[#f0c35a]">
                  {session.displayName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-bold text-paper">{session.displayName}</p>
                  <p className="truncate text-[10px] text-paper/40">{session.email ?? t('admin.shell.admin')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-[11px] font-bold text-paper/60 transition-colors hover:bg-white/[0.06] hover:text-paper"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                {t('admin.shell.signOut')}
              </button>
            </div>

            <Link
              to="/"
              className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-full border border-white/10 px-2.5 text-[10px] font-bold text-paper/60 transition-colors hover:bg-white/[0.06] hover:text-paper"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              {t('admin.shell.backToGame')}
            </Link>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/85 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <Link to="/" className="lg:hidden" aria-label={t('admin.shell.backToGame')}>
                  <Logo compact />
                </Link>
                <div className="hidden min-w-0 sm:block">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-terracotta">
                    {t('admin.brandKicker')}
                  </p>
                  <h1 className="truncate font-display text-xl font-bold leading-tight text-ink">
                    {activeLabel}
                  </h1>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <AdminBadge tone="live" className="hidden sm:inline-flex">
                  <LiveDot />
                  {t('admin.shell.live')}
                </AdminBadge>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadOverview(false)}
                  loading={refreshing}
                  leftIcon={<RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} aria-hidden />}
                  aria-label={t('admin.shell.refresh')}
                  title={t('admin.shell.refresh')}
                  className="h-9 min-w-9 px-2 sm:px-3"
                >
                  <span className="hidden sm:inline">{t('admin.shell.refresh')}</span>
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setLanguage(language === 'bn' ? 'en' : 'bn');
                    sound.play('click');
                  }}
                  aria-label={language === 'bn' ? 'Switch to English' : 'বাংলায় দেখাও'}
                  title={t('common.language')}
                  className="grid h-9 w-9 place-items-center rounded-full border border-ink/10 text-[11px] font-bold text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink md:hidden"
                >
                  {language === 'bn' ? 'বাং' : 'EN'}
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  aria-label={t('admin.shell.signOut')}
                  title={t('admin.shell.signOut')}
                  className="grid h-9 w-9 place-items-center rounded-full border border-ink/10 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                </button>
                <div className="hidden md:block">
                  <PreferenceButtons />
                </div>
              </div>
            </div>

            <nav className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6 lg:hidden" aria-label={t('admin.shell.menu')}>
              {tabs.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors',
                      active
                        ? 'border-ink bg-ink text-paper-light'
                        : 'border-ink/10 text-ink-soft hover:bg-ink/5 hover:text-ink',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {t(item.label)}
                  </button>
                );
              })}
            </nav>
          </header>

          <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-4 sm:px-6 sm:pt-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] font-semibold text-ink-faint">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-leaf" aria-hidden />
                {t('admin.login.securityNote')}
              </span>
              {lastUpdated && (
                <span>
                  {t('admin.shell.updated', {
                    time: formatDateTime(lastUpdated.toISOString(), i18n.language, timezone),
                  })}
                </span>
              )}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : -6 }}
                transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {tab === 'pulse' && (
                  <AdminPulse
                    overview={overview}
                    loading={loading}
                    error={error}
                    onRetry={() => void loadOverview(false)}
                  />
                )}
                {tab === 'notices' && <AdminNotices />}
                {tab === 'seo' && <AdminSeo />}
              </motion.div>
            </AnimatePresence>

            {!overview && tab === 'pulse' && loading && (
              <div className="sr-only" role="status" aria-live="polite">
                {t('admin.loadingBody')}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
