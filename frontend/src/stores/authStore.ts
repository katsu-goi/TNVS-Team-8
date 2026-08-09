import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuthTokens: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export function getDashboardPath(user: User | null): string {
  if (!user?.roles) return '/';
  const roles = user.roles.map(r => r.toUpperCase());
  if (roles.includes('FACILITIES_MANAGER') || roles.includes('ROLE_FACILITIES_MANAGER')) return '/facilities';
  if (roles.includes('FACILITIES_OFFICER') || roles.includes('ROLE_FACILITIES_OFFICER')) return '/facilities-officer';
  if (roles.includes('COMPLIANCE_OFFICER') || roles.includes('ROLE_COMPLIANCE_OFFICER')) return '/compliance';
  if (roles.includes('LEGAL_OFFICER') || roles.includes('ROLE_LEGAL_OFFICER')) return '/legal';
  if (roles.includes('CONTRACT_OFFICER') || roles.includes('ROLE_CONTRACT_OFFICER')) return '/procurement';
  if (roles.includes('EMPLOYEE') || roles.includes('ROLE_EMPLOYEE')) return '/employee';
  return '/';
}

export function isSuperAdmin(user: User | null): boolean {
  if (!user?.roles) return false;
  const roles = user.roles.map(r => r.toUpperCase());
  return roles.includes('SUPER_ADMIN') || roles.includes('ROLE_SUPER_ADMIN');
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
function decodeTokenRoles(token: string | null): string[] | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const raw = payload?.roles;
    if (typeof raw !== 'string' || !raw) return null;
    const roles = raw
      .split(',')
      .map((r: string) => r.trim())
      .filter((r: string) => r.startsWith('ROLE_'))
      .map((r: string) => r.slice('ROLE_'.length));
    return roles.length > 0 ? roles : null;
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
    // The token's roles are authoritative; never trust roles from localStorage.
    const tokenRoles = decodeTokenRoles(savedToken);
    if (tokenRoles) {
      return { ...stored, roles: tokenRoles };
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
    set({ user, accessToken, refreshToken });
  },
  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    set({ user: null, accessToken: null, refreshToken: null });
  },
}));
