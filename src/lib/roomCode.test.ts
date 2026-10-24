import { describe, expect, it } from 'vitest';
import {
  isValidRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
  sanitizeRoomCode,
} from '@/lib/roomCode';

describe('room code helpers', () => {
  it('matches the database alphabet and length', () => {
    expect(ROOM_CODE_LENGTH).toBe(6);
    expect(ROOM_CODE_ALPHABET).toHaveLength(31);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01ILO]/);
    expect(ROOM_CODE_PATTERN.source).toContain(ROOM_CODE_ALPHABET);
  });

  it('uppercases and drops characters the server can never generate', () => {
    expect(sanitizeRoomCode('ab-cd 12')).toBe('ABCD2');
    expect(sanitizeRoomCode('O0I1L')).toBe('');
    expect(sanitizeRoomCode('abcd1234')).toBe('ABCD23');
  });

  it('caps input at six characters', () => {
    expect(sanitizeRoomCode('ABCDEFGH')).toBe('ABCDEF');
  });

  it('accepts only canonical six-character codes', () => {
    expect(isValidRoomCode('ABCDEF')).toBe(true);
    expect(isValidRoomCode('234567')).toBe(true);
    expect(isValidRoomCode('abcdef')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
    expect(isValidRoomCode('ABCDEFG')).toBe(false);
    expect(isValidRoomCode('ABCDE0')).toBe(false);
    expect(isValidRoomCode('ABCDEI')).toBe(false);
    expect(isValidRoomCode('ABCDE ')).toBe(false);
  });

  it('leaves an already-valid code untouched', () => {
    const code = 'K7M2QX';
    expect(sanitizeRoomCode(code)).toBe(code);
    expect(isValidRoomCode(code)).toBe(true);
  });
});
