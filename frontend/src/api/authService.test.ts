import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';
import { extractLoginLockout, logout } from './authService';

describe('extractLoginLockout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

  it('sends the explicit inactivity reason through the secure logout endpoint', async () => {
    localStorage.setItem('refreshToken', 'refresh-token');
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { data: 'Logged out successfully' } });

    await logout('INACTIVITY');

    expect(post).toHaveBeenCalledWith('/auth/logout', {
      refreshToken: 'refresh-token',
      reason: 'INACTIVITY',
    });
  });

  it('ends and clears active oversight before explicit actor logout', async () => {
    localStorage.setItem('refreshToken', 'refresh-token');
    localStorage.setItem('oversightSessionId', '33333333-3333-4333-8333-333333333333');
    localStorage.setItem('oversightTargetUser', JSON.stringify({ id: 'target-user' }));
    const post = vi.spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: { data: 'Oversight session stopped' } })
      .mockResolvedValueOnce({ data: { data: 'Logged out successfully' } });

    await logout();

    expect(post).toHaveBeenNthCalledWith(1, '/admin/oversight/stop', {
      sessionId: '33333333-3333-4333-8333-333333333333',
    });
    expect(post).toHaveBeenNthCalledWith(2, '/auth/logout', {
      refreshToken: 'refresh-token',
      reason: 'MANUAL',
    });
    expect(localStorage.getItem('oversightSessionId')).toBeNull();
    expect(localStorage.getItem('oversightTargetUser')).toBeNull();
  });
});
