import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  otpRequired: boolean;
  pendingUsername: string | null;
  setLoginInit: (username: string) => void;
  setAuthTokens: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  otpRequired: false,
  pendingUsername: null,
  setLoginInit: (username) => set({ otpRequired: true, pendingUsername: username }),
  setAuthTokens: (user, accessToken, refreshToken) =>
    set({ user, accessToken, refreshToken, otpRequired: false, pendingUsername: null }),
  logout: () => set({ user: null, accessToken: null, refreshToken: null, otpRequired: false }),
}));
