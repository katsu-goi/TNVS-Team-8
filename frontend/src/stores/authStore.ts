import { create } from 'zustand';
import { User } from '../types';
import { setSupabaseRealtimeAuth } from '../lib/supabase';
import { clearOversightSession, getOversightTargetUser } from '../utils/oversightSession';
import { getDashboardPathForRoles } from '../config/roleRegistry';
import { getCurrentUser } from '../api/authService';

export type SessionStatus = 'loading' | 'ready';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  sessionStatus: SessionStatus;
  setAuthTokens: (user: User, accessToken: string, refreshToken: string) => void;
  bootstrapSession: () => Promise<void>;
  logout: () => void;
}

export function getDashboardPath(user: User | null): string {
  const oversightTarget = getOversightTargetUser();
  const routeUser = oversightTarget || user;
  if (!routeUser || (!routeUser.roles?.length && !routeUser.assignedRoles?.length)) return '/';
  if (!oversightTarget && isActorSuperAdmin(user)) return '/super-admin';
  if (!oversightTarget && isActorSystemAdmin(user)) return '/system-admin';
  return getDashboardPathForRoles(getAssignedRoles(routeUser));
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
  return getAssignedRoles(effectiveUser).includes(normalizedRole);
}

export function hasPermission(user: User | null, permission: string): boolean {
  const effectiveUser = getOversightTargetUser() || user;
  return effectiveUser?.permissions?.some((candidate) => candidate.toUpperCase() === permission.toUpperCase()) ?? false;
}

const savedToken = localStorage.getItem('accessToken');
const savedRefreshToken = localStorage.getItem('refreshToken');

let bootstrapRequest: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  // Tokens provide session continuity only. Identity and authorization always
  // come from the server before any protected UI is rendered.
  user: null,
  accessToken: savedToken,
  refreshToken: savedRefreshToken,
  sessionStatus: savedToken ? 'loading' : 'ready',
  setAuthTokens: (user, accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.removeItem('user');
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
    setSupabaseRealtimeAuth(accessToken);
    set({ user, accessToken, refreshToken, sessionStatus: 'ready' });
  },
  bootstrapSession: async () => {
    if (get().sessionStatus !== 'loading') return;
    if (!bootstrapRequest) {
      bootstrapRequest = getCurrentUser()
        .then((user) => set({ user, sessionStatus: 'ready' }))
        .catch(() => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          clearOversightSession();
          setSupabaseRealtimeAuth(null);
          set({ user: null, accessToken: null, refreshToken: null, sessionStatus: 'ready' });
        })
        .finally(() => { bootstrapRequest = null; });
    }
    await bootstrapRequest;
  },
  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    clearOversightSession();
    setSupabaseRealtimeAuth(null);
    set({ user: null, accessToken: null, refreshToken: null, sessionStatus: 'ready' });
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
    user: (session.user as User | undefined) || state.user,
    sessionStatus: 'ready',
  }));
});

window.addEventListener('auth:session-expired', () => {
  clearOversightSession();
  setSupabaseRealtimeAuth(null);
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, sessionStatus: 'ready' });
});

setSupabaseRealtimeAuth(savedToken);
