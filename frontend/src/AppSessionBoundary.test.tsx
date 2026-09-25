import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./components/auth/SessionIdleManager', () => ({
  SessionIdleManager: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="idle-session-manager">{children}</div>
  ),
}));
vi.mock('./components/oversight', () => ({ OversightBanner: () => null }));
vi.mock('./lib/supabase', () => ({
  setSupabaseRealtimeAuth: vi.fn(),
  supabase: null,
  supabaseAvailable: false,
}));

import { AppRoutes, AuthenticatedSessionBoundary } from './App';
import { useAuthStore } from './stores/authStore';

describe('application session boundary', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      sessionStatus: 'ready',
      sessionError: null,
    });
  });

  afterEach(() => cleanup());

  it('keeps the login page outside the idle-session manager', () => {
    render(<MemoryRouter initialEntries={['/login']}><AppRoutes /></MemoryRouter>);

    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.queryByTestId('idle-session-manager')).not.toBeInTheDocument();
  });

  it('mounts the idle-session manager only for a server-verified protected session', () => {
    useAuthStore.setState({
      user: {
        id: 'employee-1', email: 'employee@example.com', assignedRoles: ['EMPLOYEE'],
        roles: ['EMPLOYEE'], permissions: [],
      },
      accessToken: 'verified-access',
      refreshToken: 'verified-refresh',
      sessionStatus: 'ready',
      sessionError: null,
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route element={<AuthenticatedSessionBoundary />}>
            <Route path="/protected" element={<div>Protected portal</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('idle-session-manager')).toBeInTheDocument();
    expect(screen.getByText('Protected portal')).toBeInTheDocument();
  });
});
