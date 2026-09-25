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
 * Server responses expose an absolute retry timestamp. Account counters and
 * existence stay private to prevent enumeration.
 */
export interface LoginLockoutInfo {
  retryAfterSeconds: number;
  lockedUntil: string;
  retryAt: string;
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

export async function getCurrentUser(): Promise<User> {
  const { data } = await apiClient.get('/auth/me');
  const user = data?.data as User | undefined;
  if (!user?.id || !user.email || !Array.isArray(user.assignedRoles)) {
    throw new Error('The server returned an invalid session profile.');
  }
  return user;
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
  const response = errObj.response;
  const envelope = response?.data;
  const payload = envelope?.data;
  if (envelope?.errorCode !== 'ACCOUNT_TEMPORARILY_LOCKED' || !payload || typeof payload !== 'object') {
    return null;
  }
  const headerValue = response?.headers?.['retry-after'] ?? response?.headers?.get?.('retry-after');
  const payloadSeconds = Number(payload.retry_after_seconds ?? payload.retryAfterSeconds);
  const headerSeconds = Number(headerValue);
  const lockedUntil = String(payload.locked_until ?? payload.lockedUntil ?? '');
  const parsedLockedUntil = Date.parse(lockedUntil);
  const retryAfterSeconds = Number.isFinite(payloadSeconds) && payloadSeconds > 0
    ? Math.ceil(payloadSeconds)
    : Number.isFinite(headerSeconds) && headerSeconds > 0
      ? Math.ceil(headerSeconds)
      : 0;
  const retryAt = Number.isFinite(parsedLockedUntil) && parsedLockedUntil > Date.now()
    ? new Date(parsedLockedUntil).toISOString()
    : retryAfterSeconds > 0
      ? new Date(Date.now() + retryAfterSeconds * 1000).toISOString()
      : null;
  if (!retryAt) return null;
  return {
    retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(retryAt) - Date.now()) / 1000)),
    lockedUntil: retryAt,
    retryAt,
  };
}
