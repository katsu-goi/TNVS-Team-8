export const IDLE_THRESHOLD_MS = 5 * 60_000;
export const IDLE_WARNING_DURATION_MS = 60_000;
export const ACTIVITY_WRITE_THROTTLE_MS = 5_000;

export const LAST_ACTIVITY_STORAGE_KEY = 'tnvs.auth.lastMeaningfulActivityAt';
export const SESSION_SIGNAL_STORAGE_KEY = 'tnvs.auth.sessionSignal';
export const SESSION_END_REASON_STORAGE_KEY = 'tnvs.auth.sessionEndReason';
export const SESSION_CHANNEL_NAME = 'tnvs-auth-session';
export const CONTINUATION_LOCK_STORAGE_KEY = 'tnvs.auth.continuationLock';
export const MEANINGFUL_ACTIVITY_EVENT = 'auth:meaningful-activity';

export function persistSessionTokens(accessToken: string, refreshToken: string): void {
  const storage = safeStorage(globalThis.localStorage);
  if (!storage) return;
  // The access token is the cross-tab commit marker. Write the refresh token
  // first so another tab never observes a new access token paired with the
  // previous (or missing) refresh token.
  storage.setItem('refreshToken', refreshToken);
  storage.setItem('accessToken', accessToken);
}

export function clearPersistedSessionTokens(): void {
  const storage = safeStorage(globalThis.localStorage);
  if (!storage) return;
  // Mirror the commit order above: removing accessToken publishes the final,
  // complete logged-out state to other tabs.
  storage.removeItem('refreshToken');
  storage.removeItem('accessToken');
}

export type SessionEndReason = 'manual' | 'inactivity' | 'expired';
export type SessionSignal = {
  type: 'activity' | 'warning' | 'continuing' | 'continued' | 'continue-failed' | 'logout';
  at: number;
  source: string;
  reason?: SessionEndReason;
};

function safeStorage(storage: Storage | undefined): Storage | null {
  try {
    return storage ?? null;
  } catch {
    return null;
  }
}

export function readLastActivityAt(now = Date.now()): number | null {
  const storage = safeStorage(globalThis.localStorage);
  const value = Number(storage?.getItem(LAST_ACTIVITY_STORAGE_KEY));
  return Number.isFinite(value) && value > 0 && value <= now ? value : null;
}

export function writeLastActivityAt(timestamp: number): void {
  safeStorage(globalThis.localStorage)?.setItem(LAST_ACTIVITY_STORAGE_KEY, String(timestamp));
}

export function clearIdleSessionState(): void {
  safeStorage(globalThis.localStorage)?.removeItem(LAST_ACTIVITY_STORAGE_KEY);
}

export function publishSessionSignal(signal: SessionSignal): void {
  safeStorage(globalThis.localStorage)?.setItem(
    SESSION_SIGNAL_STORAGE_KEY,
    JSON.stringify({ ...signal, nonce: crypto.randomUUID?.() ?? `${signal.at}-${Math.random()}` }),
  );
}

export function parseSessionSignal(value: string | null): SessionSignal | null {
  if (!value) return null;
  try {
    const signal = JSON.parse(value) as Partial<SessionSignal>;
    if (!['activity', 'warning', 'continuing', 'continued', 'continue-failed', 'logout'].includes(String(signal.type))) return null;
    if (!Number.isFinite(signal.at) || typeof signal.source !== 'string') return null;
    if (signal.reason && !['manual', 'inactivity', 'expired'].includes(signal.reason)) return null;
    return signal as SessionSignal;
  } catch {
    return null;
  }
}

export function setSessionEndReason(reason: SessionEndReason): void {
  const storage = safeStorage(globalThis.sessionStorage);
  if (reason === 'manual') storage?.removeItem(SESSION_END_REASON_STORAGE_KEY);
  else storage?.setItem(SESSION_END_REASON_STORAGE_KEY, reason);
}

export function consumeSessionEndReason(): SessionEndReason | null {
  const storage = safeStorage(globalThis.sessionStorage);
  const value = storage?.getItem(SESSION_END_REASON_STORAGE_KEY);
  storage?.removeItem(SESSION_END_REASON_STORAGE_KEY);
  return value === 'inactivity' || value === 'expired' ? value : null;
}

export function formatIdleCountdown(remainingMilliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMilliseconds / 1000));
  return `00:${String(seconds).padStart(2, '0')}`;
}
