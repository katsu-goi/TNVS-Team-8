export type MutableAccount = {
  id: string;
  email: string;
  status: string;
  auth_version: number;
};

export type PreparedAccountUpdate = {
  fields: Record<string, unknown>;
  password: string | null;
  credentialsChanged: boolean;
  changedFields: string[];
};

export type AccountUpdatePolicyResult =
  | { ok: true; update: PreparedAccountUpdate }
  | { ok: false; errors: string[] };

export const ACCOUNT_UPDATE_ALLOWED_ROLES = ['SUPER_ADMIN'] as const;

export function canUpdateAccounts(roles: string[]): boolean {
  const normalized = new Set(roles.map((role) => role.trim().toUpperCase()));
  return ACCOUNT_UPDATE_ALLOWED_ROLES.some((role) => normalized.has(role));
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,100}$/;

function optionalText(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in body)) return undefined;
  const value = typeof body[key] === 'string' ? String(body[key]).trim() : '';
  return value || null;
}

export function prepareAccountUpdate(
  existing: MutableAccount,
  actorUserId: string,
  body: unknown,
  actorEmail: string,
  updatedAt: string,
): AccountUpdatePolicyResult {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const fields: Record<string, unknown> = { updated_by: actorEmail, updated_at: updatedAt };
  const changedFields: string[] = [];
  const mappings = [
    ['firstName', 'first_name'],
    ['lastName', 'last_name'],
    ['employeeId', 'employee_id'],
    ['department', 'department'],
    ['position', 'position'],
  ] as const;

  for (const [inputKey, column] of mappings) {
    if (!(inputKey in input)) continue;
    const value = optionalText(input, inputKey);
    if ((inputKey === 'firstName' || inputKey === 'lastName') && !value) {
      errors.push(`${inputKey === 'firstName' ? 'First' : 'Last'} name is required`);
    }
    fields[column] = value;
    changedFields.push(inputKey);
  }

  let emailChanged = false;
  if ('email' in input) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!EMAIL_PATTERN.test(email)) errors.push('Enter a valid email address');
    else {
      fields.email = email;
      emailChanged = email !== existing.email;
      changedFields.push('email');
    }
  }

  let statusChanged = false;
  if ('status' in input) {
    if (input.status !== 'ACTIVE' && input.status !== 'INACTIVE') {
      errors.push('Status must be ACTIVE or INACTIVE');
    } else if (existing.id === actorUserId && input.status === 'INACTIVE') {
      errors.push('You cannot deactivate your own administrator account');
    } else {
      fields.status = input.status;
      statusChanged = input.status !== existing.status;
      changedFields.push('status');
    }
  }

  const password = typeof input.password === 'string' ? input.password : '';
  if (password && !PASSWORD_PATTERN.test(password)) {
    errors.push('Password must be 12-100 characters and include uppercase, lowercase, number, and symbol');
  }
  if (errors.length) return { ok: false, errors };

  const passwordChanged = password.length > 0;
  const credentialsChanged = passwordChanged || emailChanged || statusChanged;
  if (passwordChanged) changedFields.push('password');
  if (credentialsChanged) fields.auth_version = (existing.auth_version ?? 0) + 1;
  if (passwordChanged) {
    fields.failed_login_attempts = 0;
    fields.last_failed_attempt_at = null;
    fields.locked_until = null;
  }

  return {
    ok: true,
    update: {
      fields,
      password: passwordChanged ? password : null,
      credentialsChanged,
      changedFields,
    },
  };
}
