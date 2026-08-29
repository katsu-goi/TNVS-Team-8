import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, KeyRound, Loader2, LockKeyhole, RefreshCw, ShieldAlert, UnlockKeyhole, UsersRound } from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import {
  rbacService,
  RbacConflict,
  RbacPermission,
  RbacRole,
  RbacUser,
} from '../../api/rbacService';

export const RbacAdminPage: React.FC = () => {
  const [users, setUsers] = useState<RbacUser[]>([]);
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [permissions, setPermissions] = useState<RbacPermission[]>([]);
  const [conflicts, setConflicts] = useState<RbacConflict[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [conflictFirstId, setConflictFirstId] = useState('');
  const [conflictSecondId, setConflictSecondId] = useState('');
  const [conflictCode, setConflictCode] = useState('');
  const [conflictDescription, setConflictDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextUsers, nextRoles, nextPermissions, nextConflicts] = await Promise.all([
        rbacService.listUsers(),
        rbacService.listRoles(),
        rbacService.listPermissions(),
        rbacService.listConflicts(),
      ]);
      setUsers(nextUsers);
      setRoles(nextRoles);
      setPermissions(nextPermissions);
      setConflicts(nextConflicts);
      setSelectedUserId((current) => current || nextUsers[0]?.id || '');
      setSelectedRoleId((current) => current || nextRoles[0]?.id || '');
      setConflictFirstId((current) => current || nextRoles[0]?.id || '');
      setConflictSecondId((current) => current || nextRoles[1]?.id || '');
    } catch (reason) {
      setError(extractErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedUser = users.find((user) => user.id === selectedUserId);
  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const selectedRoleNames = useMemo(() => new Set(selectedUser?.roles || []), [selectedUser]);

  const mutate = async (operation: () => Promise<void>, successMessage: string) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await operation();
      setMessage(successMessage);
      await load();
    } catch (reason) {
      setError(extractErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#D02F34]" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-3"><KeyRound className="h-6 w-6 text-[#D02F34]" /><h1 className="text-2xl font-bold text-slate-900">RBAC3 Administration</h1></div>
          <p className="mt-2 text-sm text-slate-500">Symmetric role administration, hierarchy, permissions, and Separation of Duties.</p>
        </div>
        <button onClick={load} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-[#D02F34]" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-[#D02F34]" /><h2 className="font-bold text-slate-900">User Role Assignments</h2></div>
          <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}
            className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
            {users.map((user) => <option key={user.id} value={user.id}>{user.fullName} - {user.email}</option>)}
          </select>
          {selectedUser && (
            <div className={`mt-3 flex items-center justify-between rounded-xl border px-3 py-3 ${selectedUser.accountLocked ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-center gap-2">
                {selectedUser.accountLocked ? <LockKeyhole className="h-4 w-4 text-rose-600" /> : <UnlockKeyhole className="h-4 w-4 text-emerald-600" />}
                <div>
                  <p className="text-xs font-semibold text-slate-800">{selectedUser.accountLocked ? 'Account locked' : 'Account active'}</p>
                  {selectedUser.lockedUntil && <p className="text-[11px] text-slate-500">Until {new Date(selectedUser.lockedUntil).toLocaleString()}</p>}
                </div>
              </div>
              {selectedUser.accountLocked && <button disabled={saving} onClick={() => mutate(() => rbacService.unlockUser(selectedUser.id), 'Account unlocked successfully.')} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" title="Unlock account"><UnlockKeyhole className="h-3.5 w-3.5" />Unlock</button>}
            </div>
          )}
          <div className="mt-4 max-h-[440px] space-y-2 overflow-y-auto pr-1">
            {roles.map((role) => {
              const assigned = selectedRoleNames.has(role.name);
              return (
                <label key={role.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 hover:border-slate-300">
                  <input type="checkbox" checked={assigned} disabled={saving}
                    onChange={(event) => mutate(
                      () => rbacService.setUserRole(selectedUserId, role.id, event.target.checked),
                      `${role.displayName} ${event.target.checked ? 'assigned' : 'revoked'}.`,
                    )}
                    className="mt-1 h-4 w-4 accent-[#D02F34]" />
                  <span><span className="block text-sm font-semibold text-slate-800">{role.displayName}</span><span className="text-xs text-slate-500">{role.name}</span></span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-[#D02F34]" /><h2 className="font-bold text-slate-900">Role Capabilities</h2></div>
          <select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}
            className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
            {roles.map((role) => <option key={role.id} value={role.id}>{role.displayName}</option>)}
          </select>

          <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Direct permissions</h3>
          <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
            {permissions.map((permission) => {
              const granted = selectedRole?.directPermissions.includes(permission.name) || false;
              return (
                <label key={permission.id} className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3">
                  <input type="checkbox" checked={granted} disabled={saving}
                    onChange={(event) => mutate(
                      () => rbacService.setRolePermission(selectedRoleId, permission.id, event.target.checked),
                      `${permission.displayName} ${event.target.checked ? 'granted' : 'revoked'}.`,
                    )}
                    className="mt-1 h-4 w-4 accent-[#D02F34]" />
                  <span><span className="block text-sm font-medium text-slate-800">{permission.displayName}</span><span className="text-xs text-slate-500">{permission.name} · {permission.action}</span></span>
                </label>
              );
            })}
          </div>

          <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Inherited roles</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {roles.filter((role) => role.id !== selectedRoleId).map((role) => {
              const inherited = selectedRole?.inheritedRoles.includes(role.name) || false;
              return (
                <label key={role.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs text-slate-700">
                  <input type="checkbox" checked={inherited} disabled={saving}
                    onChange={(event) => mutate(
                      () => rbacService.setInheritance(selectedRoleId, role.id, event.target.checked),
                      `Inheritance ${event.target.checked ? 'added' : 'removed'}.`,
                    )}
                    className="h-4 w-4 accent-[#D02F34]" />
                  {role.displayName}
                </label>
              );
            })}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-[#D02F34]" /><h2 className="font-bold text-slate-900">Separation of Duties Constraints</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {conflicts.map((conflict) => (
            <div key={conflict.id} className={`rounded-xl border p-4 ${conflict.active ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
              <p className="text-xs font-bold text-slate-800">{conflict.code}</p>
              <p className="mt-1 text-sm text-slate-700">{conflict.firstRole} ↔ {conflict.secondRole}</p>
              <p className="mt-1 text-xs text-slate-500">{conflict.description}</p>
              {conflict.active && <button disabled={saving} onClick={() => mutate(() => rbacService.deactivateConflict(conflict.id), 'Constraint deactivated.')}
                className="mt-3 text-xs font-semibold text-rose-600">Deactivate</button>}
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-5">
          <select value={conflictFirstId} onChange={(event) => setConflictFirstId(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {roles.map((role) => <option key={role.id} value={role.id}>{role.displayName}</option>)}
          </select>
          <select value={conflictSecondId} onChange={(event) => setConflictSecondId(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {roles.map((role) => <option key={role.id} value={role.id}>{role.displayName}</option>)}
          </select>
          <input value={conflictCode} onChange={(event) => setConflictCode(event.target.value)} placeholder="Constraint code" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={conflictDescription} onChange={(event) => setConflictDescription(event.target.value)} placeholder="Description" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={saving || !conflictCode || conflictFirstId === conflictSecondId}
            onClick={() => mutate(
              () => rbacService.createConflict(conflictFirstId, conflictSecondId, conflictCode, conflictDescription),
              'Constraint created.',
            )}
            className="rounded-lg bg-[#D02F34] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create Constraint</button>
        </div>
      </section>
    </div>
  );
};
