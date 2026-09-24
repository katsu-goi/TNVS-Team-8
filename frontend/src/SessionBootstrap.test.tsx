import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock('./api/authService', () => ({ getCurrentUser }));
vi.mock('./lib/supabase', () => ({ setSupabaseRealtimeAuth: vi.fn() }));
vi.mock('@lottiefiles/dotlottie-react', () => ({
  DotLottieReact: () => <div data-testid="lottie-animation" />,
}));

import { SessionBootstrap } from './App';
import { useAuthStore } from './stores/authStore';

describe('SessionBootstrap', () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: 'token',
      refreshToken: 'refresh',
      sessionStatus: 'loading',
      sessionError: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render protected children before server verification completes', async () => {
    let resolveProfile: (value: unknown) => void = () => undefined;
    getCurrentUser.mockReturnValueOnce(new Promise((resolve) => { resolveProfile = resolve; }));
    render(<SessionBootstrap><div>Protected portal</div></SessionBootstrap>);
    expect(screen.getByText('Loading Hirna Portal...')).toBeInTheDocument();
    expect(screen.queryByText('Protected portal')).not.toBeInTheDocument();

    resolveProfile({ id: 'user-2', email: 'employee@example.com', assignedRoles: ['EMPLOYEE'], roles: ['EMPLOYEE'], permissions: [] });
    await waitFor(() => expect(screen.getByText('Protected portal')).toBeInTheDocument());
    expect(screen.queryByText('Loading Hirna Portal...')).not.toBeInTheDocument();
  });

  it('clears an invalid session and allows the login route to render', async () => {
    getCurrentUser.mockRejectedValueOnce({ response: { status: 401 } });

    render(<SessionBootstrap><div>Login route</div></SessionBootstrap>);

    await waitFor(() => expect(screen.getByText('Login route')).toBeInTheDocument());
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().sessionStatus).toBe('ready');
  });

  it('shows a retryable shared error state for an unexpected initialization failure', async () => {
    getCurrentUser
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce({
        id: 'user-3',
        email: 'records@example.com',
        assignedRoles: ['RECORDS_OFFICER'],
        roles: ['RECORDS_OFFICER'],
        permissions: [],
      });

    render(<SessionBootstrap><div>Protected portal</div></SessionBootstrap>);

    expect(await screen.findByText('Unable to load Hirna Portal')).toBeInTheDocument();
    expect(screen.queryByText('Protected portal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(await screen.findByText('Loading Hirna Portal...')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Protected portal')).toBeInTheDocument());
  });
});
