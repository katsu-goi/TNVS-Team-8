import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, logout as apiLogout, refreshToken as refreshAuthToken } from '../../api/authService';
import { useAuthStore } from '../../stores/authStore';
import {
  ACTIVITY_WRITE_THROTTLE_MS,
  CONTINUATION_LOCK_STORAGE_KEY,
  IDLE_THRESHOLD_MS,
  IDLE_WARNING_DURATION_MS,
  LAST_ACTIVITY_STORAGE_KEY,
  MEANINGFUL_ACTIVITY_EVENT,
  SESSION_CHANNEL_NAME,
  SESSION_SIGNAL_STORAGE_KEY,
  SessionEndReason,
  SessionSignal,
  formatIdleCountdown,
  parseSessionSignal,
  publishSessionSignal,
  readLastActivityAt,
  writeLastActivityAt,
} from '../../session/sessionState';

type SessionIdleManagerProps = {
  children: React.ReactNode;
  idleThresholdMs?: number;
  warningDurationMs?: number;
  activityThrottleMs?: number;
  tickMs?: number;
};

const INTERACTION_EVENTS: Array<keyof WindowEventMap> = [
  'pointerdown', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click',
];
const SESSION_VERIFICATION_TIMEOUT_MS = 10_000;
const SERVER_LOGOUT_TIMEOUT_MS = 5_000;
const CONTINUATION_LOCK_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Session verification timed out.')), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function isInvalidSession(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = (error as { response?: { status?: number } }).response?.status;
  return status === 401 || status === 403;
}

async function withContinuationLock(source: string, task: () => Promise<void>): Promise<boolean> {
  if (navigator.locks?.request) {
    return navigator.locks.request(
      'tnvs-session-continuation',
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        if (!lock) return false;
        await task();
        return true;
      },
    );
  }

  const now = Date.now();
  try {
    const existing = JSON.parse(localStorage.getItem(CONTINUATION_LOCK_STORAGE_KEY) ?? 'null') as {
      source?: string;
      expiresAt?: number;
    } | null;
    if (existing?.source !== source && Number(existing?.expiresAt) > now) return false;
  } catch {
    // A malformed stale lock is replaced below.
  }

  const lock = { source, expiresAt: now + CONTINUATION_LOCK_TIMEOUT_MS };
  localStorage.setItem(CONTINUATION_LOCK_STORAGE_KEY, JSON.stringify(lock));
  try {
    const confirmed = JSON.parse(localStorage.getItem(CONTINUATION_LOCK_STORAGE_KEY) ?? 'null') as typeof lock | null;
    if (confirmed?.source !== source) return false;
    await task();
    return true;
  } finally {
    try {
      const current = JSON.parse(localStorage.getItem(CONTINUATION_LOCK_STORAGE_KEY) ?? 'null') as typeof lock | null;
      if (current?.source === source) localStorage.removeItem(CONTINUATION_LOCK_STORAGE_KEY);
    } catch {
      localStorage.removeItem(CONTINUATION_LOCK_STORAGE_KEY);
    }
  }
}

