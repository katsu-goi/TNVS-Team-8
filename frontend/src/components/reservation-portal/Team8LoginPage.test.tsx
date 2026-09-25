import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  navigate: vi.fn(),
  setAuthTokens: vi.fn(),
  verifyLoginSession: vi.fn(),
}));

vi.mock('../../api/authService', () => ({ login: mocks.login }));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (state: {
    setAuthTokens: typeof mocks.setAuthTokens;
    verifyLoginSession: typeof mocks.verifyLoginSession;
  }) => unknown) => selector({
    setAuthTokens: mocks.setAuthTokens,
    verifyLoginSession: mocks.verifyLoginSession,
  }),
}));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useLocation: () => ({ search: '' }),
  };
});

import { Team8LoginPage } from './Team8LoginPage';

describe('Team8LoginPage', () => {
  beforeEach(() => {
    mocks.login.mockReset();
    mocks.navigate.mockReset();
    mocks.setAuthTokens.mockReset();
    mocks.verifyLoginSession.mockReset();
  });

  afterEach(() => cleanup());

  it('waits for the authoritative /auth/me profile before entering the protected portal', async () => {
    let resolveProfile: (value: unknown) => void = () => undefined;
    mocks.login.mockResolvedValueOnce({
      user: { id: 'login-user', email: 'employee@photonicomega.com' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    mocks.verifyLoginSession.mockReturnValueOnce(new Promise((resolve) => { resolveProfile = resolve; }));

    render(<Team8LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('you@photonicomega.com'), {
      target: { value: 'employee@photonicomega.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'valid-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to reserve' }));

    await waitFor(() => expect(mocks.setAuthTokens).toHaveBeenCalledOnce());
    expect(mocks.verifyLoginSession).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();

    resolveProfile({ id: 'verified-user', email: 'employee@photonicomega.com' });
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/reservation-portal', { replace: true }));
  });
});
