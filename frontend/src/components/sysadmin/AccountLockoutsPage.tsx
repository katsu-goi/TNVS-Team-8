import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, UnlockKeyhole } from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import { rbacService, RbacUser } from '../../api/rbacService';
import { DashboardHero } from '../ui/DashboardPrimitives';
import { DataTable, DataTableStatusBadge, type DataTableColumn } from '../ui/data-table';

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
      <DashboardHero title="Account Lockouts" subtitle="Review login-locked profiles and restore access." actions={
        <button onClick={load} disabled={loading} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:text-slate-900 disabled:opacity-50" title="Refresh locked accounts">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      } />

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      <DataTable
        data={users}
        rowKey={(row) => row.id}
        caption="Locked user accounts"
        loading={loading}
        error={error || null}
        onRetry={() => void load()}
        columns={[
          { id: 'identity', header: 'User', searchableValue: (row) => `${row.fullName} ${row.email}`, cell: (row) => <><p className="font-semibold text-slate-900">{row.fullName}</p><p className="text-xs text-slate-500">{row.email}</p></>, sortable: true },
          { id: 'employeeId', header: 'Employee ID', accessor: (row) => row.employeeId || '—', sortable: true, optional: true },
          { id: 'status', header: 'Status', accessor: () => <DataTableStatusBadge value="LOCKED" />, sortable: false },
          { id: 'lockedUntil', header: 'Locked until', accessor: (row) => row.lockedUntil ? new Date(row.lockedUntil).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Manual unlock required', sortValue: (row) => row.lockedUntil ? new Date(row.lockedUntil) : null, sortable: true },
        ] satisfies DataTableColumn<RbacUser>[]}
        searchableText={(row) => `${row.fullName} ${row.email} ${row.employeeId ?? ''}`}
        searchPlaceholder="Search locked accounts…"
        onRefresh={() => void load()}
        rowActions={(row) => <button type="button" onClick={() => void unlock(row)} disabled={busyId === row.id} className="inline-flex items-center gap-2 rounded-lg bg-[#D02F34] px-3 py-2 text-xs font-semibold text-white hover:bg-[#A9252A] disabled:opacity-50"><UnlockKeyhole className="h-4 w-4" />{busyId === row.id ? 'Unlocking…' : 'Unlock account'}</button>}
        emptyTitle="No active account lockouts"
        emptyDescription="Locked accounts will appear here until access is restored."
      />
    </div>
  );
};
