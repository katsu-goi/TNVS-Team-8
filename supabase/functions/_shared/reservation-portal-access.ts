import { hasDirectSuperAdminAccess, type AuthorizationSubject } from './authorization-policy.ts';
export function canAccessReservationPortal(subject: AuthorizationSubject, email: string, domains: readonly string[]): boolean {
  return hasDirectSuperAdminAccess(subject) || domains.includes(email.trim().toLowerCase().split('@').pop() ?? '');
}
export function canOperateReservations(subject: AuthorizationSubject): boolean {
  return hasDirectSuperAdminAccess(subject) || subject.assignedRoles.some(role => role === 'FACILITIES_OFFICER' || role === 'FACILITIES_MANAGER');
}
