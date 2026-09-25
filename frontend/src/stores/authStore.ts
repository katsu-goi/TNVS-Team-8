import { create } from 'zustand';
import { User } from '../types';
import { setSupabaseRealtimeAuth } from '../lib/supabase';
import { clearOversightSession, getOversightTargetUser } from '../utils/oversightSession';
import { getDashboardPathForRoles } from '../config/roleRegistry';
import { getCurrentUser } from '../api/authService';
import {
  SESSION_SIGNAL_STORAGE_KEY,
  SessionEndReason,
  clearIdleSessionState,
  parseSessionSignal,
  publishSessionSignal,
  setSessionEndReason,
  writeLastActivityAt,
} from '../session/sessionState';

export type SessionStatus = 'loading' | 'ready' | 'error';

export const SESSION_BOOTSTRAP_TIMEOUT_MS = 15_000;

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  sessionStatus: SessionStatus;
  sessionError: string | null;
  setAuthTokens: (user: User, accessToken: string, refreshToken: string) => void;
  updateSessionTokens: (accessToken: string, refreshToken: string) => void;
  acceptVerifiedUser: (user: User) => void;
  verifyLoginSession: () => Promise<User | null>;
  bootstrapSession: () => Promise<User | null>;
  retryBootstrap: () => Promise<User | null>;
  logout: (reason?: SessionEndReason, broadcast?: boolean) => void;
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
  clearIdleSessionState();
  setSupabaseRealtimeAuth(null);
}

function applySessionEndReason(reason: SessionEndReason) {
  setSessionEndReason(reason);
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
    writeLastActivityAt(Date.now());
    setSessionEndReason('manual');
    // The login payload establishes token ownership only. Keep the login page
    // mounted while /auth/me verifies roles and permissions in the submit flow.
    set({ user: null, accessToken, refreshToken, sessionStatus: 'ready', sessionError: null });
  },
  updateSessionTokens: (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setSupabaseRealtimeAuth(accessToken);
    set((state) => ({
      ...state,
      accessToken,
      refreshToken,
      sessionStatus: 'ready',
      sessionError: null,
    }));
  },
  acceptVerifiedUser: (user) => {
    set({ user, sessionStatus: 'ready', sessionError: null });
  },
  verifyLoginSession: async () => {
    if (!get().accessToken) return null;
    try {
      const user = await withTimeout(getCurrentUser(), SESSION_BOOTSTRAP_TIMEOUT_MS);
      set({ user, sessionStatus: 'ready', sessionError: null });
      return user;
    } catch (error) {
      clearLocalSession();
      set({ user: null, accessToken: null, refreshToken: null, sessionStatus: 'ready', sessionError: null });
      throw error;
    }
  },
  bootstrapSession: async () => {
    if (get().sessionStatus !== 'loading') return get().user;
    if (!bootstrapRequest) {
      bootstrapRequest = withTimeout(getCurrentUser(), SESSION_BOOTSTRAP_TIMEOUT_MS)
        .then((user) => {
          set({ user, sessionStatus: 'ready', sessionError: null });
          return user;
        })
        .catch((error: unknown) => {
          if (isInvalidSession(error) || !get().accessToken) {
            if (isInvalidSession(error)) {
              applySessionEndReason('expired');
              publishSessionSignal({ type: 'logout', at: Date.now(), source: 'session-bootstrap', reason: 'expired' });
            }
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
  logout: (reason = 'manual', broadcast = true) => {
    applySessionEndReason(reason);
    if (broadcast) {
      publishSessionSignal({ type: 'logout', at: Date.now(), source: 'auth-store', reason });
    }
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

window.addEventListener('auth:session-expired', (event) => {
  const reason = (event as CustomEvent<{ reason?: SessionEndReason }>).detail?.reason ?? 'expired';
  applySessionEndReason(reason);
  clearOversightSession();
  clearIdleSessionState();
  setSupabaseRealtimeAuth(null);
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, sessionStatus: 'ready', sessionError: null });
});

window.addEventListener('storage', (event) => {
  if (event.key === SESSION_SIGNAL_STORAGE_KEY) {
    const signal = parseSessionSignal(event.newValue);
    if (signal?.type === 'logout') {
      applySessionEndReason(signal.reason ?? 'expired');
      clearLocalSession();
      useAuthStore.setState({
        user: null,
        accessToken: null,
        refreshToken: null,
        sessionStatus: 'ready',
        sessionError: null,
      });
    }
    return;
  }

  if (event.key === 'accessToken' || event.key === 'refreshToken') {
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');
    if (!accessToken || !refreshToken) {
      clearLocalSession();
      useAuthStore.setState({
        user: null,
        accessToken: null,
        refreshToken: null,
        sessionStatus: 'ready',
        sessionError: null,
      });
      return;
    }
    setSupabaseRealtimeAuth(accessToken);
    useAuthStore.setState({ accessToken, refreshToken, sessionStatus: 'ready', sessionError: null });
  }
});

setSupabaseRealtimeAuth(savedToken);
