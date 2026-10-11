import { hasDirectSuperAdminAccess } from './authorization-policy.ts';
export function hasAssignedWorkspace(
  assignedRoles: string[],
  workspace: string,
  workspaceByRole: Record<string, string>,
  oversightActive = false,
): boolean {
  if (!Object.values(workspaceByRole).includes(workspace)) return false;
  if (hasDirectSuperAdminAccess({assignedRoles,oversightActive})) return true;
  return assignedRoles.some((role) => workspaceByRole[role] === workspace);
}
