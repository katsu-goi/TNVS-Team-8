import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserProfileMenu } from './UserProfileMenu';

const mocks = vi.hoisted(() => ({
  apiLogout: vi.fn(),
  localLogout: vi.fn(),
}));

vi.mock('../../api/authService', () => ({ logout: mocks.apiLogout }));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: {
      id: 'qa-user',
      email: 'superadmin@photonicomega.com',
      fullName: 'QA Super Admin',
      assignedRoles: ['SUPER_ADMIN'],
      roles: ['SUPER_ADMIN'],
    },
    logout: mocks.localLogout,
  }),
}));

describe('UserProfileMenu logout flow', () => {
  beforeEach(() => {
    mocks.apiLogout.mockReset().mockResolvedValue(undefined);
    mocks.localLogout.mockReset();
  });

  it('cancels without logging out, then closes the server session and clears local auth on confirmation', async () => {
    render(<MemoryRouter><UserProfileMenu /></MemoryRouter>);
    const accountTrigger = screen.getByRole('button', { name: 'Account menu for QA Super Admin' });

    fireEvent.click(accountTrigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }));
    expect(screen.getByRole('dialog', { name: 'Confirm logout' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(accountTrigger).toHaveFocus());
    expect(mocks.apiLogout).not.toHaveBeenCalled();
    expect(mocks.localLogout).not.toHaveBeenCalled();

    fireEvent.click(accountTrigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(mocks.apiLogout).toHaveBeenCalledTimes(1));
    expect(mocks.localLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
