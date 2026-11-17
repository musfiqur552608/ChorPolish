import { useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { localizeNumber } from '@/lib/numbers';
import type { AdminDailyPoint, AdminMonthlyPoint } from '@/types/admin';
import {
  formatCount,
  formatDayLabel,
  formatMonthLabel,
} from './adminFormat';

export type ChartMetric = 'players' | 'playerSeconds' | 'matches';

function pointValue(point: AdminDailyPoint | AdminMonthlyPoint, metric: ChartMetric): number {
  if (metric === 'playerSeconds') return point.playerSeconds / 3600;
  return point[metric];
}

function metricLabel(metric: ChartMetric, t: TFunction): string {
  if (metric === 'players') return t('admin.chart.players');
  if (metric === 'matches') return t('admin.chart.matches');
  return t('admin.chart.hours');
}

function axisLabel(value: number, metric: ChartMetric, language: string, t: TFunction): string {
  if (metric === 'playerSeconds') {
    if (value <= 0) return formatCount(0, language);
    const display =
      value >= 10
        ? formatCount(value, language)
        : localizeNumber(value.toFixed(1), language);
    return t('admin.units.hours', { value: display });
  }
  return formatCount(value, language);
}

export function TrendChart({
  points,
  metric,
  language,
}: {
  points: AdminDailyPoint[];
  metric: ChartMetric;
  language: string;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const gradientId = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);

  const chart = useMemo(() => {
    const width = 760;
    const height = 280;
    const pad = { top: 22, right: 18, bottom: 34, left: 44 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const values = points.map((point) => pointValue(point, metric));
    const maxValue = Math.max(1, ...values);
    const x = (index: number) =>
      pad.left + (points.length <= 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
    const y = (value: number) => pad.top + (1 - value / maxValue) * innerH;
    const line = values
      .map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(value).toFixed(2)}`)
      .join(' ');
    const area = `${line} L ${x(points.length - 1).toFixed(2)} ${pad.top + innerH} L ${x(0).toFixed(2)} ${pad.top + innerH} Z`;
    const total = values.reduce((sum, value) => sum + value, 0);
    const peak = Math.max(0, ...values);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      y: pad.top + (1 - ratio) * innerH,
      value: maxValue * ratio,
    }));
    const labelIndexes = Array.from(
      new Set([0, Math.round((points.length - 1) * 0.25), Math.round((points.length - 1) * 0.5), Math.round((points.length - 1) * 0.75), points.length - 1]),
    ).filter((index) => index >= 0 && index < points.length);
    return {
      width,
      height,
      pad,
      innerH,
      x,
      y,
      values,
      line,
      area,
      maxValue,
      total,
      peak,
      ticks,
      labelIndexes,
    };
  }, [metric, points]);

  const summary = t('admin.chart.summary', {
    total:
      metric === 'playerSeconds'
        ? t('admin.units.hours', { value: formatCount(chart.total, language) })
        : formatCount(chart.total, language),
    peak:
      metric === 'playerSeconds'
        ? t('admin.units.hours', { value: formatCount(chart.peak, language) })
        : formatCount(chart.peak, language),
  });

  if (points.length === 0) {
    return (
      <div className="grid h-64 place-items-center rounded-xl border border-dashed border-ink/15 bg-paper-light/30 text-center text-[13px] text-ink-soft">
        {t('admin.chart.empty')}
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={t('admin.chart.aria', {
          metric: metricLabel(metric, t),
          range: t('admin.chart.last30'),
          summary,
        })}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`area-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(51 121 111)" stopOpacity="0.34" />
            <stop offset="70%" stopColor="rgb(51 121 111)" stopOpacity="0.07" />
            <stop offset="100%" stopColor="rgb(51 121 111)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`line-${gradientId}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(51 121 111)" />
            <stop offset="60%" stopColor="rgb(223 169 63)" />
            <stop offset="100%" stopColor="rgb(184 75 61)" />
          </linearGradient>
        </defs>

        {chart.ticks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={chart.pad.left}
              x2={chart.width - chart.pad.right}
              y1={tick.y}
              y2={tick.y}
              stroke="currentColor"
              strokeOpacity="0.1"
              strokeDasharray="3 6"
            />
            <text
              x={chart.pad.left - 8}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-ink-faint text-[10px]"
            >
              {axisLabel(tick.value, metric, language, t)}
            </text>
          </g>
        ))}

        {chart.labelIndexes.map((index) => (
          <text
            key={index}
            x={chart.x(index)}
            y={chart.height - 10}
            textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            className="fill-ink-faint text-[10px]"
          >
            {formatDayLabel(points[index]?.date ?? '', language)}
          </text>
        ))}

        <motion.path
          d={chart.area}
          fill={`url(#area-${gradientId})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.7 }}
        />
        <motion.path
          d={chart.line}
          fill="none"
          stroke={`url(#line-${gradientId})`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: reduce ? 1 : 0, opacity: reduce ? 1 : 0.4 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: reduce ? 0 : 1.05, ease: [0.22, 1, 0.36, 1] }}
        />

        {points.map((point, index) => {
          const value = chart.values[index] ?? 0;
          const active = hover === index;
          return (
            <g key={`${point.date}-${index}`}>
              <rect
                x={chart.x(index) - 8}
                y={chart.pad.top}
                width="16"
                height={chart.innerH}
                fill="transparent"
                onMouseEnter={() => setHover(index)}
              />
              {(active || index === points.length - 1) && (
                <motion.circle
                  cx={chart.x(index)}
                  cy={chart.y(value)}
                  r={active ? 5.5 : 4}
                  fill="rgb(255 253 246)"
                  stroke="rgb(51 121 111)"
                  strokeWidth="2.5"
                  initial={false}
                  animate={{ r: active ? 5.5 : 4 }}
                />
              )}
            </g>
          );
        })}

        {hover !== null && points[hover] && (
          <g transform={`translate(${Math.min(chart.width - 150, Math.max(chart.pad.left, chart.x(hover) - 70))}, ${Math.max(4, chart.y(chart.values[hover] ?? 0) - 62)})`}>
            <rect width="140" height="48" rx="9" fill="rgb(32 51 70)" opacity="0.94" />
            <text x="10" y="17" className="fill-white/65 text-[9px]">
              {formatDayLabel(points[hover].date, language)}
            </text>
            <text x="10" y="36" className="fill-white text-[12px] font-bold">
              {axisLabel(chart.values[hover] ?? 0, metric, language, t)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function MonthlyBars({
  points,
  metric,
  language,
}: {
  points: AdminMonthlyPoint[];
  metric: ChartMetric;
  language: string;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const values = points.map((point) => pointValue(point, metric));
  const maxValue = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <p className="font-hand text-lg font-bold leading-none text-terracotta">
            {t('admin.chart.monthlyTitle')}
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">{t('admin.chart.monthlySubtitle')}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
            {t('admin.chart.total')}
          </p>
          <p className="font-display text-xl font-bold text-ink">
            {metric === 'playerSeconds'
              ? t('admin.units.hours', { value: formatCount(total, language) })
              : formatCount(total, language)}
          </p>
        </div>
      </div>

      <div className="flex h-44 items-end gap-1.5 sm:gap-2" aria-hidden>
        {points.map((point, index) => {
          const value = values[index] ?? 0;
          const height = Math.max(3, (value / maxValue) * 100);
          return (
            <div key={point.month} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
              <motion.div
                className={cn(
                  'relative w-full rounded-t-[5px] border border-b-0',
                  index === points.length - 1
                    ? 'border-mustard/40 bg-gradient-to-t from-mustard/60 to-mustard'
                    : 'border-teal/25 bg-gradient-to-t from-teal/30 to-teal/70',
                )}
                initial={{ height: reduce ? `${height}%` : 0 }}
                animate={{ height: `${height}%` }}
                transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : index * 0.035, ease: [0.22, 1, 0.36, 1] }}
                title={`${formatMonthLabel(point.month, language)}: ${axisLabel(value, metric, language, t)}`}
              />
              <span className="mt-1.5 truncate text-center text-[9px] font-semibold text-ink-faint">
                {formatMonthLabel(point.month, language)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="sr-only">
        {t('admin.chart.aria', {
          metric: metricLabel(metric, t),
          range: t('admin.chart.last12'),
          summary: t('admin.chart.summary', {
            total:
              metric === 'playerSeconds'
                ? t('admin.units.hours', { value: formatCount(total, language) })
                : formatCount(total, language),
            peak:
              metric === 'playerSeconds'
                ? t('admin.units.hours', { value: formatCount(Math.max(...values), language) })
                : formatCount(Math.max(...values), language),
          }),
        })}
      </p>
    </div>
  );
}

export function Sparkline({
  values,
  tone = 'teal',
  className,
}: {
  values: number[];
  tone?: 'teal' | 'mustard' | 'terracotta';
  className?: string;
}) {
  const reduce = useReducedMotion();
  const width = 120;
  const height = 38;
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - 3 - (value / max) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color =
    tone === 'mustard' ? 'rgb(223 169 63)' : tone === 'terracotta' ? 'rgb(184 75 61)' : 'rgb(51 121 111)';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('h-9 w-full', className)} aria-hidden>
      <motion.polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: reduce ? 1 : 0, opacity: reduce ? 1 : 0.4 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.9, ease: 'easeOut' }}
      />
    </svg>
  );
}
