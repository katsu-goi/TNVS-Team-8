import { create } from 'zustand';
import { User } from '../types';
import { setSupabaseRealtimeAuth } from '../lib/supabase';
import { clearOversightSession, getOversightTargetUser } from '../utils/oversightSession';
import { getDashboardPathForRoles } from '../config/roleRegistry';
import { getCurrentUser } from '../api/authService';

export type SessionStatus = 'loading' | 'ready' | 'error';

export const SESSION_BOOTSTRAP_TIMEOUT_MS = 15_000;
export const SESSION_LOADER_MINIMUM_MS = 350;

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  sessionStatus: SessionStatus;
  sessionError: string | null;
  setAuthTokens: (user: User, accessToken: string, refreshToken: string) => void;
  bootstrapSession: () => Promise<User | null>;
  retryBootstrap: () => Promise<User | null>;
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

let bootstrapRequest: Promise<User | null> | null = null;

const delay = (milliseconds: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('Session verification timed out.'));
    }, milliseconds);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isInvalidSession(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = (error as { response?: { status?: number } }).response?.status;
  return status === 401 || status === 403;
}

function clearLocalSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  clearOversightSession();
  setSupabaseRealtimeAuth(null);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Tokens provide session continuity only. Identity and authorization always
  // come from the server before any protected UI is rendered.
  user: null,
  accessToken: savedToken,
  refreshToken: savedRefreshToken,
  sessionStatus: savedToken ? 'loading' : 'ready',
  sessionError: null,
  setAuthTokens: (_user, accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.removeItem('user');
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    } else {
      localStorage.removeItem('refreshToken');
    }
    setSupabaseRealtimeAuth(accessToken);
    // The login payload establishes token ownership only. Roles and permissions
    // remain unavailable until the authoritative /auth/me profile is restored.
    set({ user: null, accessToken, refreshToken, sessionStatus: 'loading', sessionError: null });
  },
  bootstrapSession: async () => {
    if (get().sessionStatus !== 'loading') return get().user;
    if (!bootstrapRequest) {
      bootstrapRequest = Promise.all([
        withTimeout(getCurrentUser(), SESSION_BOOTSTRAP_TIMEOUT_MS),
        delay(SESSION_LOADER_MINIMUM_MS),
      ])
        .then(([user]) => {
          set({ user, sessionStatus: 'ready', sessionError: null });
          return user;
        })
        .catch((error: unknown) => {
          if (isInvalidSession(error) || !get().accessToken) {
            clearLocalSession();
            set({ user: null, accessToken: null, refreshToken: null, sessionStatus: 'ready', sessionError: null });
            return null;
          }
          set({
            user: null,
            sessionStatus: 'error',
            sessionError: 'Session verification could not be completed. Check your connection and try again.',
          });
          return null;
        })
        .finally(() => { bootstrapRequest = null; });
    }
    return bootstrapRequest;
  },
  retryBootstrap: async () => {
    if (!get().accessToken) {
      set({ sessionStatus: 'ready', sessionError: null });
      return null;
    }
    set({ user: null, sessionStatus: 'loading', sessionError: null });
    return get().bootstrapSession();
  },
  logout: () => {
    clearLocalSession();
    set({ user: null, accessToken: null, refreshToken: null, sessionStatus: 'ready', sessionError: null });
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
    sessionError: null,
  }));
});

window.addEventListener('auth:session-expired', () => {
  clearOversightSession();
  setSupabaseRealtimeAuth(null);
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, sessionStatus: 'ready', sessionError: null });
});

setSupabaseRealtimeAuth(savedToken);
