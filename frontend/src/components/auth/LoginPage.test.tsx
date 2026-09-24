import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  navigate: vi.fn(),
  setAuthTokens: vi.fn(),
  bootstrapSession: vi.fn(),
}));

vi.mock('../../api/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/authService')>();
  return { ...actual, login: mocks.login };
});

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (state: { setAuthTokens: typeof mocks.setAuthTokens; bootstrapSession: typeof mocks.bootstrapSession }) => unknown) => selector({
    setAuthTokens: mocks.setAuthTokens,
    bootstrapSession: mocks.bootstrapSession,
  }),
  getDashboardPath: (user: { assignedRoles?: string[] }) => user.assignedRoles?.includes('EMPLOYEE') ? '/employee' : '/',
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useLocation: () => ({ search: '' }),
  };
});

import { LoginPage } from './LoginPage';

const fillLogin = () => {
  fireEvent.change(screen.getByLabelText('Email / Corporate ID'), {
    target: { value: 'qa.employee-a@tnvs-staging.invalid' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'intentionally-wrong-password' },
  });
};

describe('LoginPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.login.mockReset();
    mocks.navigate.mockReset();
    mocks.setAuthTokens.mockReset();
    mocks.bootstrapSession.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('uses custom inline required-field validation and focuses the first invalid field', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    const email = screen.getByLabelText('Email / Corporate ID');
    const password = screen.getByLabelText('Password');
    expect(await screen.findByText('Email or Corporate ID is required.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(email).toHaveFocus());
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('shows the same generic message for invalid credentials', async () => {
    mocks.login.mockRejectedValueOnce({
      response: { data: { errorCode: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
    });
    render(<LoginPage />);
    fillLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
  });

  it('verifies /auth/me before navigating from login to the role dashboard', async () => {
    let resolveProfile: (user: unknown) => void = () => undefined;
    mocks.login.mockResolvedValueOnce({
      user: { id: 'login-payload', email: 'qa.employee-a@tnvs-staging.invalid', assignedRoles: ['SUPER_ADMIN'] },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    mocks.bootstrapSession.mockReturnValueOnce(new Promise((resolve) => { resolveProfile = resolve; }));

    render(<LoginPage />);
    fillLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(mocks.setAuthTokens).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'login-payload' }),
      'access-token',
      'refresh-token',
    ));
    expect(mocks.bootstrapSession).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();

    resolveProfile({
      id: 'verified-user',
      email: 'qa.employee-a@tnvs-staging.invalid',
      assignedRoles: ['EMPLOYEE'],
      roles: ['EMPLOYEE'],
      permissions: [],
    });

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/employee', { replace: true }));
  });

  it('renders the server countdown, blocks submission, and re-enables automatically', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T08:00:00.000Z'));
    mocks.login.mockRejectedValueOnce({
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
    render(<LoginPage />);
    fillLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText(/Too many failed login attempts/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again in 00:30' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again in 00:30' }));
    expect(mocks.login).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
  });

  it('restores only a server-issued absolute restriction timestamp after refresh', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T08:00:00.000Z'));
    sessionStorage.setItem('loginRestriction', JSON.stringify({
      email: 'qa.employee-a@tnvs-staging.invalid',
      retryAt: '2026-09-24T08:00:30.000Z',
    }));

    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'Try again in 00:30' })).toBeDisabled();
    expect(mocks.login).not.toHaveBeenCalled();
  });
});
