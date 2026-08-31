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

/**
 * Server-side lockout state attached to a failed-login error response. The
 * The server exposes an absolute retry timestamp. Account counters and
 * existence stay private to prevent enumeration.
 */
export interface LoginLockoutInfo {
  lockSecondsRemaining: number;
  retryAt: string | null;
}

export interface HrAssistanceRequest {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function login(req: LoginRequest): Promise<AuthTokenResponse> {
  const { data } = await apiClient.post('/auth/login', {
    ...req,
    email: req.email.trim().toLowerCase(),
  });
  if (data?.data) {
    return data.data;
  }
  throw new Error('Login failed');
}

export async function refreshToken(token: string): Promise<AuthTokenResponse> {
  const { data } = await apiClient.post('/auth/refresh', { refreshToken: token });
  return data.data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout', {
      refreshToken: localStorage.getItem('refreshToken'),
    });
  } catch {}
}

export async function requestHrAssistance(req: HrAssistanceRequest): Promise<void> {
  await apiClient.post('/auth/hr/assistance', req);
}

/** Extracts the server lockout payload from an axios login error, if present. */
export function extractLoginLockout(error: unknown): LoginLockoutInfo | null {
  if (!error || typeof error !== 'object') return null;
  const errObj = error as Record<string, any>;
  const payload = errObj?.response?.data?.data;
  if (!payload || typeof payload !== 'object') return null;
  const retryAt = typeof payload.retryAt === 'string' ? payload.retryAt : null;
  const lockSecondsRemaining = typeof payload.lockSecondsRemaining === 'number'
    ? payload.lockSecondsRemaining
    : 0;
  return { retryAt, lockSecondsRemaining };
}
