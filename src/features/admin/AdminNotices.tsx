import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Info,
  Link2,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/hooks/useToastStore';
import { refreshPublicSite } from '@/hooks/usePublicSiteStore';
import { adminDeleteNotice, adminListNotices, adminSaveNotice, adminToggleNotice } from '@/lib/supabase/adminApi';
import { normalizeApiError } from '@/lib/errors';
import { cn } from '@/lib/cn';
import type { AdminNotice, AdminNoticeDraft } from '@/types/admin';
import type { NoticeTone } from '@/types/site';
import {
  formatCount,
  formatDateTime,
  inputToIso,
  localInputValue,
} from './adminFormat';
import {
  AdminBadge,
  AdminCard,
  AdminEmptyState,
  AdminSectionHeading,
  AdminSkeleton,
  AdminToggle,
} from './AdminUi';

const toneOrder: NoticeTone[] = ['info', 'success', 'warning'];

const toneStyles: Record<
  NoticeTone,
  { shell: string; icon: string; accent: string; badge: string; labelKey: string; Icon: typeof Info }
> = {
  info: {
    shell: 'border-teal/25 bg-surface-teal/65',
    icon: 'bg-teal/[0.12] text-teal',
    accent: 'text-teal',
    badge: 'border-teal/30 bg-teal/10 text-teal',
    labelKey: 'admin.notices.toneInfo',
    Icon: Info,
  },
  success: {
    shell: 'border-leaf/25 bg-surface-mint/70',
    icon: 'bg-leaf/[0.12] text-leaf',
    accent: 'text-leaf',
    badge: 'border-leaf/30 bg-leaf/10 text-leaf',
    labelKey: 'admin.notices.toneSuccess',
    Icon: CheckCircle2,
  },
  warning: {
    shell: 'border-mustard/35 bg-surface-cream/80',
    icon: 'bg-mustard/[0.18] text-mustard-ink',
    accent: 'text-mustard-ink',
    badge: 'border-mustard/35 bg-mustard/15 text-mustard-ink',
    labelKey: 'admin.notices.toneWarning',
    Icon: AlertTriangle,
  },
};

function emptyDraft(): AdminNoticeDraft {
  return {
    id: null,
    titleEn: '',
    titleBn: '',
    bodyEn: '',
    bodyBn: '',
    tone: 'info',
    linkUrl: '',
    linkLabelEn: '',
    linkLabelBn: '',
    isActive: true,
    isDismissible: true,
    startsAt: localInputValue(new Date().toISOString()),
    endsAt: '',
  };
}

function draftFromNotice(notice: AdminNotice): AdminNoticeDraft {
  return {
    id: notice.id,
    titleEn: notice.titleEn,
    titleBn: notice.titleBn,
    bodyEn: notice.bodyEn,
    bodyBn: notice.bodyBn,
    tone: notice.tone,
    linkUrl: notice.linkUrl ?? '',
    linkLabelEn: notice.linkLabelEn ?? '',
    linkLabelBn: notice.linkLabelBn ?? '',
    isActive: notice.isActive,
    isDismissible: notice.isDismissible,
    startsAt: localInputValue(notice.startsAt),
    endsAt: localInputValue(notice.endsAt),
  };
}

type NoticeStatus = 'live' | 'scheduled' | 'expired' | 'draft';

function noticeStatus(notice: AdminNotice, now = Date.now()): NoticeStatus {
  if (!notice.isActive) return 'draft';
  const starts = new Date(notice.startsAt).getTime();
  const ends = notice.endsAt ? new Date(notice.endsAt).getTime() : null;
  if (Number.isFinite(starts) && starts > now) return 'scheduled';
  if (ends !== null && Number.isFinite(ends) && ends <= now) return 'expired';
  return 'live';
}

function statusMeta(status: NoticeStatus, t: (key: string) => string) {
  if (status === 'live') return { label: t('admin.notices.live'), tone: 'live' as const };
  if (status === 'scheduled') return { label: t('admin.notices.scheduled'), tone: 'gold' as const };
  if (status === 'expired') return { label: t('admin.notices.expired'), tone: 'danger' as const };
  return { label: t('admin.notices.draft'), tone: 'neutral' as const };
}

