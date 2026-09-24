import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock('../api/authService', () => ({ getCurrentUser }));
vi.mock('../lib/supabase', () => ({ setSupabaseRealtimeAuth: vi.fn() }));

import { useAuthStore } from './authStore';

describe('authoritative session bootstrap', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: 'stored-token',
      refreshToken: 'stored-refresh',
      sessionStatus: 'loading',
      sessionError: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not restore user roles from localStorage and accepts the server profile', async () => {
    localStorage.setItem('user', JSON.stringify({ email: 'tampered@example.com', assignedRoles: ['SUPER_ADMIN'] }));
    getCurrentUser.mockResolvedValueOnce({
      id: 'user-1', email: 'officer@example.com', assignedRoles: ['FACILITIES_OFFICER'],
      roles: ['FACILITIES_OFFICER'], permissions: [],
    });

    await useAuthStore.getState().bootstrapSession();

    expect(getCurrentUser).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().user?.assignedRoles).toEqual(['FACILITIES_OFFICER']);
    expect(useAuthStore.getState().sessionStatus).toBe('ready');
  });

  it('keeps authorization unresolved after login tokens arrive until /auth/me succeeds', async () => {
    useAuthStore.getState().setAuthTokens(
      { id: 'unverified', email: 'user@example.com', assignedRoles: ['SUPER_ADMIN'], roles: ['SUPER_ADMIN'], permissions: [] },
      'new-access',
      'new-refresh',
    );
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().sessionStatus).toBe('ready');

    getCurrentUser.mockResolvedValueOnce({
      id: 'verified', email: 'user@example.com', assignedRoles: ['EMPLOYEE'], roles: ['EMPLOYEE'], permissions: [],
    });
    const user = await useAuthStore.getState().verifyLoginSession();

    expect(user?.assignedRoles).toEqual(['EMPLOYEE']);
    expect(useAuthStore.getState().user?.assignedRoles).toEqual(['EMPLOYEE']);
  });

  it('clears newly issued tokens when post-login identity verification fails', async () => {
    useAuthStore.getState().setAuthTokens(
      { id: 'unverified', email: 'user@example.com', assignedRoles: [], roles: [], permissions: [] },
      'new-access',
      'new-refresh',
    );
    getCurrentUser.mockRejectedValueOnce({ response: { status: 401 } });

    await expect(useAuthStore.getState().verifyLoginSession()).rejects.toBeTruthy();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      refreshToken: null,
      sessionStatus: 'ready',
    });
  });

  it('clears expired or invalid sessions instead of exposing a portal', async () => {
    getCurrentUser.mockRejectedValueOnce({ response: { status: 401 } });

    const user = await useAuthStore.getState().bootstrapSession();

    expect(user).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      refreshToken: null,
      sessionStatus: 'ready',
      sessionError: null,
    });
  });

  it('moves unexpected bootstrap failures to a retryable error state', async () => {
    getCurrentUser.mockRejectedValueOnce({ response: { status: 503 } });

    await useAuthStore.getState().bootstrapSession();

    expect(useAuthStore.getState().sessionStatus).toBe('error');
    expect(useAuthStore.getState().sessionError).toMatch(/try again/i);
    expect(useAuthStore.getState().accessToken).toBe('stored-token');
  });

  it('times out stalled session verification instead of loading forever', async () => {
    vi.useFakeTimers();
    getCurrentUser.mockReturnValueOnce(new Promise(() => undefined));

    const bootstrap = useAuthStore.getState().bootstrapSession();
    await vi.advanceTimersByTimeAsync(15_000);
    await bootstrap;

    expect(useAuthStore.getState().sessionStatus).toBe('error');
    expect(useAuthStore.getState().sessionError).toMatch(/try again/i);
  });
});
