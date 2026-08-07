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

const savedToken = localStorage.getItem('accessToken');
const savedRefreshToken = localStorage.getItem('refreshToken');

function loadSavedUser(): User | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
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
