import type { User } from '../types';
export type PortalScope = { sessionId: string | null; targetUser: User | null };
export function hasDirectSuperAdminAccess(user: User | null, scope: PortalScope): boolean {
  return !scope.sessionId && !scope.targetUser && Boolean(user?.assignedRoles?.includes('SUPER_ADMIN'));
}
export function hasPortalAccess(user: User | null, role: string, scope: PortalScope): boolean {
  if (hasDirectSuperAdminAccess(user,scope)) return true;
  if ((scope.sessionId && !scope.targetUser) || (!scope.sessionId && scope.targetUser)) return false;
  const operationalUser = scope.targetUser ?? user;
  const roles = operationalUser?.assignedRoles?.length ? operationalUser.assignedRoles : operationalUser?.roles ?? [];
  return roles.some(value => value.toUpperCase().replace(/^ROLE_/, '') === role.toUpperCase().replace(/^ROLE_/, ''));
}
