import type { TFunction } from 'i18next';
import { localizeNumber } from '@/lib/numbers';

export function formatCount(value: number, language: string): string {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  return localizeNumber(new Intl.NumberFormat('en-US').format(rounded), language);
}

export function formatPercent(value: number, language: string): string {
  const rounded = Math.round(Number.isFinite(value) ? Math.abs(value) : 0);
  return `${localizeNumber(String(rounded), language)}%`;
}

export function formatDuration(
  seconds: number,
  t: TFunction,
  language: string,
): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return t('admin.units.lessThanMinute');

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours > 0) {
    const hourText = t('admin.units.hours', { value: formatCount(hours, language) });
    if (minutes === 0) return hourText;
    return `${hourText} ${t('admin.units.minutes', { value: formatCount(minutes, language) })}`;
  }

  return t('admin.units.minutes', { value: formatCount(minutes, language) });
}

export function formatDateTime(
  iso: string | null | undefined,
  language: string,
  timezone?: string,
): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function formatShortDate(
  iso: string | null | undefined,
  language: string,
): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function localDay(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

export function formatDayLabel(value: string, language: string): string {
  const date = localDay(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch {
    return value;
  }
}

export function formatMonthLabel(value: string, language: string): string {
  const date = new Date(`${value}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
      month: 'short',
    }).format(date);
  } catch {
    return value;
  }
}

export function localInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function inputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
