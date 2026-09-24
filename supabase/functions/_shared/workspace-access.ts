export function hasAssignedWorkspace(
  assignedRoles: string[],
  workspace: string,
  workspaceByRole: Record<string, string>,
): boolean {
  return assignedRoles.some((role) => workspaceByRole[role] === workspace);
}
