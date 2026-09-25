import { apiClient } from './client';
import axios from 'axios';

export interface RbacRole {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  dashboardKey?: string;
  systemRole: boolean;
  directPermissions: string[];
  inheritedRoles: string[];
}

export interface RbacPermission {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  module: string;
  resource: string;
  action: string;
}

export interface RbacConflict {
  id: string;
  code: string;
  description?: string;
  firstRole: string;
  secondRole: string;
  active: boolean;
}

export interface RbacDashboardProfile {
  dashboardKey: string;
  assignedRoles: string[];
  effectiveRoles: string[];
  permissions: string[];
  activeConstraints: RbacConflict[];
}

export interface RbacUser {
  id: string;
  employeeId?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  department?: string;
  position?: string;
  status: string;
  roles: string[];
  accountLocked?: boolean;
  lockedUntil?: string | null;
}

export interface AccountInput {
  firstName: string;
  lastName: string;
  email: string;
  employeeId?: string;
  department?: string;
  position?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  password?: string;
}

function dataOf<T>(response: { data?: { data?: T } }): T {
  return response.data?.data as T;
}

export function getAccountUpdateErrorMessage(error: unknown): string {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 400) return 'Please check the account information.';
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to modify this account.';
  if (status === 404) return 'User account not found.';
  if (status === 409) return 'An account with this email already exists.';
  return 'Unable to update the account right now. Please try again.';
}

export const rbacService = {
  async getDashboard(): Promise<RbacDashboardProfile> {
    return dataOf<RbacDashboardProfile>(await apiClient.get('/rbac/me/dashboard'));
  },
  async listUsers(): Promise<RbacUser[]> {
    return dataOf<RbacUser[]>(await apiClient.get('/admin/rbac/users')) || [];
  },
  async listLockedUsers(): Promise<RbacUser[]> {
    return dataOf<RbacUser[]>(await apiClient.get('/admin/account-lockouts')) || [];
  },
  async listRoles(): Promise<RbacRole[]> {
    return dataOf<RbacRole[]>(await apiClient.get('/admin/rbac/roles')) || [];
  },
  async listPermissions(): Promise<RbacPermission[]> {
    return dataOf<RbacPermission[]>(await apiClient.get('/admin/rbac/permissions')) || [];
  },
  async listConflicts(): Promise<RbacConflict[]> {
    return dataOf<RbacConflict[]>(await apiClient.get('/admin/rbac/conflicts')) || [];
  },
  async setUserRole(userId: string, roleId: string, assigned: boolean): Promise<void> {
    const url = `/admin/rbac/users/${userId}/roles/${roleId}`;
    await (assigned ? apiClient.put(url) : apiClient.delete(url));
  },
  async setRolePermission(roleId: string, permissionId: string, granted: boolean): Promise<void> {
    const url = `/admin/rbac/roles/${roleId}/permissions/${permissionId}`;
    await (granted ? apiClient.put(url) : apiClient.delete(url));
  },
  async setInheritance(seniorRoleId: string, juniorRoleId: string, inherited: boolean): Promise<void> {
    const url = `/admin/rbac/hierarchy/${seniorRoleId}/${juniorRoleId}`;
    await (inherited ? apiClient.put(url) : apiClient.delete(url));
  },
  async createConflict(firstRoleId: string, secondRoleId: string, code: string, description: string): Promise<void> {
    await apiClient.post('/admin/rbac/conflicts', { firstRoleId, secondRoleId, code, description });
  },
  async deactivateConflict(conflictId: string): Promise<void> {
    await apiClient.delete(`/admin/rbac/conflicts/${conflictId}`);
  },
  async unlockUser(userId: string): Promise<void> {
    await apiClient.post(`/admin/users/${userId}/unlock`);
  },
  async createUser(input: AccountInput & { password: string }): Promise<RbacUser> {
    return dataOf<RbacUser>(await apiClient.post('/admin/users', input));
  },
  async updateUser(userId: string, input: AccountInput): Promise<RbacUser> {
    const payload = { ...input };
    if (!payload.password) delete payload.password;
    return dataOf<RbacUser>(await apiClient.patch(`/admin/users/${userId}`, payload));
  },
};
