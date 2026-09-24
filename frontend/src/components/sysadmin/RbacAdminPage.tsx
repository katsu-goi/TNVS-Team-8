import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, LockKeyhole, Plus, RefreshCw, Save, ShieldAlert, UnlockKeyhole, UsersRound } from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import {
  rbacService,
  RbacConflict,
  RbacPermission,
  RbacRole,
  RbacUser,
} from '../../api/rbacService';
import { PortalLoadingState } from '../ui/PortalLoadingState';
import { Button, FormField, Modal, PasswordField, SelectField } from '../ui/SharedUI';
import { DashboardHero } from '../ui/DashboardPrimitives';

type AccountForm = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  employeeId: string;
  department: string;
  position: string;
  status: 'ACTIVE' | 'INACTIVE';
};

const emptyAccountForm = (): AccountForm => ({
  firstName: '', lastName: '', email: '', password: '', employeeId: '',
  department: '', position: '', status: 'ACTIVE',
});

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
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [createAccount, setCreateAccount] = useState<AccountForm>(emptyAccountForm);
  const [editAccount, setEditAccount] = useState<AccountForm>(emptyAccountForm);

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

  useEffect(() => {
    if (!selectedUser) return;
    const [firstName = '', ...lastNameParts] = selectedUser.fullName.trim().split(/\s+/);
    setEditAccount({
      firstName: selectedUser.firstName || firstName,
      lastName: selectedUser.lastName || lastNameParts.join(' '),
      email: selectedUser.email,
      password: '',
      employeeId: selectedUser.employeeId || '',
      department: selectedUser.department || '',
      position: selectedUser.position || '',
      status: selectedUser.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    });
  }, [selectedUser]);

  const mutate = async (operation: () => Promise<void>, successMessage: string) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await operation();
      setMessage(successMessage);
      await load();
      return true;
    } catch (reason) {
      setError(extractErrorMessage(reason));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveNewAccount = async () => {
    let createdId = '';
    const saved = await mutate(async () => {
      const created = await rbacService.createUser(createAccount);
      createdId = created.id;
    }, 'Account created securely. Assign one or more roles below.');
    if (!saved) return;
    setShowCreateAccount(false);
    setCreateAccount(emptyAccountForm());
    setSelectedUserId(createdId);
  };

  const saveSelectedAccount = async () => {
    if (!selectedUser) return;
    const payload = { ...editAccount };
    if (!payload.password) delete (payload as Partial<AccountForm>).password;
    await mutate(() => rbacService.updateUser(selectedUser.id, payload).then(() => undefined),
      payload.password ? 'Account and password updated. Existing sessions were revoked.' : 'Account details updated.');
    setEditAccount((current) => ({ ...current, password: '' }));
  };

  if (loading) {
    return <PortalLoadingState message="Loading role administration" />;
  }

  return (
    <div className="space-y-6">
      <DashboardHero title="RBAC3 Administration" subtitle="Account credentials, role hierarchy, permissions, and Separation of Duties." eyebrow="Super Administrator" actions={<>
        <button onClick={() => setShowCreateAccount(true)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><Plus className="h-4 w-4" />Create account</button>
        <button onClick={load} className="rounded-xl border p-2" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
      </>} />

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-[#D02F34]" /><h2 className="font-bold text-slate-900">User Role Assignments</h2></div>
          <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}
            aria-label="Select user account" className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950">
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
          {selectedUser && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-bold text-slate-900">Account credentials</h3>
              <p className="mt-1 text-xs text-slate-600">Update the login email or set a new password. The current password is never displayed.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <FormField label="First name" required value={editAccount.firstName} onChange={(event) => setEditAccount((current) => ({ ...current, firstName: event.target.value }))} autoComplete="given-name" />
                <FormField label="Last name" required value={editAccount.lastName} onChange={(event) => setEditAccount((current) => ({ ...current, lastName: event.target.value }))} autoComplete="family-name" />
                <FormField label="Email" type="email" required value={editAccount.email} onChange={(event) => setEditAccount((current) => ({ ...current, email: event.target.value }))} autoComplete="email" />
                <PasswordField label="New password" value={editAccount.password} onChange={(event) => setEditAccount((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" hint="Leave blank to keep the current password. Use 12+ characters with upper/lowercase, a number, and a symbol." />
                <FormField label="Employee ID" value={editAccount.employeeId} onChange={(event) => setEditAccount((current) => ({ ...current, employeeId: event.target.value }))} />
                <FormField label="Department" value={editAccount.department} onChange={(event) => setEditAccount((current) => ({ ...current, department: event.target.value }))} />
                <FormField label="Position" value={editAccount.position} onChange={(event) => setEditAccount((current) => ({ ...current, position: event.target.value }))} />
                <SelectField label="Account status" value={editAccount.status} onChange={(event) => setEditAccount((current) => ({ ...current, status: event.target.value as AccountForm['status'] }))}>
                  <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
                </SelectField>
              </div>
              <div className="mt-4 flex justify-end"><Button variant="primary" busy={saving} onClick={saveSelectedAccount}><Save className="h-4 w-4" />Save account</Button></div>
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

      <Modal open={showCreateAccount} title="Create user account" description="Create credentials for any portal role. Assign roles after the account is created." onClose={() => setShowCreateAccount(false)} size="lg" closeDisabled={saving} footer={<><Button onClick={() => setShowCreateAccount(false)} disabled={saving}>Cancel</Button><Button variant="primary" busy={saving} onClick={saveNewAccount}>Create account</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="First name" required value={createAccount.firstName} onChange={(event) => setCreateAccount((current) => ({ ...current, firstName: event.target.value }))} autoComplete="given-name" />
          <FormField label="Last name" required value={createAccount.lastName} onChange={(event) => setCreateAccount((current) => ({ ...current, lastName: event.target.value }))} autoComplete="family-name" />
          <FormField label="Email" type="email" required value={createAccount.email} onChange={(event) => setCreateAccount((current) => ({ ...current, email: event.target.value }))} autoComplete="email" />
          <PasswordField label="Password" required value={createAccount.password} onChange={(event) => setCreateAccount((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" hint="12+ characters with upper/lowercase, a number, and a symbol." />
          <FormField label="Employee ID" value={createAccount.employeeId} onChange={(event) => setCreateAccount((current) => ({ ...current, employeeId: event.target.value }))} />
          <FormField label="Department" value={createAccount.department} onChange={(event) => setCreateAccount((current) => ({ ...current, department: event.target.value }))} />
          <FormField label="Position" value={createAccount.position} onChange={(event) => setCreateAccount((current) => ({ ...current, position: event.target.value }))} />
          <SelectField label="Account status" value={createAccount.status} onChange={(event) => setCreateAccount((current) => ({ ...current, status: event.target.value as AccountForm['status'] }))}>
            <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
          </SelectField>
        </div>
      </Modal>
    </div>
  );
};
