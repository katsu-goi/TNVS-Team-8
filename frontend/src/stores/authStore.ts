import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuthTokens: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

/**
 * True if the user holds any of `wanted`.
 *
 * Compares case-insensitively and treats `COMPLIANCE_MANAGER` and
 * `ROLE_COMPLIANCE_MANAGER` as the same role, because both forms genuinely
 * reach the client: the JWT carries Spring authorities, which are ROLE_-prefixed,
 * while a user object rehydrated from the login response carries bare names.
 * Every guard should go through here rather than comparing strings inline - the
 * inline form was written out six times, and each copy was one more place for a
 * newly added role to be silently omitted.
 */
export function hasAnyRole(user: User | null, wanted: readonly string[]): boolean {
  if (!user?.roles) return false;
  const strip = (r: string) => {
    const upper = r.toUpperCase();
    return upper.startsWith('ROLE_') ? upper.slice('ROLE_'.length) : upper;
  };
  const held = new Set(user.roles.map(strip));
  return wanted.some(w => held.has(strip(w)));
}

/**
 * The role families that share a dashboard surface.
 *
 * <b>`getDashboardPath` and the route guards in App.tsx must agree on these</b>,
 * which is why they are one shared constant rather than two lists that happen to
 * match today. If `getDashboardPath` sent a role to /facilities while
 * `FacilitiesRoute` did not admit it, the guard would bounce it to '/',
 * `AdminRoute` would ask `getDashboardPath` again, get /facilities, and the two
 * would redirect at each other forever - a hang rather than an error message.
 *
 * These mirror the backend's URL-layer role sets. The compliance family is
 * deliberately the records family rather than COMPLIANCE_OFFICER alone, matching
 * the widening already made to /v1/compliance/**: the officer raises a disposal
 * and cannot approve it, so the roles that give the second signature must be able
 * to reach the same surface.
 *
 * Deliberately absent: SUPER_ADMIN, SYSTEM_ADMINISTRATOR and SECURITY_OFFICER.
 * Administering the platform does not confer authority over the company's
 * records, so no administrator role is admitted to the compliance or legal
 * surface by virtue of being an administrator.
 */
export const ROLE_FAMILIES = {
  facilities: ['FACILITIES_MANAGER', 'FACILITIES_DIRECTOR'],
  facilitiesOfficer: ['FACILITIES_OFFICER', 'MAINTENANCE_SUPERVISOR'],
  compliance: ['COMPLIANCE_OFFICER', 'COMPLIANCE_MANAGER', 'RECORDS_OFFICER', 'DATA_PROTECTION_OFFICER'],
  legal: ['LEGAL_OFFICER', 'LEGAL_COUNSEL'],
  procurement: ['CONTRACT_OFFICER'],
  employee: ['EMPLOYEE', 'DEPARTMENT_HEAD'],
} as const;

/**
 * Where a user lands after logging in.
 *
 * <b>Every role that can log in must resolve to a real path here.</b> Falling
 * through to '/' is not a harmless default: '/' is wrapped in `AdminRoute`,
 * which sends a non-SUPER_ADMIN back through this function, gets '/' again, and
 * redirects to /login. The user authenticates successfully and is bounced
 * straight back to the login screen with no error shown - indistinguishable, from
 * the outside, from a rejected password.
 *
 * That is precisely what happened to the three governance approver accounts
 * (COMPLIANCE_MANAGER, DATA_PROTECTION_OFFICER, LEGAL_COUNSEL). The two-person
 * approval rule was enforced and tested in the backend while the only accounts
 * able to give a second signature could not reach the application at all, so
 * every gated action would have been permanently unapprovable in practice.
 * Adding a newly gated action without adding its approver role to
 * {@link ROLE_FAMILIES} brings that failure straight back.
 */
export function getDashboardPath(user: User | null): string {
  if (!user?.roles) return '/';
  if (hasAnyRole(user, ROLE_FAMILIES.facilities)) return '/facilities';
  if (hasAnyRole(user, ROLE_FAMILIES.facilitiesOfficer)) return '/facilities-officer';
  if (hasAnyRole(user, ROLE_FAMILIES.compliance)) return '/compliance';
  if (hasAnyRole(user, ROLE_FAMILIES.legal)) return '/legal';
  if (hasAnyRole(user, ROLE_FAMILIES.procurement)) return '/procurement';
  if (hasAnyRole(user, ROLE_FAMILIES.employee)) return '/employee';
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
