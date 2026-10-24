import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { normalizeApiError, userErrorMessage } from '@/lib/errors';

describe('normalizeApiError', () => {
  it('matches exact server codes', () => {
    expect(normalizeApiError(new Error('PLAYERS_NOT_READY')).code).toBe('PLAYERS_NOT_READY');
    expect(normalizeApiError(new Error('ROOM_FULL')).code).toBe('ROOM_FULL');
  });

  it('prefers the longest embedded code', () => {
    expect(normalizeApiError(new Error('error: PLAYERS_NOT_READY (3/4)')).code).toBe('PLAYERS_NOT_READY');
    expect(normalizeApiError(new Error('PLAYERS_OFFLINE')).code).toBe('PLAYERS_OFFLINE');
    expect(normalizeApiError(new Error('NOT_READY')).code).toBe('NOT_READY');
  });

  it('maps transport and schema failures', () => {
    expect(normalizeApiError(new Error('Failed to fetch')).code).toBe('NETWORK');
    expect(normalizeApiError(new Error('Could not find the function public.babu_rise')).code).toBe(
      'SERVER_OUTDATED',
    );
    expect(normalizeApiError(new Error('JWT expired')).code).toBe('UNAUTHENTICATED');
  });

  it('understands strings, objects, and empty input', () => {
    expect(normalizeApiError('SLOT_TAKEN').code).toBe('SLOT_TAKEN');
    expect(normalizeApiError({ message: 'WRONG_PHASE' }).code).toBe('WRONG_PHASE');
    expect(normalizeApiError(null).code).toBe('UNKNOWN');
    expect(normalizeApiError(undefined).code).toBe('UNKNOWN');
    expect(normalizeApiError(42).code).toBe('UNKNOWN');
  });

  it('knows the collision and round codes the SQL can raise', () => {
    expect(normalizeApiError(new Error('ROOM_CODE_COLLISION')).code).toBe('ROOM_CODE_COLLISION');
    expect(normalizeApiError(new Error('ROUND_NOT_FOUND')).code).toBe('ROUND_NOT_FOUND');
  });
});

describe('userErrorMessage', () => {
  const t = ((key: string) => {
    if (key === 'errors.ROOM_FULL') return 'The room is full.';
    if (key === 'errors.UNKNOWN') return 'Unknown error.';
    return key;
  }) as unknown as TFunction;

  it('uses a translated message when one exists', () => {
    expect(userErrorMessage(new Error('ROOM_FULL'), t)).toBe('The room is full.');
  });

  it('falls back to the generic UNKNOWN message for unrecognized errors', () => {
    expect(userErrorMessage(new Error('something unexpected'), t)).toBe('Unknown error.');
    expect(userErrorMessage(null, t)).toBe('Unknown error.');
  });
});
