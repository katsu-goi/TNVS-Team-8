import { adminDb } from "./db.ts";

export type AuthUserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  employee_id: string | null;
  department: string | null;
  position: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  password_hash: string;
  status: string;
  is_deleted: boolean;
  failed_login_attempts: number;
  last_failed_attempt_at: string | null;
  locked_until: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  password_reset_token: string | null;
  password_reset_expires_at: string | null;
  is_email_verified: boolean;
};

export type AuthUser = {
  row: AuthUserRow;
  roles: string[];
  permissions: string[];
};

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const db = adminDb();
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("email", email)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) throw new Error(`users lookup failed: ${error.message}`);
  if (!data) return null;

  const { names, permissions } = await loadRolesFor(data.id as string);
  return { row: data as AuthUserRow, roles: names, permissions };
}

type RoleLoad = { names: string[]; permissions: string[] };

async function loadRolesFor(userId: string): Promise<RoleLoad> {
  const db = adminDb();

  const { data: linkRows, error: linkErr } = await db
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId);
  if (linkErr) throw new Error(`user_roles lookup failed: ${linkErr.message}`);

  const roleIds = (linkRows ?? []).map((r) => r.role_id as string);
  if (roleIds.length === 0) {
    return { names: [], permissions: [] };
  }

  const { data: roleRows, error: roleErr } = await db
    .from("roles")
    .select("id, name")
    .in("id", roleIds);
  if (roleErr) throw new Error(`roles lookup failed: ${roleErr.message}`);

  const names = (roleRows ?? []).map((r) => r.name as string);

  const { data: permRows, error: permErr } = await db
    .from("role_permissions")
    .select("permission:permissions(name)")
    .in("role_id", roleIds);
  if (permErr) throw new Error(`permissions lookup failed: ${permErr.message}`);

  const permissions = new Set<string>();
  for (const row of permRows ?? []) {
    const name = (row.permission as { name?: string } | null)?.name;
    if (name) permissions.add(name);
  }
  return { names, permissions: [...permissions] };
}

/** Comma-joined authority list matching CustomUserDetailsService (ROLE_x + permission names). */
export function authorityString(user: AuthUser): string {
  const authorities = new Set<string>();
  for (const role of user.roles) authorities.add(`ROLE_${role}`);
  for (const perm of user.permissions) authorities.add(perm);
  return [...authorities].join(",");
}

export function userSummary(user: AuthUser) {
  const r = user.row;
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    fullName: `${r.first_name} ${r.last_name}`,
    email: r.email,
    employeeId: r.employee_id,
    department: r.department,
    position: r.position,
    avatarUrl: r.avatar_url,
    roles: user.roles,
    permissions: user.permissions,
  };
}

export function isAccountActive(user: AuthUser): boolean {
  return user.row.status === "ACTIVE" && !user.row.is_deleted;
}

export function isAccountLocked(user: AuthUser, now: Date): boolean {
  return user.row.locked_until !== null && now < new Date(user.row.locked_until);
}

/** Naive UTC timestamp (no timezone suffix) for timestamp-without-tz columns. */
export function naiveIso(d: Date = new Date()): string {
  return d.toISOString().replace("Z", "");
}

/** Full ISO for timestamptz columns. */
export function tzIso(d: Date = new Date()): string {
  return d.toISOString();
}