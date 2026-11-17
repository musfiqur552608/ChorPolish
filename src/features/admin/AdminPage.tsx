import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  Database,
  LogOut,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Logo } from '@/components/ui/Logo';
import { PreferenceButtons } from '@/components/ui/PreferenceButtons';
import { adminGetSession, adminSignOut } from '@/lib/supabase/adminApi';
import { adminSupabase } from '@/lib/supabase/adminClient';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { normalizeApiError } from '@/lib/errors';
import { applyAdminRobots } from '@/lib/seo';
import type { AdminSession } from '@/types/admin';
import { AdminDashboard } from './AdminDashboard';
import { AdminLogin } from './AdminLogin';

type Gate = 'checking' | 'signedOut' | 'forbidden' | 'setup' | 'error' | 'ready';

function AdminGateScreen({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();

  return (
    <div className="admin-shell relative grid min-h-screen place-items-center overflow-hidden bg-paper px-5 py-10 text-ink">
      <div className="admin-aurora" aria-hidden />
      <div className="admin-grid pointer-events-none absolute inset-0" aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-lg"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <Logo compact />
          <PreferenceButtons />
        </div>
        <div className="premium-glass rounded-[24px] border border-ink/[0.12] p-6 text-center shadow-paper sm:p-8">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-mustard/30 bg-mustard/[0.12] text-mustard-ink">
            {icon}
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-soft">{body}</p>
          {children && <div className="mt-5 flex flex-col items-stretch justify-center gap-2 sm:flex-row">{children}</div>}
        </div>
        <Link
          to="/"
          className="mt-4 flex items-center justify-center gap-1.5 text-xs font-bold text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t('admin.gate.backHome')}
        </Link>
      </motion.div>
    </div>
  );
}

export function AdminPage() {
  const { t, i18n } = useTranslation();
  const [gate, setGate] = useState<Gate>('checking');
  const [session, setSession] = useState<AdminSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    applyAdminRobots();
    document.title = `${t('admin.title')} · ${t('common.appName')}`;
  }, [t]);

  const check = useCallback(async () => {
    if (!isSupabaseConfigured || !adminSupabase) {
      setGate('setup');
      return;
    }

    setGate('checking');
    setError(null);

    try {
      const { data, error: sessionError } = await adminSupabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) {
        setGate('signedOut');
        return;
      }

      const next = await adminGetSession();
      setSession(next);
      setGate('ready');
    } catch (cause) {
      const code = normalizeApiError(cause).code;
      if (code === 'UNAUTHENTICATED') {
        setGate('signedOut');
      } else if (code === 'NOT_ADMIN') {
        setGate('forbidden');
      } else if (code === 'SERVER_OUTDATED') {
        setGate('setup');
      } else {
        setError(i18n.t('admin.gate.errorBody'));
        setGate('error');
      }
    }
  }, [i18n]);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    if (!adminSupabase) return;
    const { data } = adminSupabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setGate('signedOut');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signOut() {
    try {
      await adminSignOut();
    } catch {
      // Even if the network call fails, drop the local admin view immediately.
    }
    setSession(null);
    setGate('signedOut');
  }

  if (gate === 'checking') {
    return <LoadingScreen title={t('admin.loadingTitle')} subtitle={t('admin.loadingBody')} />;
  }

  if (gate === 'signedOut') {
    return <AdminLogin onSignedIn={() => void check()} />;
  }

  if (gate === 'forbidden') {
    return (
      <AdminGateScreen
        icon={<ShieldAlert className="h-6 w-6" aria-hidden />}
        title={t('admin.gate.forbiddenTitle')}
        body={t('admin.gate.forbiddenBody')}
      >
        <Button
          variant="primary"
          onClick={() => void signOut()}
          leftIcon={<LogOut className="h-4 w-4" aria-hidden />}
        >
          {t('admin.login.signOutDifferent')}
        </Button>
      </AdminGateScreen>
    );
  }

  if (gate === 'setup') {
    return (
      <AdminGateScreen
        icon={<Database className="h-6 w-6" aria-hidden />}
        title={t('admin.gate.setupTitle')}
        body={t('admin.gate.setupBody')}
      />
    );
  }

  if (gate === 'error') {
    return (
      <AdminGateScreen
        icon={<WifiOff className="h-6 w-6" aria-hidden />}
        title={t('admin.gate.errorTitle')}
        body={error || t('admin.gate.errorBody')}
      >
        <Button
          variant="primary"
          onClick={() => void check()}
          leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}
        >
          {t('admin.gate.retry')}
        </Button>
      </AdminGateScreen>
    );
  }

  if (!session) {
    return (
      <AdminGateScreen
        icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
        title={t('admin.gate.errorTitle')}
        body={t('admin.gate.errorBody')}
      >
        <Button variant="primary" onClick={() => void check()} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}>
          {t('admin.gate.retry')}
        </Button>
      </AdminGateScreen>
    );
  }

  return <AdminDashboard session={session} onSignOut={() => void signOut()} />;
}
