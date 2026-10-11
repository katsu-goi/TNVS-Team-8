import { getRolePresentation, type RolePresentation } from '../config/roleRegistry';
import { useAuthStore } from '../stores/authStore';
import { hasDirectSuperAdminAccess } from '../utils/portalAccess';
import { useOversightContext } from './useOversightContext';
export function usePortalPresentation(defaultRole: string): RolePresentation {
  const user = useAuthStore(state => state.user);
  const scope = useOversightContext();
  const scopedRole = scope.targetUser && ['SUPER_ADMIN','SYSTEM_ADMIN'].includes(defaultRole)
    ? scope.targetUser.assignedRoles?.[0] ?? scope.targetUser.roles?.[0] ?? defaultRole : defaultRole;
  const presentation = getRolePresentation(hasDirectSuperAdminAccess(user,scope) ? 'SUPER_ADMIN' : scopedRole);
  if (!presentation) throw new Error(`Unknown portal role: ${defaultRole}`);
  return presentation;
}
