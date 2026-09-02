import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, LogOut, Timer } from 'lucide-react';
import {
  getCurrentOversightSession,
  OversightSession,
  stopOversightSession,
} from '../../api/oversightService';
import { getDashboardPath, useAuthStore } from '../../stores/authStore';
import { getOversightSessionId } from '../../utils/oversightSession';

export const OversightBanner: React.FC = () => {
  const actor = useAuthStore((state) => state.user);
  const [session, setSession] = useState<OversightSession | null>(null);
  const [stopping, setStopping] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    if (!getOversightSessionId()) {
      setSession(null);
      return;
    }
    try {
      setSession(await getCurrentOversightSession());
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onChanged = () => refresh();
    window.addEventListener('oversight:changed', onChanged);
    return () => window.removeEventListener('oversight:changed', onChanged);
  }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [session]);

  if (!session) return null;

  const secondsRemaining = Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - now) / 1000));
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  const exit = async () => {
    setStopping(true);
    try {
      await stopOversightSession();
      window.location.assign(getDashboardPath(actor));
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[100] border-b border-amber-300 bg-amber-100 px-4 py-2 text-amber-950 shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              ADMINISTRATIVE NOTICE: Currently Impersonating Session as {session.targetUser.email} | Viewing Active Layout in Read-Only Mode.
            </p>
            <p className="truncate text-xs text-amber-800">All changes are blocked and this session is immutably audited.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1 font-mono text-xs"><Timer className="h-4 w-4" />{minutes}:{seconds.toString().padStart(2, '0')}</span>
          <button
            onClick={exit}
            disabled={stopping}
            className="inline-flex items-center gap-2 rounded-full bg-amber-900 px-4 py-2 text-xs font-bold text-white hover:bg-amber-950 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />{stopping ? 'Exiting...' : 'Exit Impersonation Mode'}
          </button>
        </div>
      </div>
    </div>
  );
};
