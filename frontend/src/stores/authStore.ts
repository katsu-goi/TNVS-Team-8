import { create } from 'zustand';
import { User } from '../types';
import { setSupabaseRealtimeAuth } from '../lib/supabase';
import { clearOversightSession, getOversightTargetUser } from '../utils/oversightSession';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuthTokens: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export function getDashboardPath(user: User | null): string {
  const routeUser = getOversightTargetUser() || user;
  if (!routeUser?.roles) return '/';
  if (!getOversightTargetUser() && isActorSuperAdmin(user)) return '/super-admin';
  if (!getOversightTargetUser() && isActorSystemAdmin(user)) return '/system-admin';
  const roles = getAssignedRoles(routeUser);
  if (roles.includes('COMPLIANCE_MANAGER')) return '/compliance-management';
  if (roles.includes('DATA_PROTECTION_OFFICER')) return '/privacy';
  if (roles.includes('LEGAL_COUNSEL')) return '/legal-counsel';
  if (roles.includes('RECORDS_OFFICER')) return '/records';
  if (roles.includes('DEPARTMENT_HEAD')) return '/department';
  if (roles.includes('SECURITY_OFFICER')) return '/security-operations';
  if (roles.includes('INFOSEC_OFFICER')) return '/information-security';
  if (roles.includes('FACILITIES_MANAGER') || roles.includes('ROLE_FACILITIES_MANAGER')) return '/facilities';
  if (roles.includes('FACILITIES_OFFICER') || roles.includes('ROLE_FACILITIES_OFFICER')) return '/facilities-officer';
  if (roles.includes('COMPLIANCE_OFFICER') || roles.includes('ROLE_COMPLIANCE_OFFICER')) return '/compliance';
  if (roles.includes('LEGAL_OFFICER') || roles.includes('ROLE_LEGAL_OFFICER')) return '/legal';
  if (roles.includes('CONTRACT_OFFICER') || roles.includes('ROLE_CONTRACT_OFFICER')) return '/procurement';
  if (roles.includes('EMPLOYEE') || roles.includes('ROLE_EMPLOYEE')) return '/employee';
  return '/';
}

export function isSuperAdmin(user: User | null): boolean {
  return hasRole(user, 'SUPER_ADMIN');
}

export function isSystemAdmin(user: User | null): boolean {
  return hasRole(user, 'SYSTEM_ADMIN');
}

export function isActorSuperAdmin(user: User | null): boolean {
  return getAssignedRoles(user).includes('SUPER_ADMIN');
}

export function isActorSystemAdmin(user: User | null): boolean {
  return getAssignedRoles(user).includes('SYSTEM_ADMIN');
}

export function getAssignedRoles(user: User | null): string[] {
  const roles = user?.assignedRoles?.length ? user.assignedRoles : user?.roles;
  return (roles || []).map((role) => role.toUpperCase().replace(/^ROLE_/, ''));
}

export function hasAssignedRole(user: User | null, role: string): boolean {
  const effectiveUser = getOversightTargetUser() || user;
  return getAssignedRoles(effectiveUser).includes(role.toUpperCase().replace(/^ROLE_/, ''));
}

export function hasRole(user: User | null, role: string): boolean {
  const effectiveUser = getOversightTargetUser() || user;
  const normalizedRole = role.toUpperCase().replace(/^ROLE_/, '');
  return effectiveUser?.roles?.some((candidate) =>
    candidate.toUpperCase().replace(/^ROLE_/, '') === normalizedRole
  ) ?? false;
}

export function hasPermission(user: User | null, permission: string): boolean {
  const effectiveUser = getOversightTargetUser() || user;
  return effectiveUser?.permissions?.some((candidate) => candidate.toUpperCase() === permission.toUpperCase()) ?? false;
}

/**
 * Decodes the JWT `roles` claim (a comma-joined list of authorities) and
 * returns the role names only - ROLE_* entries have the prefix stripped and
 * permission names (which never carry the ROLE_ prefix) are dropped.
 *
 * The backend puts the actual authorities in the token, so this is the ground
 * truth for what a client can do. LocalStorage can be edited by hand, so the
 * stored `user.roles` is overridden by these token claims on boot.
 */
function decodeTokenAuthorities(token: string | null): { roles: string[]; permissions: string[] } | null {
  if (!token) return null;
  try {
    const encodedPayload = token.split('.')[1];
    if (!encodedPayload) return null;
    const normalizedPayload = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');
    const payload = JSON.parse(atob(paddedPayload));
    const raw = payload?.roles;
    if (typeof raw !== 'string' || !raw) return null;
    const authorities = raw
      .split(',')
      .map((r: string) => r.trim())
      .filter(Boolean);
    return {
      roles: authorities
        .filter((authority: string) => authority.startsWith('ROLE_'))
        .map((authority: string) => authority.slice('ROLE_'.length)),
      permissions: authorities.filter((authority: string) => !authority.startsWith('ROLE_')),
    };
  } catch {
    return null;
  }
}

const savedToken = localStorage.getItem('accessToken');
const savedRefreshToken = localStorage.getItem('refreshToken');

function loadSavedUser(): User | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as User;
    // The token's authorities are authoritative; never trust roles or permissions from localStorage.
    const tokenAuthorities = decodeTokenAuthorities(savedToken);
    if (tokenAuthorities) {
      return {
        ...stored,
        roles: tokenAuthorities.roles,
        permissions: tokenAuthorities.permissions,
      };
    }
    if (savedToken) {
      localStorage.removeItem('user');
      return null;
    }
    return stored;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: loadSavedUser(),
  accessToken: savedToken,
  refreshToken: savedRefreshToken,
  setAuthTokens: (user, accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify(user));
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
    setSupabaseRealtimeAuth(accessToken);
    set({ user, accessToken, refreshToken });
  },
  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    clearOversightSession();
    setSupabaseRealtimeAuth(null);
    set({ user: null, accessToken: null, refreshToken: null });
  },
}));

window.addEventListener('auth:session-refreshed', (event) => {
  const session = (event as CustomEvent<{
    accessToken: string;
    refreshToken: string;
    user?: User;
  }>).detail;
  if (!session?.accessToken || !session?.refreshToken) return;
  setSupabaseRealtimeAuth(session.accessToken);
  useAuthStore.setState((state) => ({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: session.user || state.user,
  }));
});

window.addEventListener('auth:session-expired', () => {
  clearOversightSession();
  setSupabaseRealtimeAuth(null);
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null });
});

setSupabaseRealtimeAuth(savedToken);
