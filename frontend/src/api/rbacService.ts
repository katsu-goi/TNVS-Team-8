import { apiClient } from './client';

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
  email: string;
  fullName: string;
  department?: string;
  position?: string;
  status: string;
  roles: string[];
  accountLocked?: boolean;
  lockedUntil?: string | null;
}

function dataOf<T>(response: { data?: { data?: T } }): T {
  return response.data?.data as T;
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
};
