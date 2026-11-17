import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  AtSign,
  CheckCircle2,
  Globe2,
  Image as ImageIcon,
  Link2,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { toast } from '@/hooks/useToastStore';
import { refreshPublicSite } from '@/hooks/usePublicSiteStore';
import { adminGetSeo, adminSaveSeo } from '@/lib/supabase/adminApi';
import { normalizeApiError } from '@/lib/errors';
import { cn } from '@/lib/cn';
import type { AdminSeo } from '@/types/admin';
import { formatCount } from './adminFormat';
import {
  AdminBadge,
  AdminCard,
  AdminEmptyState,
  AdminSectionHeading,
  AdminSkeleton,
  AdminToggle,
} from './AdminUi';

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function SeoTextarea({
  label,
  hint,
  value,
  onChange,
  maxLength,
  language,
  error,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  language: string;
  error?: string | null;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-semibold text-ink">
          {label}
        </label>
        <span className="text-[10px] font-semibold tabular-nums text-ink-faint">
          {formatCount(value.length, language)} / {formatCount(maxLength, language)}
        </span>
      </div>
      <textarea
        id={id}
        rows={4}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={cn(
          'w-full resize-y rounded-[10px] border-2 border-ink/15 bg-paper-light px-3.5 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-faint',
          'shadow-[inset_0_2px_4px_rgba(32,51,70,.04)] transition-colors',
          'focus:border-teal focus:outline-none focus:ring-4 focus:ring-teal/10',
          error && 'border-terracotta/70 focus:border-terracotta',
        )}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-terracotta">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12px] leading-snug text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function HealthRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mustard-ink" aria-hidden />
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-ink">{label}</p>
        {detail && <p className="text-[10px] leading-snug text-ink-faint">{detail}</p>}
      </div>
    </div>
  );
}

function SeoPreview({
  draft,
  language,
  score,
}: {
  draft: AdminSeo;
  language: string;
  score: number;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const title = draft.title || t('admin.seo.previewTitleFallback');
  const description = draft.description || t('admin.seo.previewDescriptionFallback');
  const url = draft.canonicalUrl || t('admin.seo.previewUrlFallback');
  const host = useMemo(() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }, [url]);

  const radius = 34;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="space-y-3">
      <AdminCard className="overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-hand text-lg font-bold leading-none text-terracotta">
              {t('admin.seo.health')}
            </p>
            <p className="mt-1 text-[11px] text-ink-soft">
              {score >= 80 ? t('admin.seo.healthGood') : t('admin.seo.healthNeedsWork')}
            </p>
          </div>
          <div className="relative grid h-20 w-20 place-items-center">
            <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90" aria-hidden>
              <circle
                cx="40"
                cy="40"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="7"
                className="text-ink/10"
              />
              <motion.circle
                cx="40"
                cy="40"
                r={radius}
                fill="none"
                stroke={score >= 80 ? 'rgb(63 115 80)' : 'rgb(223 169 63)'}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: reduce ? circumference * (1 - score / 100) : circumference }}
                animate={{ strokeDashoffset: circumference * (1 - score / 100) }}
                transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </svg>
            <span className="absolute font-display text-lg font-bold text-ink">
              {formatCount(score, language)}%
            </span>
          </div>
        </div>

        <div className="mt-3 grid gap-2 border-t border-ink/[0.08] pt-3 sm:grid-cols-2">
          <HealthRow
            label={t('admin.seo.healthTitle')}
            ok={draft.title.length >= 30 && draft.title.length <= 70}
            detail={
              draft.title.length > 70
                ? t('admin.seo.titleLong')
                : draft.title.length < 30
                  ? t('admin.seo.titleShort')
                  : t('admin.seo.titleGood')
            }
          />
          <HealthRow
            label={t('admin.seo.healthDescription')}
            ok={draft.description.length >= 80 && draft.description.length <= 180}
            detail={
              draft.description.length > 180
                ? t('admin.seo.descriptionLong')
                : draft.description.length < 80
                  ? t('admin.seo.descriptionShort')
                  : t('admin.seo.descriptionGood')
            }
          />
          <HealthRow label={t('admin.seo.healthKeywords')} ok={Boolean(draft.keywords.trim())} />
          <HealthRow
            label={t('admin.seo.healthCanonical')}
            ok={isHttpUrl(draft.canonicalUrl)}
            detail={
              draft.canonicalUrl
                ? isHttpUrl(draft.canonicalUrl)
                  ? undefined
                  : t('admin.seo.urlInvalid')
                : t('admin.seo.canonicalMissing')
            }
          />
          <HealthRow
            label={t('admin.seo.healthImage')}
            ok={isHttpUrl(draft.ogImageUrl)}
            detail={
              draft.ogImageUrl
                ? isHttpUrl(draft.ogImageUrl)
                  ? undefined
                  : t('admin.seo.urlInvalid')
                : t('admin.seo.imageMissing')
            }
          />
          <HealthRow
            label={t('admin.seo.noindexLabel')}
            ok={!draft.noindex}
            detail={draft.noindex ? t('admin.seo.noindexOn') : t('admin.seo.noindexOff')}
          />
        </div>
      </AdminCard>

      <AdminCard>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-teal" aria-hidden />
          <div>
            <p className="text-[11px] font-bold text-ink">{t('admin.seo.searchPreview')}</p>
            <p className="text-[10px] text-ink-faint">{t('admin.seo.searchPreviewSub')}</p>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-ink/[0.08] bg-paper-light/55 p-3">
          <p className="truncate text-[10px] font-semibold text-ink-soft">{host}</p>
          <p className="mt-0.5 line-clamp-2 text-[17px] font-semibold leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
            {title}
          </p>
          <p className="mt-1 line-clamp-3 text-[11.5px] leading-relaxed text-ink-soft">{description}</p>
        </div>
      </AdminCard>

      <AdminCard>
        <div className="flex items-center gap-2">
          <Share2 className="h-4 w-4 text-mustard-ink" aria-hidden />
          <div>
            <p className="text-[11px] font-bold text-ink">{t('admin.seo.socialPreview')}</p>
            <p className="text-[10px] text-ink-faint">{t('admin.seo.socialPreviewSub')}</p>
          </div>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-ink/10 bg-paper-light">
          {draft.ogImageUrl ? (
            <div className="relative aspect-[1200/630] w-full bg-ink/5">
              <img
                src={draft.ogImageUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            </div>
          ) : (
            <div className="relative grid aspect-[1200/630] place-items-center overflow-hidden bg-gradient-to-br from-[#101b26] via-[#173247] to-[#101b26]">
              <div className="absolute inset-0 opacity-20">
                <div className="admin-grid h-full w-full" />
              </div>
              <div className="relative text-center text-paper-light">
                <Sparkles className="mx-auto h-6 w-6 text-[#f0c35a]" aria-hidden />
                <p className="mt-2 font-display text-lg font-bold">চোর পুলিশ</p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-paper/45">
                  Chor Police
                </p>
              </div>
            </div>
          )}
          <div className="p-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-faint">{host}</p>
            <p className="mt-0.5 line-clamp-1 text-[13px] font-bold text-ink">{title}</p>
            <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-relaxed text-ink-soft">{description}</p>
          </div>
        </div>
      </AdminCard>
    </div>
  );
}

