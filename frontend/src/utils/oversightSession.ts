import type { User } from '../types';

export const OVERSIGHT_SESSION_ID_KEY = 'oversightSessionId';
export const OVERSIGHT_TARGET_USER_KEY = 'oversightTargetUser';

export function getOversightSessionId(): string | null {
  return localStorage.getItem(OVERSIGHT_SESSION_ID_KEY);
}

export function getOversightTargetUser(): User | null {
  const raw = localStorage.getItem(OVERSIGHT_TARGET_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    clearOversightSession();
    return null;
  }
}

export function persistOversightSession(sessionId: string, targetUser: User): void {
  localStorage.setItem(OVERSIGHT_SESSION_ID_KEY, sessionId);
  localStorage.setItem(OVERSIGHT_TARGET_USER_KEY, JSON.stringify(targetUser));
  window.dispatchEvent(new Event('oversight:changed'));
}

export function clearOversightSession(): void {
  localStorage.removeItem(OVERSIGHT_SESSION_ID_KEY);
  localStorage.removeItem(OVERSIGHT_TARGET_USER_KEY);
  window.dispatchEvent(new Event('oversight:changed'));
}
