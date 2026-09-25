import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCOUNT_UPDATE_ALLOWED_ROLES, canUpdateAccounts, prepareAccountUpdate, type MutableAccount,
} from './account-update-policy.ts';

const existing: MutableAccount = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'user@photonicomega.com',
  status: 'ACTIVE',
  auth_version: 7,
};

const prepare = (body: unknown, actorUserId = '00000000-0000-4000-8000-000000000002') => (
  prepareAccountUpdate(existing, actorUserId, body, 'superadmin@photonicomega.com', '2026-09-24T00:00:00.000Z')
);

describe('admin account update policy', () => {
  it('allows only Super Admin account management', () => {
    assert.deepEqual(ACCOUNT_UPDATE_ALLOWED_ROLES, ['SUPER_ADMIN']);
    assert.equal(canUpdateAccounts(['SUPER_ADMIN']), true);
    assert.equal(canUpdateAccounts(['SYSTEM_ADMIN']), false);
    assert.equal(canUpdateAccounts(['FACILITIES_MANAGER']), false);
    assert.equal(canUpdateAccounts(['EMPLOYEE']), false);
  });

  it('allows every intended profile field and ignores protected fields', () => {
    const result = prepare({
      firstName: 'Updated', lastName: 'User', email: ' UPDATED@PhotonicOmega.com ',
      employeeId: 'EMP-9', department: 'Operations', position: 'Lead', status: 'ACTIVE',
      password_hash: 'forbidden', auth_version: 999, roles: ['SUPER_ADMIN'],
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.update.fields, {
      updated_by: 'superadmin@photonicomega.com', updated_at: '2026-09-24T00:00:00.000Z',
      first_name: 'Updated', last_name: 'User', email: 'updated@photonicomega.com',
      employee_id: 'EMP-9', department: 'Operations', position: 'Lead', status: 'ACTIVE', auth_version: 8,
    });
    assert.equal('password_hash' in result.update.fields, false);
    assert.equal('roles' in result.update.fields, false);
  });

  it('preserves the password and session version when password is blank', () => {
    const result = prepare({ firstName: 'Updated', password: '' });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.update.password, null);
    assert.equal(result.update.credentialsChanged, false);
    assert.equal('password_hash' in result.update.fields, false);
    assert.equal('auth_version' in result.update.fields, false);
  });

  it('accepts a policy-compliant password without placing it in database fields', () => {
    const result = prepare({ password: 'StrongPassword2026!' });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.update.password, 'StrongPassword2026!');
    assert.equal(result.update.fields.auth_version, 8);
    assert.equal('password' in result.update.fields, false);
    assert.equal('password_hash' in result.update.fields, false);
  });

  it('rejects a weak password', () => {
    const result = prepare({ password: 'weak-password' });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.errors.join(' '), /uppercase, lowercase, number, and symbol/);
  });

  it('advances the session version for status changes and blocks self-deactivation', () => {
    const statusChange = prepare({ status: 'INACTIVE' });
    assert.equal(statusChange.ok, true);
    if (statusChange.ok) assert.equal(statusChange.update.fields.auth_version, 8);

    const selfDeactivate = prepare({ status: 'INACTIVE' }, existing.id);
    assert.equal(selfDeactivate.ok, false);
  });
});