function SessionWarningDialog({
  remainingMs,
  continuing,
  verificationError,
  onContinue,
  onLogout,
}: {
  remainingMs: number;
  continuing: boolean;
  verificationError: string;
  onContinue: () => void;
  onLogout: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const [announcement, setAnnouncement] = useState('60 seconds remaining.');

  useEffect(() => {
    continueRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    if ([60, 30, 10, 0].includes(seconds)) {
      setAnnouncement(seconds === 0 ? 'Session ending now.' : `${seconds} seconds remaining.`);
    }
  }, [seconds]);

  useEffect(() => {
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus, true);
    return () => document.removeEventListener('keydown', trapFocus, true);
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-session-title"
        aria-describedby="idle-session-description"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0B1F3A] text-white shadow-2xl"
      >
        <div className="border-b border-white/10 bg-[#08182D] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D02F34]/20 text-[#FF7377]">
              <Clock3 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FFC629]">Session expiring</p>
              <h2 id="idle-session-title" className="mt-0.5 text-xl font-bold">Are you still there?</h2>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-5 py-6 text-center sm:px-6">
          <p id="idle-session-description" className="text-sm leading-6 text-slate-300">
            For your security, you will be signed out after 5 minutes of inactivity.
          </p>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Session ends in</p>
            <p className="mt-2 font-mono text-5xl font-bold tabular-nums text-white" aria-hidden="true">
              {formatIdleCountdown(remainingMs)}
            </p>
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
          </div>
          {verificationError ? (
            <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {verificationError}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              ref={continueRef}
              type="button"
              disabled={continuing}
              onClick={onContinue}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#D02F34] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#A9252A] focus:outline-none focus:ring-2 focus:ring-[#FF7377] focus:ring-offset-2 focus:ring-offset-[#0B1F3A] disabled:cursor-wait disabled:opacity-70"
            >
              {continuing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              {continuing ? 'Continuing session…' : 'Stay Signed In'}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-[#0B1F3A]"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const SessionIdleManager: React.FC<SessionIdleManagerProps> = ({
  children,
  idleThresholdMs = IDLE_THRESHOLD_MS,
  warningDurationMs = IDLE_WARNING_DURATION_MS,
  activityThrottleMs = ACTIVITY_WRITE_THROTTLE_MS,
  tickMs = 250,
}) => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const updateSessionTokens = useAuthStore((state) => state.updateSessionTokens);
  const acceptVerifiedUser = useAuthStore((state) => state.acceptVerifiedUser);
  const logout = useAuthStore((state) => state.logout);
  const authenticated = Boolean(user && accessToken && refreshToken);
  const sourceRef = useRef(crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastActivityRef = useRef(0);
  const lastWriteRef = useRef(0);
  const warningRef = useRef(false);
  const continuingRef = useRef(false);
  const continuingStartedAtRef = useRef(0);
  const loggingOutRef = useRef(false);
  const [warning, setWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(warningDurationMs);
  const [continuing, setContinuing] = useState(false);
  const [verificationError, setVerificationError] = useState('');

  const sendSignal = useCallback((signal: SessionSignal) => {
    publishSessionSignal(signal);
    channelRef.current?.postMessage(signal);
  }, []);

  const closeWarning = useCallback(() => {
    warningRef.current = false;
    continuingRef.current = false;
    continuingStartedAtRef.current = 0;
    setWarning(false);
    setContinuing(false);
    setVerificationError('');
  }, []);

  const finishLogout = useCallback(async (reason: SessionEndReason) => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    continuingRef.current = false;
    continuingStartedAtRef.current = 0;
    setContinuing(false);
    try {
      await Promise.race([
        apiLogout(reason === 'inactivity' ? 'INACTIVITY' : 'MANUAL'),
        new Promise<void>((resolve) => window.setTimeout(resolve, SERVER_LOGOUT_TIMEOUT_MS)),
      ]);
    } finally {
      logout(reason);
      navigate('/login', { replace: true });
    }
  }, [logout, navigate]);

  const recordActivity = useCallback((force = false) => {
    if (!authenticated || warningRef.current || continuingRef.current) return;
    const now = Date.now();
    if (!force && now - lastWriteRef.current < activityThrottleMs) return;
    lastWriteRef.current = now;
    lastActivityRef.current = now;
    writeLastActivityAt(now);
    window.dispatchEvent(new CustomEvent(MEANINGFUL_ACTIVITY_EVENT, { detail: { at: now } }));
    sendSignal({ type: 'activity', at: now, source: sourceRef.current });
  }, [activityThrottleMs, authenticated, sendSignal]);

  const showWarning = useCallback((startedAt: number) => {
    if (warningRef.current || loggingOutRef.current) return;
    warningRef.current = true;
    setWarning(true);
    setRemainingMs(Math.max(0, startedAt + warningDurationMs - Date.now()));
    sendSignal({ type: 'warning', at: startedAt, source: sourceRef.current });
  }, [sendSignal, warningDurationMs]);

  const evaluateDeadline = useCallback(() => {
    if (!authenticated || loggingOutRef.current) return;
    const now = Date.now();
    if (continuingRef.current && now - continuingStartedAtRef.current >= CONTINUATION_LOCK_TIMEOUT_MS) {
      continuingRef.current = false;
      continuingStartedAtRef.current = 0;
      setContinuing(false);
      setVerificationError('Unable to verify your session. Check your connection or log out.');
    }
    const warningStartsAt = lastActivityRef.current + idleThresholdMs;
    const expiresAt = warningStartsAt + warningDurationMs;
    if (now >= expiresAt) {
      setRemainingMs(0);
      if (!continuingRef.current) void finishLogout('inactivity');
      return;
    }
    if (now >= warningStartsAt) {
      showWarning(warningStartsAt);
      setRemainingMs(expiresAt - now);
    }
  }, [authenticated, finishLogout, idleThresholdMs, showWarning, warningDurationMs]);

  const handleSignal = useCallback((signal: SessionSignal) => {
    if (signal.source === sourceRef.current) return;
    if (signal.type === 'activity') {
      if (!warningRef.current && signal.at > lastActivityRef.current) {
        lastActivityRef.current = signal.at;
        lastWriteRef.current = signal.at;
      }
      return;
    }
    if (signal.type === 'warning') {
      showWarning(signal.at);
      return;
    }
    if (signal.type === 'continuing') {
      continuingRef.current = true;
      continuingStartedAtRef.current = signal.at;
      setContinuing(true);
      setVerificationError('');
      return;
    }
    if (signal.type === 'continued') {
      const storedAccessToken = localStorage.getItem('accessToken');
      const storedRefreshToken = localStorage.getItem('refreshToken');
      if (!storedAccessToken || !storedRefreshToken) {
        void finishLogout('expired');
        return;
      }
      updateSessionTokens(storedAccessToken, storedRefreshToken);
      lastActivityRef.current = signal.at;
      lastWriteRef.current = signal.at;
      writeLastActivityAt(signal.at);
      closeWarning();
      return;
    }
    if (signal.type === 'continue-failed') {
      continuingRef.current = false;
      continuingStartedAtRef.current = 0;
      setContinuing(false);
      setVerificationError('Unable to verify your session. Check your connection or log out.');
      return;
    }
    if (signal.type === 'logout') {
      logout(signal.reason ?? 'expired', false);
      navigate('/login', { replace: true });
    }
  }, [closeWarning, finishLogout, logout, navigate, showWarning, updateSessionTokens]);

  useEffect(() => {
    if (!authenticated) {
      closeWarning();
      loggingOutRef.current = false;
      return undefined;
    }

    const now = Date.now();
    const restored = readLastActivityAt(now);
    lastActivityRef.current = restored ?? now;
    lastWriteRef.current = lastActivityRef.current;
    if (restored === null) writeLastActivityAt(now);

    if ('BroadcastChannel' in window) {
      channelRef.current = new BroadcastChannel(SESSION_CHANNEL_NAME);
      channelRef.current.onmessage = (event: MessageEvent<SessionSignal>) => handleSignal(event.data);
    }

    const onActivity = () => recordActivity();
    const onStorage = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_STORAGE_KEY && event.newValue) {
        const timestamp = Number(event.newValue);
        if (!warningRef.current && Number.isFinite(timestamp) && timestamp > lastActivityRef.current) {
          lastActivityRef.current = timestamp;
          lastWriteRef.current = timestamp;
        }
      } else if (event.key === SESSION_SIGNAL_STORAGE_KEY) {
        const signal = parseSessionSignal(event.newValue);
        if (signal) handleSignal(signal);
      }
    };
    const onVisibilityChange = () => evaluateDeadline();

    for (const eventName of INTERACTION_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibilityChange);
    evaluateDeadline();
    const timer = window.setInterval(evaluateDeadline, tickMs);

    return () => {
      window.clearInterval(timer);
      for (const eventName of INTERACTION_EVENTS) window.removeEventListener(eventName, onActivity);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [authenticated, closeWarning, evaluateDeadline, handleSignal, recordActivity, tickMs]);

  const continueSession = async () => {
    if (continuingRef.current || loggingOutRef.current || !refreshToken) return;
    continuingRef.current = true;
    continuingStartedAtRef.current = Date.now();
    setContinuing(true);
    setVerificationError('');
    sendSignal({ type: 'continuing', at: Date.now(), source: sourceRef.current });

    const acquired = await withContinuationLock(sourceRef.current, async () => {
      try {
        const currentRefreshToken = useAuthStore.getState().refreshToken;
        if (!currentRefreshToken) throw { response: { status: 401 } };
        const verifiedUser = await withTimeout((async () => {
          const refreshed = await refreshAuthToken(currentRefreshToken);
          updateSessionTokens(refreshed.accessToken, refreshed.refreshToken);
          return getCurrentUser();
        })(), SESSION_VERIFICATION_TIMEOUT_MS);
        acceptVerifiedUser(verifiedUser);
        const now = Date.now();
        lastActivityRef.current = now;
        lastWriteRef.current = now;
        writeLastActivityAt(now);
        window.dispatchEvent(new CustomEvent(MEANINGFUL_ACTIVITY_EVENT, { detail: { at: now } }));
        sendSignal({ type: 'continued', at: now, source: sourceRef.current });
        closeWarning();
      } catch (error) {
        continuingRef.current = false;
        continuingStartedAtRef.current = 0;
        setContinuing(false);
        if (isInvalidSession(error)) {
          await finishLogout('expired');
          return;
        }
        setVerificationError('Unable to verify your session. Check your connection or log out.');
        sendSignal({ type: 'continue-failed', at: Date.now(), source: sourceRef.current });
        if (Date.now() >= lastActivityRef.current + idleThresholdMs + warningDurationMs) {
          await finishLogout('inactivity');
        }
      }
    });

    if (!acquired) {
      // Another tab owns the refresh-token rotation. Its continued/failure
      // signal will resolve this tab without issuing a competing request.
      return;
    }
  };

  return (
    <>
      {children}
      {authenticated && warning ? (
        <SessionWarningDialog
          remainingMs={remainingMs}
          continuing={continuing}
          verificationError={verificationError}
          onContinue={() => { void continueSession(); }}
          onLogout={() => { void finishLogout('manual'); }}
        />
      ) : null}
    </>
  );
};
