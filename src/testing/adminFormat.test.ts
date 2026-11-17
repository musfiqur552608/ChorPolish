import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatDuration,
  formatPercent,
  inputToIso,
  localInputValue,
} from '@/features/admin/adminFormat';

const fakeT = ((key: string, options?: Record<string, unknown>) => {
  switch (key) {
    case 'admin.units.lessThanMinute':
      return '<1m';
    case 'admin.units.hours':
      return `${options?.value ?? ''}h`;
    case 'admin.units.minutes':
      return `${options?.value ?? ''}m`;
    default:
      return key;
  }
}) as unknown as TFunction;

describe('admin formatting', () => {
  it('formats counts with the active locale digits', () => {
    expect(formatCount(1234, 'en')).toBe('1,234');
    expect(formatCount(1234, 'bn')).toBe('১,২৩৪');
    expect(formatCount(Number.NaN, 'en')).toBe('0');
  });

  it('formats comparison percentages without a sign', () => {
    expect(formatPercent(12.4, 'en')).toBe('12%');
    expect(formatPercent(-12.4, 'en')).toBe('12%');
    expect(formatPercent(0, 'bn')).toBe('০%');
  });

  it('formats player-hours into compact units', () => {
    expect(formatDuration(0, fakeT, 'en')).toBe('<1m');
    expect(formatDuration(90, fakeT, 'en')).toBe('1m');
    expect(formatDuration(3600, fakeT, 'en')).toBe('1h');
    expect(formatDuration(3660, fakeT, 'en')).toBe('1h 1m');
    expect(formatDuration(7200, fakeT, 'bn')).toBe('২h');
  });

  it('round-trips notice schedule inputs through ISO', () => {
    const iso = inputToIso('2026-11-17T10:30');
    expect(iso).not.toBeNull();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:30:00\.000Z$/);

    expect(inputToIso('')).toBeNull();
    expect(inputToIso('not-a-date')).toBeNull();
    expect(localInputValue(iso)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(localInputValue(null)).toBe('');
  });
});
