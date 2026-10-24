import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequestId } from '@/lib/requestId';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createRequestId', () => {
  it('returns an RFC 4122 v4 UUID', () => {
    expect(createRequestId()).toMatch(UUID_V4);
  });

  it('is unique across many calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createRequestId()));
    expect(ids.size).toBe(200);
  });

  it('falls back when Web Crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    const id = createRequestId();
    expect(id).toMatch(/^req-\d+-[a-z0-9]+$/);
  });
});
