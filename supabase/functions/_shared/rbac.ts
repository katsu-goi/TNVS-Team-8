import { adminDb } from "./db.ts";

export type RoleCatalogItem = {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  dashboardKey: string | null;
  systemRole: boolean;
  directPermissions: string[];
  inheritedRoles: string[];
};

export type PermissionCatalogItem = {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  module: string;
  resource: string;
  action: string;
};

export type RoleConflictItem = {
  id: string;
  code: string;
  description: string | null;
  firstRole: string;
  secondRole: string;
  active: boolean;
};

type RoleRow = {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  dashboard_key: string | null;
  is_system_role: boolean;
};

export async function assignedRoleIds(userId: string): Promise<string[]> {
  const { data, error } = await adminDb()
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId);
  if (error) throw new Error(`user roles lookup failed: ${error.message}`);
  return (data ?? []).map((row) => row.role_id as string);
}

export async function resolveEffectiveRoleIds(assignedIds: string[]): Promise<Set<string>> {
  const db = adminDb();
  const effective = new Set(assignedIds);
  let frontier = [...assignedIds];
  while (frontier.length > 0) {
    const { data, error } = await db
      .from("role_hierarchy")
      .select("junior_role_id")
      .in("senior_role_id", frontier);
    if (error) throw new Error(`role hierarchy lookup failed: ${error.message}`);
    const next: string[] = [];
    for (const row of data ?? []) {
      const juniorId = row.junior_role_id as string;
      if (!effective.has(juniorId)) {
        effective.add(juniorId);
        next.push(juniorId);
      }
    }
    frontier = next;
  }
  return effective;
}

export async function findConflict(roleIds: Iterable<string>): Promise<RoleConflictItem | null> {
  const ids = new Set(roleIds);
  const conflicts = await listRoleConflicts(true);
  const roles = await roleNameMap();
  const { data, error } = await adminDb()
    .from("role_conflicts")
    .select("first_role_id, second_role_id, code")
    .eq("active", true)
    .eq("is_deleted", false);
  if (error) throw new Error(`role conflicts lookup failed: ${error.message}`);
  for (const row of data ?? []) {
    if (ids.has(row.first_role_id as string) && ids.has(row.second_role_id as string)) {
      const item = conflicts.find((conflict) => conflict.code === row.code);
      if (item) return item;
      return {
        id: "",
        code: row.code as string,
        description: null,
        firstRole: roles.get(row.first_role_id as string) ?? "Unknown role",
        secondRole: roles.get(row.second_role_id as string) ?? "Unknown role",
        active: true,
      };
    }
  }
  return null;
}

export async function listRoleCatalog(): Promise<RoleCatalogItem[]> {
  const db = adminDb();
  const { data: roleData, error: roleError } = await db
    .from("roles")
    .select("id, name, display_name, description, dashboard_key, is_system_role")
    .eq("is_deleted", false)
    .order("name");
  if (roleError) throw new Error(`roles lookup failed: ${roleError.message}`);

  const roles = (roleData ?? []) as RoleRow[];
  const roleNames = new Map(roles.map((role) => [role.id, role.name]));
  const permissionNames = new Map<string, string>();
  const { data: permissionData, error: permissionError } = await db
    .from("permissions")
    .select("id, name")
    .eq("is_deleted", false);
  if (permissionError) throw new Error(`permissions lookup failed: ${permissionError.message}`);
  for (const permission of permissionData ?? []) {
    permissionNames.set(permission.id as string, permission.name as string);
  }

  const directPermissions = new Map<string, string[]>();
  const { data: grants, error: grantsError } = await db
    .from("role_permissions")
    .select("role_id, permission_id");
  if (grantsError) throw new Error(`role permission lookup failed: ${grantsError.message}`);
  for (const grant of grants ?? []) {
    const name = permissionNames.get(grant.permission_id as string);
    if (!name) continue;
    const list = directPermissions.get(grant.role_id as string) ?? [];
    list.push(name);
    directPermissions.set(grant.role_id as string, list);
  }

  const inheritedRoles = new Map<string, string[]>();
  const { data: hierarchy, error: hierarchyError } = await db
    .from("role_hierarchy")
    .select("senior_role_id, junior_role_id");
  if (hierarchyError) throw new Error(`role hierarchy lookup failed: ${hierarchyError.message}`);
  for (const link of hierarchy ?? []) {
    const juniorName = roleNames.get(link.junior_role_id as string);
    if (!juniorName) continue;
    const list = inheritedRoles.get(link.senior_role_id as string) ?? [];
    list.push(juniorName);
    inheritedRoles.set(link.senior_role_id as string, list);
  }

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    displayName: role.display_name,
    description: role.description,
    dashboardKey: role.dashboard_key,
    systemRole: role.is_system_role,
    directPermissions: (directPermissions.get(role.id) ?? []).sort(),
    inheritedRoles: (inheritedRoles.get(role.id) ?? []).sort(),
  }));
}

export async function listPermissionCatalog(): Promise<PermissionCatalogItem[]> {
  const { data, error } = await adminDb()
    .from("permissions")
    .select("id, name, display_name, description, module, resource, action")
    .eq("is_deleted", false)
    .order("name");
  if (error) throw new Error(`permissions lookup failed: ${error.message}`);
  return (data ?? []).map((permission) => ({
    id: permission.id as string,
    name: permission.name as string,
    displayName: permission.display_name as string,
    description: permission.description as string | null,
    module: permission.module as string,
    resource: permission.resource as string,
    action: permission.action as string,
  }));
}

export async function listRoleConflicts(activeOnly = false): Promise<RoleConflictItem[]> {
  const db = adminDb();
  let query = db
    .from("role_conflicts")
    .select("id, code, description, first_role_id, second_role_id, active")
    .eq("is_deleted", false)
    .order("code");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(`role conflicts lookup failed: ${error.message}`);
  const names = await roleNameMap();
  return (data ?? []).map((conflict) => ({
    id: conflict.id as string,
    code: conflict.code as string,
    description: conflict.description as string | null,
    firstRole: names.get(conflict.first_role_id as string) ?? "Unknown role",
    secondRole: names.get(conflict.second_role_id as string) ?? "Unknown role",
    active: conflict.active as boolean,
  }));
}

export async function relevantRoleConflicts(roleNames: Iterable<string>): Promise<RoleConflictItem[]> {
  const names = new Set(roleNames);
  return (await listRoleConflicts(true)).filter((conflict) =>
    names.has(conflict.firstRole) || names.has(conflict.secondRole)
  );
}

async function roleNameMap(): Promise<Map<string, string>> {
  const { data, error } = await adminDb()
    .from("roles")
    .select("id, name")
    .eq("is_deleted", false);
  if (error) throw new Error(`roles lookup failed: ${error.message}`);
  return new Map((data ?? []).map((role) => [role.id as string, role.name as string]));
}
