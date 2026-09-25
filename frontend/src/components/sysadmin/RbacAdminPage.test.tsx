import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  listRoles: vi.fn(),
  listPermissions: vi.fn(),
  listConflicts: vi.fn(),
  updateUser: vi.fn(),
  createUser: vi.fn(),
  unlockUser: vi.fn(),
  setUserRole: vi.fn(),
  setRolePermission: vi.fn(),
  setInheritance: vi.fn(),
  createConflict: vi.fn(),
  deactivateConflict: vi.fn(),
}));

vi.mock('../../api/rbacService', async () => {
  const actual = await vi.importActual<typeof import('../../api/rbacService')>('../../api/rbacService');
  return { ...actual, rbacService: serviceMocks };
});

vi.mock('lottie-react', () => ({ default: () => <div data-testid="lottie-animation" /> }));

import { RbacAdminPage } from './RbacAdminPage';

const user = {
  id: 'user-1', employeeId: 'EMP-1', email: 'user@photonicomega.com',
  firstName: 'Test', lastName: 'User', fullName: 'Test User', department: 'Operations',
  position: 'Lead', status: 'ACTIVE', roles: ['EMPLOYEE'], accountLocked: false, lockedUntil: null,
};

const role = {
  id: 'role-1', name: 'EMPLOYEE', displayName: 'Employee', systemRole: true,
  directPermissions: [], inheritedRoles: [],
};

describe('RbacAdminPage account save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.listUsers.mockResolvedValue([user]);
    serviceMocks.listRoles.mockResolvedValue([role]);
    serviceMocks.listPermissions.mockResolvedValue([]);
    serviceMocks.listConflicts.mockResolvedValue([]);
    serviceMocks.updateUser.mockResolvedValue(user);
  });

  afterEach(cleanup);

  it('clears the new password only after success and keeps the selected account', async () => {
    render(<RbacAdminPage />);
    const password = await screen.findByLabelText(/New password/);
    fireEvent.change(password, { target: { value: 'StrongPassword2026!' } });

    fireEvent.click(screen.getByRole('button', { name: /Save account/ }));

    expect(await screen.findByText('Password updated. Existing sessions were revoked.')).toBeInTheDocument();
    expect(serviceMocks.updateUser).toHaveBeenCalledTimes(1);
    expect(serviceMocks.updateUser).toHaveBeenCalledWith('user-1', expect.objectContaining({
      password: 'StrongPassword2026!',
    }));
    expect(password).toHaveValue('');
    expect(screen.getAllByRole('button', { name: 'Selected' }).length).toBeGreaterThan(0);
    expect(screen.getByText('User Role Assignments')).toBeInTheDocument();
  });

  it('shows a safe error, retains the password after failure, and prevents duplicate saves', async () => {
    let rejectUpdate: ((reason?: unknown) => void) | undefined;
    serviceMocks.updateUser.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectUpdate = reject;
    }));
    render(<RbacAdminPage />);
    const password = await screen.findByLabelText(/New password/);
    fireEvent.change(password, { target: { value: 'StrongPassword2026!' } });
    const save = screen.getByRole('button', { name: /Save account/ });

    fireEvent.click(save);
    fireEvent.click(save);
    expect(serviceMocks.updateUser).toHaveBeenCalledTimes(1);
    expect(save).toBeDisabled();

    rejectUpdate?.({ isAxiosError: true, response: { status: 404, data: { message: 'No route for PATCH /admin/users/user-1' } } });

    expect(await screen.findByText('User account not found.')).toBeInTheDocument();
    expect(screen.queryByText(/No route for PATCH/)).not.toBeInTheDocument();
    expect(password).toHaveValue('StrongPassword2026!');
    await waitFor(() => expect(save).not.toBeDisabled());
  });
});
