import { describe, expect, it } from 'vitest';
import { localizeNumber, ordinalPlace } from '@/lib/numbers';

describe('localizeNumber', () => {
  it('leaves English digits alone', () => {
    expect(localizeNumber(123, 'en')).toBe('123');
    expect(localizeNumber('Room 42', 'en')).toBe('Room 42');
  });

  it('converts every digit for Bengali', () => {
    expect(localizeNumber(123, 'bn')).toBe('১২৩');
    expect(localizeNumber(0, 'bn')).toBe('০');
    expect(localizeNumber('Room 42', 'bn')).toBe('Room ৪২');
    expect(localizeNumber(-42, 'bn')).toBe('-৪২');
  });
});

describe('ordinalPlace', () => {
  it('uses Bengali ordinal words for the four seats', () => {
    expect(ordinalPlace(1, 'bn')).toBe('প্রথম');
    expect(ordinalPlace(4, 'bn')).toBe('চতুর্থ');
    expect(ordinalPlace(5, 'bn')).toBe('৫তম');
  });

  it('uses correct English suffixes', () => {
    expect(ordinalPlace(1, 'en')).toBe('1st');
    expect(ordinalPlace(2, 'en')).toBe('2nd');
    expect(ordinalPlace(3, 'en')).toBe('3rd');
    expect(ordinalPlace(4, 'en')).toBe('4th');
    expect(ordinalPlace(5, 'en')).toBe('5th');
    expect(ordinalPlace(11, 'en')).toBe('11th');
    expect(ordinalPlace(12, 'en')).toBe('12th');
    expect(ordinalPlace(13, 'en')).toBe('13th');
    expect(ordinalPlace(21, 'en')).toBe('21st');
    expect(ordinalPlace(22, 'en')).toBe('22nd');
    expect(ordinalPlace(23, 'en')).toBe('23rd');
    expect(ordinalPlace(101, 'en')).toBe('101st');
    expect(ordinalPlace(111, 'en')).toBe('111th');
  });
});