export function AdminSeo() {
  const { t, i18n } = useTranslation();
  const [saved, setSaved] = useState<AdminSeo | null>(null);
  const [draft, setDraft] = useState<AdminSeo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await adminGetSeo();
      setSaved(next);
      setDraft(next);
      setError(null);
    } catch (cause) {
      const code = normalizeApiError(cause).code;
      setError(
        code === 'NOT_ADMIN' ? i18n.t('admin.gate.forbiddenTitle') : i18n.t('admin.shell.error'),
      );
    } finally {
      setLoading(false);
    }
  }, [i18n]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = Boolean(
    saved &&
      draft &&
      (saved.title !== draft.title ||
        saved.description !== draft.description ||
        saved.keywords !== draft.keywords ||
        saved.canonicalUrl !== draft.canonicalUrl ||
        saved.ogImageUrl !== draft.ogImageUrl ||
        saved.twitterHandle !== draft.twitterHandle ||
        saved.noindex !== draft.noindex),
  );

  const score = useMemo(() => {
    if (!draft) return 0;
    const checks = [
      draft.title.length >= 30 && draft.title.length <= 70,
      draft.description.length >= 80 && draft.description.length <= 180,
      Boolean(draft.keywords.trim()),
      isHttpUrl(draft.canonicalUrl),
      isHttpUrl(draft.ogImageUrl),
      !draft.noindex,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [draft]);

  function update(patch: Partial<AdminSeo>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setFormError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;

    if (!draft.title.trim() || !draft.description.trim() || !draft.keywords.trim()) {
      setFormError(t('admin.seo.validation'));
      return;
    }
    const urls = [draft.canonicalUrl, draft.ogImageUrl].filter(Boolean);
    if (urls.some((url) => !/^https?:\/\/\S+$/i.test(url))) {
      setFormError(t('admin.seo.validation'));
      return;
    }
    if (draft.twitterHandle && !/^[A-Za-z0-9_]{1,30}$/.test(draft.twitterHandle.replace(/^@/, ''))) {
      setFormError(t('admin.seo.validation'));
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const next = await adminSaveSeo({
        title: draft.title,
        description: draft.description,
        keywords: draft.keywords,
        canonicalUrl: draft.canonicalUrl,
        ogImageUrl: draft.ogImageUrl,
        twitterHandle: draft.twitterHandle,
        noindex: draft.noindex,
      });
      setSaved(next);
      setDraft(next);
      toast(t('admin.seo.saved'), 'success');
      refreshPublicSite();
    } catch (cause) {
      const code = normalizeApiError(cause).code;
      setFormError(code === 'INVALID_SEO' ? t('errors.INVALID_SEO') : t('admin.shell.error'));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !draft) {
    return (
      <div className="space-y-3">
        <AdminSkeleton className="h-28" />
        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <AdminSkeleton className="h-[420px]" />
          <AdminSkeleton className="h-[420px]" />
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <AdminCard>
        <AdminEmptyState
          icon={<RefreshCw className="h-5 w-5" aria-hidden />}
          title={t('admin.shell.error')}
          body={error || t('admin.gate.errorBody')}
          action={
            <Button variant="primary" onClick={() => void load()} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              {t('admin.shell.retry')}
            </Button>
          }
        />
      </AdminCard>
    );
  }

  return (
    <div className="space-y-4">
      <AdminCard>
        <AdminSectionHeading
          kicker={t('admin.seo.health')}
          title={t('admin.seo.title')}
          subtitle={t('admin.seo.subtitle')}
          action={
            <div className="flex items-center gap-2">
              <AdminBadge tone={draft.noindex ? 'danger' : 'success'}>
                {draft.noindex ? t('admin.seo.noindexOn') : t('admin.seo.noindexOff')}
              </AdminBadge>
              {dirty && (
                <span className="text-[10px] font-semibold text-mustard-ink">
                  {t('admin.seo.previewNote')}
                </span>
              )}
            </div>
          }
        />
      </AdminCard>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <AdminCard>
          <form id="admin-seo-form" className="space-y-4" onSubmit={save}>
            <Field
              label={t('admin.seo.titleLabel')}
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
              maxLength={120}
              leading={<Search className="h-4 w-4" aria-hidden />}
              hint={t('admin.seo.chars', {
                value: formatCount(draft.title.length, i18n.language),
                max: formatCount(120, i18n.language),
              })}
            />

            <SeoTextarea
              label={t('admin.seo.descriptionLabel')}
              value={draft.description}
              onChange={(value) => update({ description: value })}
              maxLength={320}
              language={i18n.language}
              hint={
                draft.description.length > 180
                  ? t('admin.seo.descriptionLong')
                  : draft.description.length < 80
                    ? t('admin.seo.descriptionShort')
                    : t('admin.seo.descriptionGood')
              }
            />

            <SeoTextarea
              label={t('admin.seo.keywordsLabel')}
              value={draft.keywords}
              onChange={(value) => update({ keywords: value })}
              maxLength={300}
              language={i18n.language}
              hint={t('admin.seo.keywordsHint')}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('admin.seo.canonicalLabel')}
                type="url"
                value={draft.canonicalUrl}
                onChange={(event) => update({ canonicalUrl: event.target.value })}
                placeholder="https://"
                hint={t('admin.seo.canonicalHint')}
                leading={<Globe2 className="h-4 w-4" aria-hidden />}
              />
              <Field
                label={t('admin.seo.ogImageLabel')}
                type="url"
                value={draft.ogImageUrl}
                onChange={(event) => update({ ogImageUrl: event.target.value })}
                placeholder="https://"
                hint={t('admin.seo.ogImageHint')}
                leading={<ImageIcon className="h-4 w-4" aria-hidden />}
              />
            </div>

            <Field
              label={t('admin.seo.twitterLabel')}
              value={draft.twitterHandle}
              onChange={(event) => update({ twitterHandle: event.target.value.replace(/^@/, '') })}
              maxLength={30}
              hint={t('admin.seo.twitterHint')}
              leading={<AtSign className="h-4 w-4" aria-hidden />}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/[0.08] bg-paper-light/45 px-3 py-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  className={cn(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                    draft.noindex ? 'bg-terracotta/10 text-terracotta' : 'bg-leaf/10 text-leaf',
                  )}
                >
                  {draft.noindex ? <AlertTriangle className="h-4 w-4" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                </span>
                <div>
                  <p className="text-[12px] font-bold text-ink">{t('admin.seo.noindexLabel')}</p>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-ink-soft">{t('admin.seo.noindexHint')}</p>
                </div>
              </div>
              <AdminToggle
                checked={draft.noindex}
                onChange={(next) => update({ noindex: next })}
                label={t('admin.seo.noindexLabel')}
              />
            </div>

            {formError && (
              <p role="alert" className="rounded-xl border border-terracotta/20 bg-terracotta/[0.08] px-3 py-2.5 text-[12px] font-medium text-terracotta">
                {formError}
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-ink-faint">
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                {t('admin.seo.previewNote')}
              </p>
              <Button type="submit" loading={saving} leftIcon={<Sparkles className="h-4 w-4" aria-hidden />}>
                {saving ? t('admin.seo.saving') : t('admin.seo.save')}
              </Button>
            </div>
          </form>
        </AdminCard>

        <SeoPreview draft={draft} language={i18n.language} score={score} />
      </div>
    </div>
  );
}
