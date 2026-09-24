import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractLoginLockout } from './authService';

describe('extractLoginLockout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('parses server-authoritative lock metadata without exposing account counters', () => {
    vi.setSystemTime(new Date('2026-09-24T08:00:00.000Z'));
    const result = extractLoginLockout({
      response: {
        data: {
          errorCode: 'ACCOUNT_TEMPORARILY_LOCKED',
          message: 'Too many failed login attempts.',
          data: {
            retry_after_seconds: 30,
            locked_until: '2026-09-24T08:00:30.000Z',
          },
        },
        headers: { 'retry-after': '30' },
      },
    });

    expect(result).toEqual({
      retryAfterSeconds: 30,
      lockedUntil: '2026-09-24T08:00:30.000Z',
      retryAt: '2026-09-24T08:00:30.000Z',
    });
  });

  it('does not treat a generic invalid-credential response as a frontend lock', () => {
    expect(extractLoginLockout({
      response: {
        data: { errorCode: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      },
    })).toBeNull();
  });
});
