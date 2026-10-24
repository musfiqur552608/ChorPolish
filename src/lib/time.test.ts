import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clockOffset, formatDate, relativeMinutes, secondsUntil } from '@/lib/time';

const NOW = new Date('2026-10-24T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('secondsUntil', () => {
  it('counts down in whole seconds, rounded up', () => {
    expect(secondsUntil('2026-10-24T12:00:10.000Z')).toBe(10);
    expect(secondsUntil('2026-10-24T12:00:10.400Z')).toBe(11);
  });

  it('never goes negative', () => {
    expect(secondsUntil('2026-10-24T11:59:50.000Z')).toBe(0);
  });

  it('handles missing or malformed timestamps', () => {
    expect(secondsUntil(null)).toBe(0);
    expect(secondsUntil(undefined)).toBe(0);
    expect(secondsUntil('')).toBe(0);
    expect(secondsUntil('not-a-date')).toBe(0);
  });
});

describe('clockOffset', () => {
  it('measures server time against local time', () => {
    expect(clockOffset('2026-10-24T12:00:05.000Z')).toBe(5000);
    expect(clockOffset('2026-10-24T11:59:55.000Z')).toBe(-5000);
  });

  it('returns zero for missing or malformed values', () => {
    expect(clockOffset(null)).toBe(0);
    expect(clockOffset(undefined)).toBe(0);
    expect(clockOffset('nope')).toBe(0);
  });
});

describe('formatDate', () => {
  it('formats English dates', () => {
    const formatted = formatDate('en', new Date('2026-10-24T12:00:00.000Z'));
    expect(formatted).toContain('Oct');
    expect(formatted).toContain('2026');
  });

  it('always returns a non-empty string', () => {
    expect(formatDate('bn', new Date('2026-10-24T12:00:00.000Z')).length).toBeGreaterThan(0);
  });
});

describe('relativeMinutes', () => {
  it('returns a sentinel for missing or malformed values', () => {
    expect(relativeMinutes(null)).toBe(99);
    expect(relativeMinutes('not-a-date')).toBe(99);
  });

  it('rounds down elapsed minutes and clamps the future to zero', () => {
    expect(relativeMinutes(new Date(NOW.getTime() - 90_000).toISOString())).toBe(1);
    expect(relativeMinutes(new Date(NOW.getTime() + 60_000).toISOString())).toBe(0);
    expect(relativeMinutes(NOW.toISOString())).toBe(0);
  });
});
