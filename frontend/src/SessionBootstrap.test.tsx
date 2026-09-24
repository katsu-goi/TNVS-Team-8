import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock('./api/authService', () => ({ getCurrentUser }));
vi.mock('./lib/supabase', () => ({ setSupabaseRealtimeAuth: vi.fn() }));

import { SessionBootstrap } from './App';
import { useAuthStore } from './stores/authStore';

describe('SessionBootstrap', () => {
  it('does not render protected children before server verification completes', async () => {
    let resolveProfile: (value: unknown) => void = () => undefined;
    getCurrentUser.mockReturnValueOnce(new Promise((resolve) => { resolveProfile = resolve; }));
    useAuthStore.setState({ user: null, accessToken: 'token', refreshToken: 'refresh', sessionStatus: 'loading' });

    render(<SessionBootstrap><div>Protected portal</div></SessionBootstrap>);
    expect(screen.getByText('Verifying your session...')).toBeInTheDocument();
    expect(screen.queryByText('Protected portal')).not.toBeInTheDocument();

    resolveProfile({ id: 'user-2', email: 'employee@example.com', assignedRoles: ['EMPLOYEE'], roles: ['EMPLOYEE'], permissions: [] });
    await waitFor(() => expect(screen.getByText('Protected portal')).toBeInTheDocument());
  });
});
