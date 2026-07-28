import { apiClient } from './client';
import { User } from '../types';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

export async function login(req: LoginRequest): Promise<AuthTokenResponse> {
  const { data } = await apiClient.post('/auth/login', req);
  return data.data;
}

export async function refreshToken(token: string): Promise<AuthTokenResponse> {
  const { data } = await apiClient.post('/auth/refresh', { refreshToken: token });
  return data.data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout');
  } catch {}
}