function AdminTextarea({
  label,
  hint,
  value,
  onChange,
  maxLength,
  rows = 4,
  language,
  error,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  rows?: number;
  language?: string;
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
        {maxLength && (
          <span className="text-[10px] font-semibold tabular-nums text-ink-faint">
            {formatCount(value.length, language ?? 'en')} / {formatCount(maxLength, language ?? 'en')}
          </span>
        )}
      </div>
      <textarea
        id={id}
        rows={rows}
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

function NoticePreview({
  draft,
  language,
}: {
  draft: AdminNoticeDraft;
  language: string;
}) {
  const { t } = useTranslation();
  const tone = toneStyles[draft.tone] ?? toneStyles.info;
  const Icon = tone.Icon;
  const title = language === 'bn' ? draft.titleBn || draft.titleEn : draft.titleEn || draft.titleBn;
  const body = language === 'bn' ? draft.bodyBn || draft.bodyEn : draft.bodyEn || draft.bodyBn;
  const linkLabel =
    language === 'bn' ? draft.linkLabelBn || draft.linkLabelEn : draft.linkLabelEn || draft.linkLabelBn;

  if (!title && !body) {
    return (
      <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-ink/15 bg-paper-light/30 px-4 text-center text-[12px] text-ink-soft">
        {t('admin.notices.noPreview')}
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-xl border p-3.5', tone.shell)}>
      <div className="flex items-start gap-3">
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink/10', tone.icon)} aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={cn('text-[9px] font-bold uppercase tracking-[0.14em]', tone.accent)}>
              {t('notice.label')}
            </span>
            <p className="font-display text-sm font-bold text-ink">{title || t('admin.notices.previewTitleFallback')}</p>
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">
            {body || t('admin.notices.noPreview')}
          </p>
          {draft.linkUrl && (
            <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-teal">
              <Link2 className="h-3 w-3" aria-hidden />
              {linkLabel || t('notice.learnMore')}
            </span>
          )}
        </div>
        {draft.isDismissible && <X className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />}
      </div>
    </div>
  );
}

export function AdminNotices() {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  const [notices, setNotices] = useState<AdminNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<AdminNoticeDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminNotice | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await adminListNotices();
      setNotices(next);
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

  const counts = useMemo(() => {
    const now = Date.now();
    return notices.reduce(
      (result, notice) => {
        const status = noticeStatus(notice, now);
        result[status] += 1;
        return result;
      },
      { live: 0, scheduled: 0, expired: 0, draft: 0 } as Record<NoticeStatus, number>,
    );
  }, [notices]);

  function updateDraft(patch: Partial<AdminNoticeDraft>) {
    setEditor((current) => (current ? { ...current, ...patch } : current));
    setFormError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || saving) return;

    const title = editor.titleEn.trim() || editor.titleBn.trim();
    const body = editor.bodyEn.trim() || editor.bodyBn.trim();
    if (!title || !body) {
      setFormError(t('admin.notices.validation'));
      return;
    }
    if (editor.linkUrl.trim() && !/^https?:\/\/\S+$/i.test(editor.linkUrl.trim())) {
      setFormError(t('admin.notices.validation'));
      return;
    }

    const startsAt = inputToIso(editor.startsAt) ?? new Date().toISOString();
    const endsAt = inputToIso(editor.endsAt);
    if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setFormError(t('admin.notices.validation'));
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await adminSaveNotice({
        id: editor.id,
        titleEn: editor.titleEn,
        titleBn: editor.titleBn,
        bodyEn: editor.bodyEn,
        bodyBn: editor.bodyBn,
        tone: editor.tone,
        linkUrl: editor.linkUrl,
        linkLabelEn: editor.linkLabelEn,
        linkLabelBn: editor.linkLabelBn,
        isActive: editor.isActive,
        isDismissible: editor.isDismissible,
        startsAt,
        endsAt,
      });
      toast(t('admin.notices.saved'), 'success');
      setEditor(null);
      await load();
      refreshPublicSite();
    } catch (cause) {
      const code = normalizeApiError(cause).code;
      setFormError(code === 'INVALID_NOTICE' ? t('errors.INVALID_NOTICE') : t('admin.shell.error'));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(notice: AdminNotice) {
    setBusyId(notice.id);
    try {
      await adminToggleNotice(notice.id, !notice.isActive);
      setNotices((current) =>
        current.map((item) =>
          item.id === notice.id ? { ...item, isActive: !item.isActive, isLive: !item.isActive } : item,
        ),
      );
      toast(t(notice.isActive ? 'admin.notices.toggleOff' : 'admin.notices.toggleOn'), 'success');
      refreshPublicSite();
    } catch (cause) {
      const code = normalizeApiError(cause).code;
      toast(code === 'NOT_ADMIN' ? t('admin.gate.forbiddenTitle') : t('admin.shell.error'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await adminDeleteNotice(deleteTarget.id);
      toast(t('admin.notices.deleted'), 'success');
      setDeleteTarget(null);
      await load();
      refreshPublicSite();
    } catch (cause) {
      const code = normalizeApiError(cause).code;
      toast(code === 'NOTICE_NOT_FOUND' ? t('errors.NOTICE_NOT_FOUND') : t('admin.shell.error'), 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminCard>
        <AdminSectionHeading
          kicker={t('admin.notices.title')}
          title={t('admin.notices.title')}
          subtitle={t('admin.notices.subtitle')}
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setFormError(null);
                setEditor(emptyDraft());
              }}
              leftIcon={<Plus className="h-4 w-4" aria-hidden />}
            >
              {t('admin.notices.new')}
            </Button>
          }
        />

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ['live', counts.live, 'text-teal'],
            ['scheduled', counts.scheduled, 'text-mustard-ink'],
            ['expired', counts.expired, 'text-terracotta'],
            ['draft', counts.draft, 'text-ink-soft'],
          ] as Array<[NoticeStatus, number, string]>).map(([status, count, tone]) => (
            <div key={status} className="rounded-xl border border-ink/[0.08] bg-paper-light/45 px-3 py-2.5">
              <p className={cn('text-[9px] font-bold uppercase tracking-[0.14em]', tone)}>
                {statusMeta(status, t).label}
              </p>
              <p className="mt-1 font-display text-xl font-bold text-ink">
                {formatCount(count, i18n.language)}
              </p>
            </div>
          ))}
        </div>
      </AdminCard>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <AdminSkeleton key={index} className="h-40" />
          ))}
        </div>
      ) : error ? (
        <AdminCard>
          <AdminEmptyState
            icon={<RefreshCw className="h-5 w-5" aria-hidden />}
            title={t('admin.shell.error')}
            body={error}
            action={
              <Button variant="primary" onClick={() => void load()} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}>
                {t('admin.shell.retry')}
              </Button>
            }
          />
        </AdminCard>
      ) : notices.length === 0 ? (
        <AdminCard>
          <AdminEmptyState
            icon={<Megaphone className="h-5 w-5" aria-hidden />}
            title={t('admin.notices.emptyTitle')}
            body={t('admin.notices.emptyBody')}
            action={
              <Button
                variant="primary"
                onClick={() => setEditor(emptyDraft())}
                leftIcon={<Plus className="h-4 w-4" aria-hidden />}
              >
                {t('admin.notices.new')}
              </Button>
            }
          />
        </AdminCard>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <AnimatePresence initial={false}>
            {notices.map((notice, index) => {
              const status = noticeStatus(notice);
              const meta = statusMeta(status, t);
              const tone = toneStyles[notice.tone] ?? toneStyles.info;
              const Icon = tone.Icon;
              const title = i18n.language === 'bn' ? notice.titleBn || notice.titleEn : notice.titleEn || notice.titleBn;
              const body = i18n.language === 'bn' ? notice.bodyBn || notice.bodyEn : notice.bodyEn || notice.bodyBn;
              return (
                <motion.div
                  key={notice.id}
                  layout
                  initial={{ opacity: 0, y: reduce ? 0 : 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : index * 0.03 }}
                >
                  <AdminCard className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', tone.icon)}>
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <AdminBadge tone={meta.tone}>{meta.label}</AdminBadge>
                            <AdminBadge tone="neutral">{t(tone.labelKey)}</AdminBadge>
                          </div>
                          <h3 className="mt-1.5 font-display text-base font-bold leading-snug text-ink">{title}</h3>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          onClick={() => void toggle(notice)}
                          disabled={busyId === notice.id}
                          aria-label={t(notice.isActive ? 'admin.notices.toggleOff' : 'admin.notices.toggleOn')}
                          title={t(notice.isActive ? 'admin.notices.toggleOff' : 'admin.notices.toggleOn')}
                          className="grid h-8 w-8 place-items-center rounded-full text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-40"
                        >
                          {notice.isActive ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFormError(null);
                            setEditor(draftFromNotice(notice));
                          }}
                          aria-label={t('admin.notices.edit')}
                          title={t('admin.notices.edit')}
                          className="grid h-8 w-8 place-items-center rounded-full text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink"
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(notice)}
                          aria-label={t('admin.notices.delete')}
                          title={t('admin.notices.delete')}
                          className="grid h-8 w-8 place-items-center rounded-full text-ink-faint transition-colors hover:bg-terracotta/[0.08] hover:text-terracotta"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>

                    <p className="mt-2.5 line-clamp-3 text-[12.5px] leading-relaxed text-ink-soft">{body}</p>

                    <div className="mt-auto pt-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink/[0.08] pt-2.5 text-[10px] font-semibold text-ink-faint">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3" aria-hidden />
                          {notice.endsAt
                            ? t('admin.notices.schedule', {
                                start: formatDateTime(notice.startsAt, i18n.language),
                                end: formatDateTime(notice.endsAt, i18n.language),
                              })
                            : t('admin.notices.noEnd', {
                                start: formatDateTime(notice.startsAt, i18n.language),
                              })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {notice.isDismissible ? <X className="h-3 w-3" aria-hidden /> : <Megaphone className="h-3 w-3" aria-hidden />}
                          {notice.isDismissible ? t('admin.notices.dismissible') : t('admin.notices.sticky')}
                        </span>
                      </div>
                      {notice.linkUrl && (
                        <p className="mt-1.5 flex items-start gap-1 break-all text-[10px] font-bold text-teal">
                          <Link2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          {notice.linkUrl}
                        </p>
                      )}
                    </div>
                  </AdminCard>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <Modal
        open={Boolean(editor)}
        onClose={() => {
          if (!saving) setEditor(null);
        }}
        title={editor?.id ? t('admin.notices.editTitle') : t('admin.notices.createTitle')}
        description={t('admin.notices.createSub')}
        size="xl"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setEditor(null)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="admin-notice-form" loading={saving}>
              {saving ? t('admin.notices.saving') : t('admin.notices.save')}
            </Button>
          </div>
        }
      >
        {editor && (
          <form id="admin-notice-form" className="space-y-4" onSubmit={save}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('admin.notices.titleEn')}
                value={editor.titleEn}
                onChange={(event) => updateDraft({ titleEn: event.target.value })}
                maxLength={120}
              />
              <Field
                label={t('admin.notices.titleBn')}
                value={editor.titleBn}
                onChange={(event) => updateDraft({ titleBn: event.target.value })}
                maxLength={120}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <AdminTextarea
                label={t('admin.notices.bodyEn')}
                value={editor.bodyEn}
                onChange={(value) => updateDraft({ bodyEn: value })}
                maxLength={800}
                rows={4}
                language={i18n.language}
              />
              <AdminTextarea
                label={t('admin.notices.bodyBn')}
                value={editor.bodyBn}
                onChange={(value) => updateDraft({ bodyBn: value })}
                maxLength={800}
                rows={4}
                language={i18n.language}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 block text-sm font-semibold text-ink">{t('admin.notices.tone')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {toneOrder.map((toneKey) => {
                    const tone = toneStyles[toneKey];
                    const ToneIcon = tone.Icon;
                    return (
                      <button
                        key={toneKey}
                        type="button"
                        onClick={() => updateDraft({ tone: toneKey })}
                        aria-pressed={editor.tone === toneKey}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors',
                          editor.tone === toneKey
                            ? tone.badge
                            : 'border-ink/10 text-ink-soft hover:bg-ink/5 hover:text-ink',
                        )}
                      >
                        <ToneIcon className="h-3.5 w-3.5" aria-hidden />
                        {t(tone.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between gap-2 rounded-xl border border-ink/[0.08] bg-paper-light/45 px-3 py-2.5">
                  <span className="text-[11px] font-semibold text-ink-soft">{t('admin.notices.active')}</span>
                  <AdminToggle
                    checked={editor.isActive}
                    onChange={(next) => updateDraft({ isActive: next })}
                    label={t('admin.notices.active')}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl border border-ink/[0.08] bg-paper-light/45 px-3 py-2.5">
                  <span className="text-[11px] font-semibold text-ink-soft">{t('admin.notices.dismissible')}</span>
                  <AdminToggle
                    checked={editor.isDismissible}
                    onChange={(next) => updateDraft({ isDismissible: next })}
                    label={t('admin.notices.dismissible')}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('admin.notices.linkUrl')}
                type="url"
                value={editor.linkUrl}
                onChange={(event) => updateDraft({ linkUrl: event.target.value })}
                placeholder="https://"
                hint={t('admin.notices.linkUrlHint')}
                leading={<Link2 className="h-4 w-4" aria-hidden />}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label={t('admin.notices.linkLabelEn')}
                  value={editor.linkLabelEn}
                  onChange={(event) => updateDraft({ linkLabelEn: event.target.value })}
                  maxLength={60}
                />
                <Field
                  label={t('admin.notices.linkLabelBn')}
                  value={editor.linkLabelBn}
                  onChange={(event) => updateDraft({ linkLabelBn: event.target.value })}
                  maxLength={60}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('admin.notices.startsAt')}
                type="datetime-local"
                value={editor.startsAt}
                onChange={(event) => updateDraft({ startsAt: event.target.value })}
              />
              <Field
                label={t('admin.notices.endsAt')}
                type="datetime-local"
                value={editor.endsAt}
                onChange={(event) => updateDraft({ endsAt: event.target.value })}
                hint={t('admin.notices.endsAtHint')}
              />
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                {t('admin.notices.preview')}
              </p>
              <NoticePreview draft={editor} language={i18n.language} />
            </div>

            {formError && (
              <p role="alert" className="rounded-xl border border-terracotta/20 bg-terracotta/[0.08] px-3 py-2.5 text-[12px] font-medium text-terracotta">
                {formError}
              </p>
            )}
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={t('admin.notices.deleteTitle')}
        description={t('admin.notices.deleteBody')}
        confirmLabel={t('admin.notices.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void remove()}
        loading={deleting}
      />
    </div>
  );
}
