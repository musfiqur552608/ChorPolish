import type { TFunction } from 'i18next';

const KNOWN_CODES = new Set([
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'GAME_STARTED',
  'GAME_FINISHED',
  'ALREADY_IN_ROOM',
  'NOT_MEMBER',
  'NOT_HOST',
  'NOT_READY',
  'PLAYERS_NOT_READY',
  'PLAYERS_OFFLINE',
  'NOT_ENOUGH_PLAYERS',
  'INVALID_ROUNDS',
  'INVALID_ROOM_CODE',
  'INVALID_NAME',
  'NOT_YOUR_TURN',
  'WRONG_PHASE',
  'PICKED_ALREADY',
  'SLOT_TAKEN',
  'ONLY_POLICE',
  'ONLY_BABU',
  'INVALID_GUESS',
  'GUESS_LOCKED',
  'HOST_LEAVE_LOBBY',
  'ROOM_PAUSED',
  'GRACE_EXPIRED',
  'REACTION_THROTTLED',
  'SERVER_OUTDATED',
  'NETWORK',
  'UNAUTHENTICATED',
  'UNKNOWN',
]);

export interface NormalizedError {
  code: string;
  rawMessage: string;
}

function extractMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

export function normalizeApiError(error: unknown): NormalizedError {
  const rawMessage = extractMessage(error);
  const upper = rawMessage.toUpperCase();
  const match = KNOWN_CODES.has(upper)
    ? upper
    : [...KNOWN_CODES].find((code) => upper.includes(code));
  if (match) return { code: match, rawMessage };

  if (/failed to fetch|networkerror|load failed|network request failed|fetch/i.test(rawMessage)) {
    return { code: 'NETWORK', rawMessage };
  }
  if (/could not find the function|schema cache|pgrst202/i.test(rawMessage)) {
    return { code: 'SERVER_OUTDATED', rawMessage };
  }
  if (/jwt|session|auth/i.test(rawMessage)) {
    return { code: 'UNAUTHENTICATED', rawMessage };
  }
  return { code: 'UNKNOWN', rawMessage };
}

export function userErrorMessage(error: unknown, t: TFunction): string {
  const { code, rawMessage } = normalizeApiError(error);
  const key = `errors.${code}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return rawMessage || t('errors.UNKNOWN');
}
