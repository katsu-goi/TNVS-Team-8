import { hasDirectSuperAdminAccess, isRouteAuthorized, type AuthorizationSubject, type RouteGuard } from './authorization-policy.ts';

const subject = (assignedRoles: string[], oversightActive = false): AuthorizationSubject => ({ assignedRoles, oversightActive, roles: assignedRoles, permissions: [] });
const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };

Deno.test('direct assignment grants each protected guard', () => {
  const rules: RouteGuard[] = [
    { kind: 'assignedRoles', roles: ['FACILITIES_MANAGER'] },
    { kind: 'roles', roles: ['EMPLOYEE'] },
    { kind: 'permissions', permissions: ['DOCUMENT_CLASSIFY'] },
    { kind: 'rolesOrPermissions', roles: ['LEGAL_COUNSEL'], permissions: ['DOCUMENT_VIEW'] },
  ];
  for (const rule of rules) assert(isRouteAuthorized(subject(['SUPER_ADMIN']), rule), rule.kind);
});
Deno.test('inherited and malformed assignments do not grant direct access', () => {
  for (const assignedRoles of [[], ['SYSTEM_ADMIN'], ['role_super_admin'], [' SUPER_ADMIN '], ['UNKNOWN']]) {
    assert(!hasDirectSuperAdminAccess({ assignedRoles, oversightActive: false }), 'assignment accepted');
    assert(!isRouteAuthorized({ ...subject(assignedRoles), roles: ['SUPER_ADMIN'] }, { kind: 'assignedRoles', roles: ['FACILITIES_MANAGER'] }), 'inheritance escalated');
  }
});
Deno.test('oversight does not inherit actor authority', () => {
  assert(!hasDirectSuperAdminAccess(subject(['SUPER_ADMIN'], true)), 'oversight escalated');
  assert(!isRouteAuthorized(subject(['EMPLOYEE'], true), { kind: 'assignedRoles', roles: ['FACILITIES_MANAGER'] }), 'target escalated');
});
Deno.test('ordinary roles keep their existing guards', () => {
  assert(isRouteAuthorized(subject(['FACILITIES_MANAGER']), { kind: 'assignedRoles', roles: ['FACILITIES_MANAGER'] }), 'manager denied');
  assert(!isRouteAuthorized(subject(['EMPLOYEE']), { kind: 'assignedRoles', roles: ['FACILITIES_MANAGER'] }), 'employee allowed');
  assert(isRouteAuthorized({ ...subject(['EMPLOYEE']), permissions: ['DOCUMENT_VIEW'] }, { kind: 'permissions', permissions: ['DOCUMENT_VIEW'] }), 'permission denied');
});
