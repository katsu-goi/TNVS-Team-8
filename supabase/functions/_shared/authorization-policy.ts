export type AuthorizationSubject = { assignedRoles: readonly string[]; roles: readonly string[]; permissions: readonly string[]; oversightActive: boolean };
export type RouteGuard =
  | { kind: 'public' } | { kind: 'auth' }
  | { kind: 'roles'; roles: string[] } | { kind: 'assignedRoles'; roles: string[] }
  | { kind: 'permissions'; permissions: string[] }
  | { kind: 'rolesOrPermissions'; roles: string[]; permissions: string[] };
export function hasDirectSuperAdminAccess(subject: Pick<AuthorizationSubject, 'assignedRoles' | 'oversightActive'>): boolean {
  return !subject.oversightActive && subject.assignedRoles.includes('SUPER_ADMIN');
}
export function isRouteAuthorized(subject: AuthorizationSubject, rule: RouteGuard): boolean {
  if (rule.kind === 'public' || rule.kind === 'auth') return true;
  if (hasDirectSuperAdminAccess(subject)) return true;
  const any = (values: readonly string[], required: string[]) => {
    const actual = new Set(values.map(value => value.toUpperCase()));
    return required.some(value => actual.has(value.toUpperCase()));
  };
  switch (rule.kind) {
    case 'roles': return any(subject.roles, rule.roles);
    case 'assignedRoles': return any(subject.assignedRoles, rule.roles);
    case 'permissions': return any(subject.permissions, rule.permissions);
    case 'rolesOrPermissions': return any(subject.roles, rule.roles) || any(subject.permissions, rule.permissions);
  }
}
