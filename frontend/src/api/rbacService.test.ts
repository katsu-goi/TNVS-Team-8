import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  patch: vi.fn(),
}));

vi.mock('./client', () => ({
  apiClient: {
    patch: apiMocks.patch,
  },
}));

import { getAccountUpdateErrorMessage, rbacService } from './rbacService';

describe('rbac account updates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the canonical PATCH endpoint and preserves intended fields', async () => {
    apiMocks.patch.mockResolvedValue({ data: { data: { id: 'user-1' } } });

    await rbacService.updateUser('user-1', {
      firstName: 'Test', lastName: 'User', email: 'test@example.com',
      employeeId: 'EMP-1', department: 'Ops', position: 'Lead', status: 'ACTIVE',
      password: 'StrongPassword2026!',
    });

    expect(apiMocks.patch).toHaveBeenCalledTimes(1);
    expect(apiMocks.patch).toHaveBeenCalledWith('/admin/users/user-1', {
      firstName: 'Test', lastName: 'User', email: 'test@example.com',
      employeeId: 'EMP-1', department: 'Ops', position: 'Lead', status: 'ACTIVE',
      password: 'StrongPassword2026!',
    });
  });

  it('does not send a blank password', async () => {
    apiMocks.patch.mockResolvedValue({ data: { data: { id: 'user-1' } } });

    await rbacService.updateUser('user-1', {
      firstName: 'Test', lastName: 'User', email: 'test@example.com', password: '',
    });

    expect(apiMocks.patch).toHaveBeenCalledWith('/admin/users/user-1', {
      firstName: 'Test', lastName: 'User', email: 'test@example.com',
    });
  });

  it.each([
    [400, 'Please check the account information.'],
    [401, 'Your session has expired. Please sign in again.'],
    [403, 'You do not have permission to modify this account.'],
    [404, 'User account not found.'],
    [409, 'An account with this email already exists.'],
    [500, 'Unable to update the account right now. Please try again.'],
  ])('maps HTTP %s to a safe account error', (status, expected) => {
    expect(getAccountUpdateErrorMessage({ isAxiosError: true, response: { status } })).toBe(expected);
  });
});
