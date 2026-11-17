import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BellRing,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Logo } from '@/components/ui/Logo';
import { PreferenceButtons } from '@/components/ui/PreferenceButtons';
import { adminSignIn } from '@/lib/supabase/adminApi';
import { normalizeApiError } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { sound } from '@/lib/sound';

const highlights = [
  { icon: Radio, key: 'live' },
  { icon: BarChart3, key: 'trends' },
  { icon: BellRing, key: 'notices' },
  { icon: Search, key: 'seo' },
] as const;

export function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await adminSignIn(email, password);
      sound.play('success');
      onSignedIn();
    } catch (cause) {
      const code = normalizeApiError(cause).code;
      setError(code === 'NETWORK' ? t('errors.NETWORK') : t('admin.login.invalid'));
      sound.play('oops');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-shell relative min-h-screen overflow-hidden bg-paper text-ink">
      <div className="admin-aurora" aria-hidden />
      <div className="admin-grid pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 pb-10 pt-5 sm:px-7 sm:pt-7">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Logo compact />
          <div className="flex flex-wrap items-center gap-2">
            <PreferenceButtons />
            <Link
              to="/"
              className="hidden h-9 items-center gap-1.5 rounded-full border border-ink/10 px-3 text-xs font-bold text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink sm:inline-flex"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              {t('admin.backToGame')}
            </Link>
          </div>
        </header>

        <main className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:py-14">
          <section className="relative">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-xl"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-mustard/35 bg-mustard/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-mustard-ink">
                <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
                {t('admin.login.kicker')}
              </div>

              <h1 className="mt-5 font-display text-[44px] font-bold leading-[0.98] tracking-tight text-ink sm:text-[62px]">
                {t('admin.login.heroTitle')}
              </h1>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-soft sm:text-base">
                {t('admin.login.heroBody')}
              </p>

              <div className="mt-8 flex flex-wrap gap-2">
                {highlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <span
                      key={item.key}
                      className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper-light/60 px-3 py-1.5 text-xs font-bold text-ink-soft"
                    >
                      <Icon className="h-3.5 w-3.5 text-teal" aria-hidden />
                      {t(`admin.login.highlights.${item.key}`)}
                    </span>
                  );
                })}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 26, rotate: -1.5 }}
              animate={{ opacity: 1, y: 0, rotate: -1.5 }}
              transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="admin-login-preview premium-glass relative mt-9 max-w-xl overflow-hidden rounded-[22px] border border-ink/10 p-4 shadow-paper sm:p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal/55" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal">
                    {t('admin.shell.live')}
                  </span>
                </div>
                <Sparkles className="h-4 w-4 text-mustard" aria-hidden />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { icon: Radio, label: t('admin.login.heroLive'), tone: 'text-teal' },
                  { icon: BarChart3, label: t('admin.login.heroPlayers'), tone: 'text-mustard-ink' },
                  { icon: ShieldCheck, label: t('admin.login.heroHours'), tone: 'text-terracotta' },
                ].map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduce ? 0 : 0.25 + index * 0.08 }}
                      className="rounded-xl border border-ink/[0.08] bg-paper-light/55 px-3 py-3"
                    >
                      <Icon className={cn('h-4 w-4', item.tone)} aria-hidden />
                      <p className="mt-2 text-[10px] font-semibold leading-tight text-ink-soft">{item.label}</p>
                      <div className="mt-2 flex h-7 items-end gap-1" aria-hidden>
                        {[35, 58, 42, 74, 52, 86].map((height, barIndex) => (
                          <motion.span
                            key={barIndex}
                            className="w-full rounded-sm bg-gradient-to-t from-teal/20 to-teal/70"
                            initial={{ height: reduce ? `${height}%` : 4 }}
                            animate={{ height: `${height}%` }}
                            transition={{ delay: reduce ? 0 : 0.4 + barIndex * 0.04, duration: 0.5 }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-ink/15 bg-paper-light/35 px-3 py-2.5 text-[11px] font-medium text-ink-soft">
                <ShieldCheck className="h-4 w-4 shrink-0 text-leaf" aria-hidden />
                {t('admin.login.securityNote')}
              </div>
            </motion.div>
          </section>

          <motion.section
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto w-full max-w-md"
          >
            <div className="absolute -inset-3 -z-10 rounded-[30px] bg-gradient-to-br from-mustard/20 via-transparent to-teal/20 blur-2xl" aria-hidden />
            <div className="premium-glass rounded-[24px] border border-ink/[0.12] p-5 shadow-paper sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-hand text-xl font-bold leading-none text-terracotta">
                    {t('admin.login.title')}
                  </p>
                  <h2 className="mt-1.5 font-display text-3xl font-bold tracking-tight text-ink">
                    {t('admin.brandKicker')}
                  </h2>
                </div>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-mustard/30 bg-mustard/[0.12] text-mustard-ink">
                  <KeyRound className="h-5 w-5" aria-hidden />
                </span>
              </div>

              <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{t('admin.login.subtitle')}</p>

              <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
                <Field
                  label={t('admin.login.email')}
                  type="email"
                  name="email"
                  autoComplete="username"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('admin.login.emailPlaceholder')}
                  leading={<ShieldCheck className="h-4 w-4" aria-hidden />}
                />

                <Field
                  label={t('admin.login.password')}
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('admin.login.passwordPlaceholder')}
                  leading={<LockKeyhole className="h-4 w-4" aria-hidden />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? t('admin.login.hidePassword') : t('admin.login.showPassword')}
                      className="grid h-8 w-8 place-items-center rounded-full text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                    </button>
                  }
                />

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="alert"
                    className="rounded-xl border border-terracotta/20 bg-terracotta/[0.08] px-3 py-2.5 text-[13px] font-medium text-terracotta"
                  >
                    {error}
                  </motion.p>
                )}

                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  loading={loading}
                  rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}
                >
                  {loading ? t('admin.login.submitting') : t('admin.login.submit')}
                </Button>
              </form>

              <div className="mt-5 flex items-start gap-2 rounded-xl border border-ink/[0.08] bg-paper-light/40 px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" aria-hidden />
                {t('admin.login.allowlistHint')}
              </div>
            </div>

            <Link
              to="/"
              className="mt-4 flex items-center justify-center gap-1.5 text-xs font-bold text-ink-soft transition-colors hover:text-ink sm:hidden"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              {t('admin.backToGame')}
            </Link>
          </motion.section>
        </main>
      </div>
    </div>
  );
}
