import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en';
import bn from '@/i18n/locales/bn';

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenKeys(item, `${prefix}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      flattenKeys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

function valueAt(root: unknown, key: string): unknown {
  const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function placeholders(value: string): string[] {
  return Array.from(
    value.matchAll(/{{\s*([^},\s]+)[^}]*}}/g),
    (match) => match[1] ?? '',
  ).sort();
}

describe('translations', () => {
  it('have exactly the same keys in English and Bengali', () => {
    expect(flattenKeys(bn).sort()).toEqual(flattenKeys(en).sort());
  });

  it('use the same interpolation placeholders', () => {
    for (const key of flattenKeys(en)) {
      const english = valueAt(en, key);
      const bengali = valueAt(bn, key);
      if (typeof english === 'string' && typeof bengali === 'string') {
        expect(placeholders(bengali), key).toEqual(placeholders(english));
      }
    }
  });

  it('does not contain blank strings', () => {
    for (const locale of [en, bn]) {
      for (const key of flattenKeys(locale)) {
        const value = valueAt(locale, key);
        if (typeof value === 'string') {
          expect(value.trim().length, key).toBeGreaterThan(0);
        }
      }
    }
  });
});
