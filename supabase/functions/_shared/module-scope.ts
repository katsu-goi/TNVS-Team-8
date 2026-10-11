import { hasDirectSuperAdminAccess, type AuthorizationSubject } from './authorization-policy.ts';
export function resolveAnalyticsRole(subject: AuthorizationSubject, roles: readonly string[], requested: string | null): string | null {
  const assigned = new Set(subject.assignedRoles.map(role => role.toUpperCase()));
  const granted = new Set(subject.roles.map(role => role.toUpperCase()));
  const current = roles.find(role => assigned.has(role) || granted.has(role)) ?? null;
  if (requested === null) return current;
  if (!roles.includes(requested)) return null;
  return hasDirectSuperAdminAccess(subject) || requested === current ? requested : null;
}
export function canUseChatModule(subject: AuthorizationSubject, module: string, map: Record<string, string[]>): boolean {
  return module === 'global' || Object.hasOwn(map,module) && (hasDirectSuperAdminAccess(subject) || map[module].some(role => subject.roles.includes(role)));
}
