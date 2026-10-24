import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as authService from '../../api/authService';
import { ForgotPasswordPage, ResetPasswordPage } from './PasswordRecoveryPages';

vi.mock('../../api/authService', async () => {
  const actual = await vi.importActual<typeof import('../../api/authService')>('../../api/authService');
  return { ...actual, requestPasswordReset: vi.fn(), resetPassword: vi.fn() };
});

const renderAt = (path: string, element: React.ReactNode) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="*" element={element} />
      <Route path="/login" element={<p>Sign-in destination</p>} />
    </Routes>
  </MemoryRouter>,
);

describe('password recovery pages', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('submits a normalized email and gives truthful non-enumerating guidance', async () => {
    vi.mocked(authService.requestPasswordReset).mockResolvedValue(undefined);
    renderAt('/forgot-password', <ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('Corporate email'), { target: { value: ' Employee@PhotonicOmega.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(authService.requestPasswordReset).toHaveBeenCalledWith('Employee@PhotonicOmega.com'));
    expect(screen.getByRole('status')).toHaveTextContent(/If an active account exists/i);
    expect(screen.getByRole('button', { name: /contact hr/i })).toBeInTheDocument();
  });

  it('rejects weak or mismatched passwords before calling the server', () => {
    renderAt('/reset-password?token=reset-token', <ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'weak' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/uppercase, lowercase, number, and special character/i);
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it('submits the query token and returns to sign in after a successful reset', async () => {
    vi.mocked(authService.resetPassword).mockResolvedValue(undefined);
    renderAt('/reset-password?token=reset-token', <ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Secure1!' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Secure1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    await waitFor(() => expect(authService.resetPassword).toHaveBeenCalledWith({
      token: 'reset-token', newPassword: 'Secure1!', confirmPassword: 'Secure1!',
    }));
    expect(await screen.findByText('Sign-in destination')).toBeInTheDocument();
  });

  it('blocks reset submission when the link has no token', () => {
    renderAt('/reset-password', <ResetPasswordPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(/invalid or incomplete/i);
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeDisabled();
  });
});
