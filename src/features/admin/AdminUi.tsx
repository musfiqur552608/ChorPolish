import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { formatCount, formatPercent } from './adminFormat';

export function AdminCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('premium-glass rounded-[18px] border border-ink/10 p-4 shadow-paper sm:p-5', className)}>
      {children}
    </div>
  );
}

export function AdminSectionHeading({
  kicker,
  title,
  subtitle,
  action,
  className,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {kicker && (
          <p className="font-hand text-lg font-bold leading-none text-terracotta">{kicker}</p>
        )}
        <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-ink sm:text-[28px]">
          {title}
        </h2>
        {subtitle && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const displayRef = useRef(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduce) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(displayRef.current, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (next) => {
        displayRef.current = next;
        setDisplay(next);
      },
    });
    return () => controls.stop();
  }, [reduce, value]);

  return <span className={className}>{format ? format(display) : String(Math.round(display))}</span>;
}

export function ChangePill({
  value,
  compact = false,
  className,
}: {
  value: number;
  compact?: boolean;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const positive = value > 0;
  const negative = value < 0;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;
  const percent = formatPercent(value, i18n.language);
  const label = positive
    ? t('admin.periods.up', { value: percent })
    : negative
      ? t('admin.periods.down', { value: percent })
      : t('admin.periods.same');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold tabular-nums',
        positive
          ? 'border-leaf/25 bg-leaf/10 text-leaf'
          : negative
            ? 'border-terracotta/25 bg-terracotta/10 text-terracotta'
            : 'border-ink/10 bg-ink/[0.04] text-ink-soft',
        compact && 'px-1.5 py-0.5 text-[10px]',
        className,
      )}
      title={label}
      aria-label={label}
    >
      <Icon className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} aria-hidden />
      {percent}
    </span>
  );
}

export function AdminToggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors disabled:opacity-50',
        checked ? 'border-teal bg-teal' : 'border-ink/15 bg-paper-deep/60',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        className={cn(
          'grid h-5 w-5 place-items-center rounded-full bg-paper-light shadow-sm',
          checked ? 'ml-5' : 'ml-0.5',
        )}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            checked ? 'bg-teal' : 'bg-ink/25',
          )}
          aria-hidden
        />
      </motion.span>
    </button>
  );
}

export function AdminBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'live' | 'gold' | 'danger' | 'success';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]',
        tone === 'live'
          ? 'border-teal/30 bg-teal/10 text-teal'
          : tone === 'gold'
            ? 'border-mustard/35 bg-mustard/15 text-mustard-ink'
            : tone === 'danger'
              ? 'border-terracotta/30 bg-terracotta/10 text-terracotta'
              : tone === 'success'
                ? 'border-leaf/30 bg-leaf/10 text-leaf'
                : 'border-ink/10 bg-ink/[0.04] text-ink-soft',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative flex h-2.5 w-2.5', className)} aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal/55" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal" />
    </span>
  );
}

export function AdminEmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink/15 bg-paper-light/35 px-5 py-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ink/[0.05] text-ink-soft">{icon}</div>
      <h3 className="mt-3 font-display text-lg font-bold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-soft">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function AdminSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl bg-gradient-to-r from-ink/[0.06] via-ink/[0.1] to-ink/[0.06]',
        className,
      )}
      aria-hidden
    />
  );
}

export function formatAdminCount(value: number, language: string): string {
  return formatCount(value, language);
}
