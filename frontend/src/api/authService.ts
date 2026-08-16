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
 * counters here are authoritative database state - the client uses them only
 * to render the attempt progress and the progressive countdown, never as the
 * security mechanism itself.
 */
export interface LoginLockoutInfo {
  failedAttempts: number;
  maxAttempts: number;
  remainingAttempts: number;
  lockSecondsRemaining: number;
  permanentlyLocked: boolean;
  lockedUntil?: string;
}

export interface HrAssistanceRequest {
  name: string;
  email: string;
  subject: string;
  message: string;
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

export async function requestHrAssistance(req: HrAssistanceRequest): Promise<void> {
  await apiClient.post('/auth/hr/assistance', req);
}

/** Extracts the server lockout payload from an axios login error, if present. */
export function extractLoginLockout(error: unknown): LoginLockoutInfo | null {
  if (!error || typeof error !== 'object') return null;
  const errObj = error as Record<string, any>;
  const payload = errObj?.response?.data?.data;
  if (!payload || typeof payload !== 'object') return null;
  return payload as LoginLockoutInfo;
}
