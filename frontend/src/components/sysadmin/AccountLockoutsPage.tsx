import React, { useCallback, useEffect, useState } from 'react';
import { LockKeyhole, RefreshCw, UnlockKeyhole } from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import { rbacService, RbacUser } from '../../api/rbacService';

export const AccountLockoutsPage: React.FC = () => {
  const [users, setUsers] = useState<RbacUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await rbacService.listLockedUsers());
    } catch (reason) {
      setError(extractErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unlock = async (user: RbacUser) => {
    setBusyId(user.id);
    setError('');
    setMessage('');
    try {
      await rbacService.unlockUser(user.id);
      setMessage(`${user.email} unlocked successfully.`);
      await load();
    } catch (reason) {
      setError(extractErrorMessage(reason));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel flex items-center justify-between p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2"><LockKeyhole className="h-5 w-5 text-amber-700" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Account Lockouts</h1>
            <p className="text-xs text-slate-500">Review login-locked profiles and restore access.</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:text-slate-900 disabled:opacity-50" title="Refresh locked accounts">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Loading locked accounts...</div>
        ) : users.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">No active account lockouts.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {users.map((user) => (
              <div key={user.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-full bg-rose-50 p-2 text-rose-600"><LockKeyhole className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{user.fullName}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                    {user.lockedUntil && <p className="text-[11px] text-amber-700">Locked until {new Date(user.lockedUntil).toLocaleString()}</p>}
                  </div>
                </div>
                <button onClick={() => unlock(user)} disabled={busyId === user.id} className="inline-flex items-center gap-2 rounded-lg bg-[#D02F34] px-3 py-2 text-xs font-semibold text-white hover:bg-[#A9252A] disabled:opacity-50">
                  <UnlockKeyhole className="h-4 w-4" />{busyId === user.id ? 'Unlocking...' : 'Unlock Account'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
