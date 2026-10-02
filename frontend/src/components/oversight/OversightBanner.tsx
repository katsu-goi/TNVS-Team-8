import React, { useCallback, useEffect, useState } from 'react';
import { Eye, LogOut, ShieldAlert, Timer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getCurrentOversightSession,
  OversightSession,
  stopOversightSession,
} from '../../api/oversightService';
import { getOversightSessionId, OVERSIGHT_SESSION_ID_KEY, OVERSIGHT_TARGET_USER_KEY } from '../../utils/oversightSession';

function targetName(session: OversightSession): string {
  return session.targetUser.fullName?.trim()
    || [session.targetUser.firstName, session.targetUser.lastName].filter(Boolean).join(' ')
    || session.targetUser.email;
}

export const OversightBanner: React.FC = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<OversightSession | null>(null);
  const [stopping, setStopping] = useState(false);
  const [now, setNow] = useState(Date.now());

  const returnToOversight = useCallback((reason?: 'expired' | 'target-unavailable') => {
    setSession(null);
    navigate(`/super-admin/user-oversight${reason ? `?oversight=${reason}` : ''}`, { replace: true });
  }, [navigate]);

  const refresh = useCallback(async () => {
    if (!getOversightSessionId()) {
      setSession(null);
      return;
    }
    try {
      const current = await getCurrentOversightSession();
      setSession(current);
      if (!current) returnToOversight();
    } catch (error) {
      const status = Number((error as { response?: { status?: unknown } })?.response?.status);
      setSession(null);
      if (status === 410) returnToOversight('expired');
      if (status === 409) returnToOversight('target-unavailable');
    }
  }, [returnToOversight]);

  useEffect(() => {
    const onChanged = () => { void refresh(); };
    const onExpired = () => returnToOversight('expired');
    const onTerminated = () => returnToOversight('target-unavailable');
    const onStorage = (event: StorageEvent) => {
      if (event.key === OVERSIGHT_SESSION_ID_KEY || event.key === OVERSIGHT_TARGET_USER_KEY) void refresh();
    };
    window.addEventListener('oversight:changed', onChanged);
    window.addEventListener('oversight:expired', onExpired);
    window.addEventListener('oversight:terminated', onTerminated);
    window.addEventListener('storage', onStorage);
    void refresh();
    return () => {
      window.removeEventListener('oversight:changed', onChanged);
      window.removeEventListener('oversight:expired', onExpired);
      window.removeEventListener('oversight:terminated', onTerminated);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh, returnToOversight]);

  useEffect(() => {
    if (!session || session.manualTerminationRequired) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (!session?.expiresAt || session.manualTerminationRequired) return;
    if (Date.parse(session.expiresAt) <= now) void refresh();
  }, [now, refresh, session]);

  if (!session) return null;

  const secondsRemaining = session.expiresAt
    ? Math.max(0, Math.ceil((Date.parse(session.expiresAt) - now) / 1000))
    : null;
  const remaining = secondsRemaining == null
    ? 'Until manually ended'
    : `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}`;

  const exit = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await stopOversightSession();
      returnToOversight();
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="sticky inset-x-0 top-0 z-[100] border-b border-rose-300 bg-gradient-to-r from-rose-950 via-[#8E1820] to-rose-950 px-4 py-2.5 text-white shadow-lg" role="status" aria-label="Active Super Admin oversight session">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <span className="rounded-lg bg-white/10 p-2"><ShieldAlert className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-rose-100">
              Super Admin Oversight <span className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] text-white">Full Access</span>
            </p>
            <p className="truncate text-sm font-semibold">You are accessing the system as {targetName(session)} <span className="font-normal text-rose-100">· {session.targetUser.email}</span></p>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1.5 font-mono text-xs"><Timer className="h-4 w-4" />Remaining: {remaining}</span>
          <button onClick={() => void exit()} disabled={stopping} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-rose-900 hover:bg-rose-50 disabled:opacity-60">
            {stopping ? <Eye className="h-4 w-4 animate-pulse" /> : <LogOut className="h-4 w-4" />}{stopping ? 'Ending...' : 'End Oversight Session'}
          </button>
        </div>
      </div>
    </div>
  );
};
