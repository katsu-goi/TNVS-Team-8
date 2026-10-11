import type { AuthContext } from './guard.ts';
import { hasDirectSuperAdminAccess } from './authorization-policy.ts';
export function workflowActorRole(ctx: AuthContext, ordinaryRole: string): string {
  return hasDirectSuperAdminAccess({assignedRoles:ctx.user.assignedRoles,oversightActive:Boolean(ctx.oversight)}) ? 'SUPER_ADMIN' : ordinaryRole;
}
