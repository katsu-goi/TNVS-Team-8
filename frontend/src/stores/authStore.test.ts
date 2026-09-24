import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    });
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
});
