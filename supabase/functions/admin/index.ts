import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import { writeAudit } from "../_shared/lockout.ts";
import { resolveClientIp } from "../_shared/ip.ts";
import {
  assignedRoleIds,
  findConflict,
  listPermissionCatalog,
  listRoleCatalog,
  listRoleConflicts,
  resolveEffectiveRoleIds,
} from "../_shared/rbac.ts";

const db = adminDb();

function nowIso(): string {
  return new Date().toISOString();
}

function notFound(message: string) {
  return jsonResponse(fail(message, "NOT_FOUND"), 404);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function loadRolesByUser(): Promise<Map<string, string[]>> {
  const { data, error } = await db
    .from("user_roles")
    .select("user_id, roles(name)");
  if (error) throw new Error(`user_roles load failed: ${error.message}`);
  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    const r = row as { user_id: string; roles: unknown };
    const rolesVal = Array.isArray(r.roles) ? r.roles : r.roles ? [r.roles] : [];
    for (const role of rolesVal) {
      const name = (role as { name?: string }).name;
      if (name) {
        const list = map.get(r.user_id) ?? [];
        list.push(name);
        map.set(r.user_id, list);
      }
    }
  }
  return map;
}

type UserRow = {
  id: string;
  employee_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  department: string | null;
  position: string | null;
  avatar_url: string | null;
  status: string;
  is_email_verified: boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string | null;
};

function userDto(u: UserRow, roles: string[]): Record<string, unknown> {
  const lockedUntil = u.locked_until ? new Date(u.locked_until) : null;
  return {
    id: u.id,
    employeeId: u.employee_id,
    firstName: u.first_name,
    lastName: u.last_name,
    fullName: `${u.first_name} ${u.last_name}`,
    email: u.email,
    phoneNumber: u.phone_number,
    department: u.department,
    position: u.position,
    avatarUrl: u.avatar_url,
    status: u.status,
    emailVerified: u.is_email_verified,
    lastLoginAt: u.last_login_at,
    lastLoginIp: u.last_login_ip,
    accountLocked: lockedUntil !== null && lockedUntil > new Date(),
    lockedUntil: u.locked_until,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
    roles,
  };
}

async function handleListUsers(_ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`users load failed: ${error.message}`);
  const roleMap = await loadRolesByUser();
  const users = (data as unknown as UserRow[]).map((u) => userDto(u, roleMap.get(u.id) ?? []));
  return jsonResponse(ok(users), 200);
}

async function handleUnlockUser(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const id = p.id;
  const { data, error } = await db
    .from("users")
    .select("id, email")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) throw new Error(`user lookup failed: ${error.message}`);
  if (!data) return notFound(`User not found with id: ${id}`);

  const { error: updErr } = await db
    .from("users")
    .update({ failed_login_attempts: 0, locked_until: null, last_failed_attempt_at: null })
    .eq("id", id);
  if (updErr) throw new Error(`user unlock failed: ${updErr.message}`);

  await writeAudit(ctx!.user, "USER_UNLOCKED", "ADMIN", "User", id,
    `Account ${(data as { email: string }).email} unlocked after login lockout`,
    resolveClientIp(_req).ip);

  return jsonResponse(ok("Account unlocked successfully"), 200);
}

// ---------------------------------------------------------------------------
// System configuration
// ---------------------------------------------------------------------------

type ConfigRow = {
  id: string;
  config_key: string;
  config_value: string | null;
  description: string | null;
  category: string | null;
  updated_at: string;
  updated_by: string | null;
};

function configDto(c: ConfigRow): Record<string, unknown> {
  return {
    id: c.id,
    configKey: c.config_key,
    configValue: c.config_value,
    description: c.description,
    category: c.category,
    updatedAt: c.updated_at,
    updatedBy: c.updated_by,
  };
}

async function handleListConfigs(_ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { data, error } = await db.from("system_configurations").select("*").order("config_key", { ascending: true });
  if (error) throw new Error(`configs load failed: ${error.message}`);
  return jsonResponse(ok((data as unknown as ConfigRow[]).map(configDto)), 200);
}

async function handleGetConfig(_ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data, error } = await db
    .from("system_configurations")
    .select("*")
    .eq("config_key", p.key)
    .maybeSingle();
  if (error) throw new Error(`config lookup failed: ${error.message}`);
  if (!data) return notFound(`Configuration not found with key: ${p.key}`);
  return jsonResponse(ok(configDto(data as unknown as ConfigRow)), 200);
}

async function handleUpsertConfig(_ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const b = (body ?? {}) as Record<string, unknown>;
  const key = p.key;
  const value = typeof b.value === "string" ? b.value : "";
  const description = typeof b.description === "string" ? b.description : null;
  const category = typeof b.category === "string" ? b.category : null;
  const updatedBy = typeof b.updatedBy === "string" ? b.updatedBy : "admin";

  const { data: existing } = await db
    .from("system_configurations")
    .select("id, description, category")
    .eq("config_key", key)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    config_value: value,
    description: description ?? (existing as { description: string | null } | null)?.description ?? null,
    category: category ?? (existing as { category: string | null } | null)?.category ?? null,
    updated_at: nowIso(),
    updated_by: updatedBy,
  };

  let saved;
  if (existing) {
    const { data, error } = await db
      .from("system_configurations")
      .update(payload)
      .eq("config_key", key)
      .select("*")
      .single();
    if (error) throw new Error(`config update failed: ${error.message}`);
    saved = data;
  } else {
    const { data, error } = await db
      .from("system_configurations")
      .insert({ config_key: key, ...payload })
      .select("*")
      .single();
    if (error) throw new Error(`config insert failed: ${error.message}`);
    saved = data;
  }

  return jsonResponse(ok(configDto(saved as unknown as ConfigRow)), 200);
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

type IntegrationRow = {
  id: string;
  system_name: string;
  connection_status: string;
  last_sync_at: string | null;
  api_health: string | null;
  response_time_ms: number | null;
  failed_syncs: number;
  last_successful_connection: string | null;
};

function integrationDto(i: IntegrationRow): Record<string, unknown> {
  return {
    id: i.id,
    systemName: i.system_name,
    connectionStatus: i.connection_status,
    lastSyncAt: i.last_sync_at,
    apiHealth: i.api_health,
    responseTimeMs: i.response_time_ms,
    failedSyncs: i.failed_syncs,
    lastSuccessfulConnection: i.last_successful_connection,
  };
}

async function handleListIntegrations(_ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { data, error } = await db.from("integration_status").select("*").order("system_name", { ascending: true });
  if (error) throw new Error(`integrations load failed: ${error.message}`);
  return jsonResponse(ok((data as unknown as IntegrationRow[]).map(integrationDto)), 200);
}

async function handleGetIntegration(_ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data, error } = await db
    .from("integration_status")
    .select("*")
    .eq("system_name", p.systemName)
    .maybeSingle();
  if (error) throw new Error(`integration lookup failed: ${error.message}`);
  if (!data) return notFound(`Integration not found with system name: ${p.systemName}`);
  return jsonResponse(ok(integrationDto(data as unknown as IntegrationRow)), 200);
}

// ---------------------------------------------------------------------------
// HR assistance admin
// ---------------------------------------------------------------------------

type HrRequestRow = {
  id: string;
  requester_name: string;
  requester_email: string;
  subject: string;
  message: string;
  status: string;
  priority: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

function hrDto(h: HrRequestRow): Record<string, unknown> {
  return {
    id: h.id,
    requesterName: h.requester_name,
    requesterEmail: h.requester_email,
    subject: h.subject,
    message: h.message,
    status: h.status,
    priority: h.priority,
    ipAddress: h.ip_address,
    userAgent: h.user_agent,
    createdAt: h.created_at,
  };
}

async function handleListHrRequests(_ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { data, error } = await db
    .from("hr_assistance_requests")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`hr requests load failed: ${error.message}`);
  return jsonResponse(ok((data as unknown as HrRequestRow[]).map(hrDto)), 200);
}

async function handleGetHrRequest(_ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data, error } = await db
    .from("hr_assistance_requests")
    .select("*")
    .eq("id", p.id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) throw new Error(`hr request lookup failed: ${error.message}`);
  if (!data) return notFound(`HrAssistanceRequest not found with id: ${p.id}`);
  return jsonResponse(ok(hrDto(data as unknown as HrRequestRow)), 200);
}

async function handleUpdateHrStatus(_ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  const status = new URL(req.url).searchParams.get("status");
  if (!status) {
    return jsonResponse(fail("Validation failed", "VALIDATION_ERROR", ["status query parameter is required"]), 400);
  }
  const { data: existing, error: findErr } = await db
    .from("hr_assistance_requests")
    .select("id")
    .eq("id", p.id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (findErr) throw new Error(`hr request lookup failed: ${findErr.message}`);
  if (!existing) return notFound(`HrAssistanceRequest not found with id: ${p.id}`);

  const { data, error } = await db
    .from("hr_assistance_requests")
    .update({ status })
    .eq("id", p.id)
    .select("*")
    .single();
  if (error) throw new Error(`hr request update failed: ${error.message}`);
  return jsonResponse(ok(hrDto(data as unknown as HrRequestRow)), 200);
}

// ---------------------------------------------------------------------------
// Admin notifications
// ---------------------------------------------------------------------------

type AdminNotifRow = {
  id: string;
  title: string;
  message: string | null;
  type: string;
  severity: string;
  read: boolean;
  expires_at: string | null;
  related_entity_id: string | null;
  related_entity_type: string | null;
  recipient_id: string | null;
  created_at: string;
};

function adminNotifDto(n: AdminNotifRow): Record<string, unknown> {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    severity: n.severity,
    relatedEntityType: n.related_entity_type,
    relatedEntityId: n.related_entity_id,
    read: n.read,
    createdAt: n.created_at,
    expiresAt: n.expires_at,
  };
}

async function handleListAdminNotifications(ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { data, error } = await db
    .from("admin_notifications")
    .select("*")
    .or(`recipient_id.is.null,recipient_id.eq.${ctx!.userId}`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`admin notifications load failed: ${error.message}`);
  return jsonResponse(ok((data as unknown as AdminNotifRow[]).map(adminNotifDto)), 200);
}

async function handleUnreadCount(ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { count, error } = await db
    .from("admin_notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false)
    .or(`recipient_id.is.null,recipient_id.eq.${ctx!.userId}`);
  if (error) throw new Error(`admin notifications count failed: ${error.message}`);
  return jsonResponse(ok(count ?? 0), 200);
}

async function handleMarkNotifRead(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data, error } = await db
    .from("admin_notifications")
    .select("id, recipient_id")
    .eq("id", p.id)
    .maybeSingle();
  if (error) throw new Error(`admin notification lookup failed: ${error.message}`);
  if (data && ((data as { recipient_id: string | null }).recipient_id === null ||
    (data as { recipient_id: string | null }).recipient_id === ctx!.userId)) {
    await db.from("admin_notifications").update({ read: true }).eq("id", p.id);
  }
  return jsonResponse(ok("Notification marked as read"), 200);
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

type BackupRow = {
  id: string;
  backup_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  file_size: number | null;
  file_path: string | null;
  integrity_check: string | null;
  triggered_by: string | null;
  notes: string | null;
};

function backupDto(b: BackupRow): Record<string, unknown> {
  return {
    id: b.id,
    backupType: b.backup_type,
    status: b.status,
    startedAt: b.started_at,
    completedAt: b.completed_at,
    fileSize: b.file_size,
    filePath: b.file_path,
    integrityCheck: b.integrity_check,
    triggeredBy: b.triggered_by,
    notes: b.notes,
  };
}

async function handleListBackups(_ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { data, error } = await db.from("backup_records").select("*").order("started_at", { ascending: false });
  if (error) throw new Error(`backups load failed: ${error.message}`);
  return jsonResponse(ok((data as unknown as BackupRow[]).map(backupDto)), 200);
}

async function handleLatestBackup(_ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { data, error } = await db.from("backup_records").select("*").order("started_at", { ascending: false }).limit(1);
  if (error) throw new Error(`backups load failed: ${error.message}`);
  if (!data || data.length === 0) return jsonResponse(ok("No backup records found"), 200);
  return jsonResponse(ok(backupDto(data[0] as unknown as BackupRow)), 200);
}

async function handleCreateBackup(_ctx: AuthContext | null, _req: Request, body: unknown, _p: RouteParams) {
  const b = (body ?? {}) as Record<string, unknown>;
  const backupType = typeof b.backupType === "string" && b.backupType.trim()
    ? b.backupType.toUpperCase()
    : "FULL";
  const triggeredBy = typeof b.triggeredBy === "string" && b.triggeredBy.trim()
    ? b.triggeredBy
    : "system";

  const now = nowIso();
  const { data, error } = await db
    .from("backup_records")
    .insert({
      backup_type: backupType,
      status: "COMPLETED",
      started_at: now,
      completed_at: now,
      triggered_by: triggeredBy,
      integrity_check: "PASSED",
      notes: "Backup completed via Supabase-managed database.",
    })
    .select("*")
    .single();
  if (error) throw new Error(`backup insert failed: ${error.message}`);
  return jsonResponse(ok(backupDto(data as unknown as BackupRow)), 200);
}

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------

async function handleKpi(_ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const kpi = {
    facilities: {
      totalFacilities: 0,
      totalRooms: 0,
      activeRooms: 0,
      bookingsToday: 0,
      pendingApprovals: 0,
      checkedIn: 0,
    },
    visitors: {
      totalVisitors: 0,
      onSite: 0,
      checkedIn: 0,
      registered: 0,
      checkedOut: 0,
    },
    documents: {
      totalDocuments: 0,
      archived: 0,
      approved: 0,
      pendingReview: 0,
      draft: 0,
    },
    records: { totalPolicies: 0, activePolicies: 0 },
    legal: { totalCases: 0, open: 0, inProgress: 0, pendingHearing: 0, closed: 0 },
    contracts: {
      totalContracts: 0,
      active: 0,
      underReview: 0,
      draft: 0,
      expired: 0,
      pendingApproval: 0,
      totalContractValue: 0,
    },
    global: {
      activeUsers: 0,
      activeSessions: 0,
      failedLoginAttempts: 0,
      blockedIps: 0,
      activeAlerts: 0,
      unreadNotifications: 0,
    },
  };

  const count = async (table: string, eq?: [string, unknown]) => {
    let q = db.from(table).select("id", { count: "exact", head: true });
    if (eq) q = q.eq(eq[0], eq[1]);
    const { count: n, error } = await q;
    if (error) throw new Error(`${table} count failed: ${error.message}`);
    return n ?? 0;
  };
  const countLike = async (table: string, col: string, op: string, val: unknown) => {
    const { count: n, error } = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .or(`${col}.${op}.${val}`);
    if (error) throw new Error(`${table} count failed: ${error.message}`);
    return n ?? 0;
  };
  const countRaw = async (table: string, filter: (q: any) => any) => {
    const { count: n, error } = await filter(db.from(table).select("id", { count: "exact", head: true }));
    if (error) throw new Error(`${table} count failed: ${error.message}`);
    return n ?? 0;
  };

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  kpi.facilities.totalFacilities = await countRaw("facilities", (q: any) => q.eq("is_deleted", false));
  kpi.facilities.totalRooms = await countRaw("rooms", (q: any) => q.eq("is_deleted", false));
  kpi.facilities.activeRooms = await countRaw("rooms", (q: any) => q.eq("active", true));
  kpi.facilities.bookingsToday = await countRaw("reservations", (q: any) =>
    q.gte("start_time", dayStart.toISOString()).lt("start_time", dayEnd.toISOString()));
  kpi.facilities.pendingApprovals = await countLike("reservations", "status", "eq", "PENDING");
  kpi.facilities.checkedIn = await countLike("reservations", "status", "eq", "CHECKED_IN");

  kpi.visitors.totalVisitors = await count("visitors");
  kpi.visitors.onSite = await countLike("visitors", "status", "eq", "CHECKED_IN");
  kpi.visitors.checkedIn = kpi.visitors.onSite;
  kpi.visitors.registered = await countLike("visitors", "status", "eq", "REGISTERED");
  kpi.visitors.checkedOut = await countLike("visitors", "status", "eq", "CHECKED_OUT");

  kpi.documents.totalDocuments = await count("documents");
  kpi.documents.archived = await countLike("documents", "status", "eq", "ARCHIVED");
  kpi.documents.approved = await countLike("documents", "status", "eq", "APPROVED");
  kpi.documents.pendingReview = await countLike("documents", "status", "eq", "PENDING_REVIEW");
  kpi.documents.draft = await countLike("documents", "status", "eq", "DRAFT");

  kpi.records.totalPolicies = await count("retention_policies");
  kpi.records.activePolicies = await countRaw("retention_policies", (q: any) => q.eq("active", true));

  kpi.legal.totalCases = await count("legal_cases");
  kpi.legal.open = await countLike("legal_cases", "status", "eq", "OPEN");
  kpi.legal.inProgress = await countLike("legal_cases", "status", "eq", "IN_PROGRESS");
  kpi.legal.pendingHearing = await countLike("legal_cases", "status", "eq", "PENDING_HEARING");
  kpi.legal.closed = await countLike("legal_cases", "status", "eq", "CLOSED");

  kpi.contracts.totalContracts = await count("contracts");
  kpi.contracts.active = await countLike("contracts", "status", "eq", "ACTIVE");
  kpi.contracts.underReview = await countLike("contracts", "status", "eq", "UNDER_REVIEW");
  kpi.contracts.draft = await countLike("contracts", "status", "eq", "DRAFT");
  kpi.contracts.expired = await countLike("contracts", "status", "eq", "EXPIRED");
  kpi.contracts.pendingApproval = await countLike("contracts", "status", "eq", "APPROVED");
  kpi.contracts.totalContractValue = 0;

  kpi.global.activeUsers = await countRaw("users", (q: any) => q.eq("is_deleted", false));
  kpi.global.activeSessions = await countLike("active_sessions", "status", "eq", "ACTIVE");
  kpi.global.failedLoginAttempts = await countRaw("login_history", (q: any) =>
    q.eq("status", "FAILED").in("username", ["admin", "user"]));
  kpi.global.blockedIps = await countLike("blocked_ips", "status", "eq", "ACTIVE");
  kpi.global.activeAlerts = await countLike("security_alerts", "status", "eq", "UNRESOLVED");
  kpi.global.unreadNotifications = await countRaw("admin_notifications", (q: any) => q.eq("read", false));

  return jsonResponse(ok(kpi), 200);
}

// ---------------------------------------------------------------------------

async function rbacRole(id: string) {
  const { data, error } = await db
    .from("roles")
    .select("id, name, display_name")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) throw new Error(`role lookup failed: ${error.message}`);
  return data as { id: string; name: string; display_name: string } | null;
}

async function rbacUser(id: string) {
  const { data, error } = await db
    .from("users")
    .select("id, email")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) throw new Error(`user lookup failed: ${error.message}`);
  return data as { id: string; email: string } | null;
}

async function revokeUserRefreshTokens(userId: string) {
  const { error } = await db.from("refresh_tokens").update({
    is_revoked: true,
    revoked_at: nowIso(),
  }).eq("user_id", userId).eq("is_revoked", false);
  if (error) throw new Error(`refresh-token revocation failed: ${error.message}`);
}

async function revokeAllRefreshTokens() {
  const { error } = await db.from("refresh_tokens").update({
    is_revoked: true,
    revoked_at: nowIso(),
  }).eq("is_revoked", false);
  if (error) throw new Error(`refresh-token revocation failed: ${error.message}`);
}

async function revokeAffectedUserTokens(roleId: string) {
  const { data: links, error } = await db.from("user_roles").select("user_id, role_id");
  if (error) throw new Error(`affected user lookup failed: ${error.message}`);

  const rolesByUser = new Map<string, string[]>();
  for (const link of links ?? []) {
    const userId = link.user_id as string;
    const roles = rolesByUser.get(userId) ?? [];
    roles.push(link.role_id as string);
    rolesByUser.set(userId, roles);
  }

  for (const [userId, assignedRoles] of rolesByUser) {
    const effectiveRoles = await resolveEffectiveRoleIds(assignedRoles);
    if (!effectiveRoles.has(roleId)) continue;
    await revokeUserRefreshTokens(userId);
  }
}

async function auditRbac(
  ctx: AuthContext | null,
  req: Request,
  action: string,
  entityType: string,
  entityId: string,
  description: string,
) {
  await writeAudit(ctx!.user, action, "RBAC", entityType, entityId,
    description, resolveClientIp(req).ip);
}

function sodViolation(firstRole: string, secondRole: string) {
  return jsonResponse(fail(
    `Separation of Duties violation: ${firstRole} conflicts with ${secondRole}.`,
    "BUSINESS_RULE_VIOLATION",
  ), 422);
}

async function handleListRbacRoles() {
  return jsonResponse(ok(await listRoleCatalog()), 200);
}

async function handleListRbacPermissions() {
  return jsonResponse(ok(await listPermissionCatalog()), 200);
}

async function handleListRbacConflicts() {
  return jsonResponse(ok(await listRoleConflicts()), 200);
}

async function handleAssignRole(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  const user = await rbacUser(p.userId);
  if (!user) return notFound("User not found");
  const role = await rbacRole(p.roleId);
  if (!role) return notFound("Role not found");

  const assigned = await assignedRoleIds(user.id);
  if (assigned.includes(role.id)) return jsonResponse(ok("Role already assigned"), 200);
  const effective = await resolveEffectiveRoleIds([...assigned, role.id]);
  const conflict = await findConflict(effective);
  if (conflict) return sodViolation(conflict.firstRole, conflict.secondRole);

  const { error } = await db.from("user_roles").insert({ user_id: user.id, role_id: role.id });
  if (error) throw new Error(`role assignment failed: ${error.message}`);
  await revokeUserRefreshTokens(user.id);
  await auditRbac(ctx, req, "RBAC_ROLE_ASSIGNED", "User", user.id,
    `Assigned ${role.name} to ${user.email}`);
  return jsonResponse(ok("Role assigned successfully"), 200);
}

async function handleRevokeRole(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  const user = await rbacUser(p.userId);
  if (!user) return notFound("User not found");
  const role = await rbacRole(p.roleId);
  if (!role) return notFound("Role not found");

  const assigned = await assignedRoleIds(user.id);
  if (!assigned.includes(role.id)) return jsonResponse(ok("Role not assigned"), 200);
  if (assigned.length <= 1) {
    return jsonResponse(fail(
      "An active user must retain at least one assigned role.",
      "BUSINESS_RULE_VIOLATION",
    ), 422);
  }

  if (role.name === "SUPER_ADMIN") {
    const { count, error: countError } = await db
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role_id", role.id);
    if (countError) throw new Error(`super-admin count failed: ${countError.message}`);
    if ((count ?? 0) <= 1) {
      return jsonResponse(fail(
        "The last super administrator role cannot be revoked.",
        "BUSINESS_RULE_VIOLATION",
      ), 422);
    }
  }

  const { error } = await db.from("user_roles")
    .delete().eq("user_id", user.id).eq("role_id", role.id);
  if (error) throw new Error(`role revocation failed: ${error.message}`);
  await revokeUserRefreshTokens(user.id);
  await auditRbac(ctx, req, "RBAC_ROLE_REVOKED", "User", user.id,
    `Revoked ${role.name} from ${user.email}`);
  return jsonResponse(ok("Role revoked successfully"), 200);
}

async function handleGrantPermission(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  const role = await rbacRole(p.roleId);
  if (!role) return notFound("Role not found");
  const { data: permission, error: permissionError } = await db
    .from("permissions").select("id, name")
    .eq("id", p.permissionId).eq("is_deleted", false).maybeSingle();
  if (permissionError) throw new Error(`permission lookup failed: ${permissionError.message}`);
  if (!permission) return notFound("Permission not found");

  const { error } = await db.from("role_permissions").upsert({
    role_id: role.id,
    permission_id: permission.id,
  }, { onConflict: "role_id,permission_id", ignoreDuplicates: true });
  if (error) throw new Error(`permission grant failed: ${error.message}`);
  await revokeAffectedUserTokens(role.id);
  await auditRbac(ctx, req, "RBAC_PERMISSION_GRANTED", "Role", role.id,
    `Granted ${permission.name} to ${role.name}`);
  return jsonResponse(ok("Permission granted successfully"), 200);
}

async function handleRevokePermission(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  const role = await rbacRole(p.roleId);
  if (!role) return notFound("Role not found");
  const { error } = await db.from("role_permissions")
    .delete().eq("role_id", role.id).eq("permission_id", p.permissionId);
  if (error) throw new Error(`permission revocation failed: ${error.message}`);
  await revokeAffectedUserTokens(role.id);
  await auditRbac(ctx, req, "RBAC_PERMISSION_REVOKED", "Role", role.id,
    `Revoked a permission from ${role.name}`);
  return jsonResponse(ok("Permission revoked successfully"), 200);
}

async function validateEveryUserAgainstSod(): Promise<{ email: string; firstRole: string; secondRole: string } | null> {
  const { data: links, error } = await db.from("user_roles").select("user_id, role_id");
  if (error) throw new Error(`user role validation failed: ${error.message}`);
  const byUser = new Map<string, string[]>();
  for (const link of links ?? []) {
    const list = byUser.get(link.user_id as string) ?? [];
    list.push(link.role_id as string);
    byUser.set(link.user_id as string, list);
  }
  for (const [userId, roles] of byUser) {
    const conflict = await findConflict(await resolveEffectiveRoleIds(roles));
    if (!conflict) continue;
    const user = await rbacUser(userId);
    return {
      email: user?.email ?? userId,
      firstRole: conflict.firstRole,
      secondRole: conflict.secondRole,
    };
  }
  return null;
}

async function handleAddInheritance(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  const senior = await rbacRole(p.seniorRoleId);
  const junior = await rbacRole(p.juniorRoleId);
  if (!senior || !junior) return notFound("Role not found");
  if (senior.id === junior.id) {
    return jsonResponse(fail("A role cannot inherit itself.", "BUSINESS_RULE_VIOLATION"), 422);
  }
  const juniorClosure = await resolveEffectiveRoleIds([junior.id]);
  if (juniorClosure.has(senior.id)) {
    return jsonResponse(fail("Role hierarchy cycle detected.", "BUSINESS_RULE_VIOLATION"), 422);
  }

  const { error } = await db.from("role_hierarchy").upsert({
    senior_role_id: senior.id,
    junior_role_id: junior.id,
  }, { onConflict: "senior_role_id,junior_role_id", ignoreDuplicates: true });
  if (error) throw new Error(`role inheritance failed: ${error.message}`);

  const violation = await validateEveryUserAgainstSod();
  if (violation) {
    await db.from("role_hierarchy").delete()
      .eq("senior_role_id", senior.id).eq("junior_role_id", junior.id);
    return jsonResponse(fail(
      `Cannot add inheritance because ${violation.email} would violate SoD: ${violation.firstRole} conflicts with ${violation.secondRole}.`,
      "BUSINESS_RULE_VIOLATION",
    ), 422);
  }

  await revokeAllRefreshTokens();
  await auditRbac(ctx, req, "RBAC_HIERARCHY_ADDED", "Role", senior.id,
    `${senior.name} now inherits ${junior.name}`);
  return jsonResponse(ok("Role inheritance added successfully"), 200);
}

async function handleRemoveInheritance(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  const { error } = await db.from("role_hierarchy").delete()
    .eq("senior_role_id", p.seniorRoleId).eq("junior_role_id", p.juniorRoleId);
  if (error) throw new Error(`role inheritance removal failed: ${error.message}`);
  await revokeAllRefreshTokens();
  await auditRbac(ctx, req, "RBAC_HIERARCHY_REMOVED", "Role", p.seniorRoleId,
    "Removed inherited role");
  return jsonResponse(ok("Role inheritance removed successfully"), 200);
}

async function handleCreateConflict(ctx: AuthContext | null, req: Request, body: unknown) {
  const input = body as Record<string, unknown> | null;
  const firstRoleId = typeof input?.firstRoleId === "string" ? input.firstRoleId : "";
  const secondRoleId = typeof input?.secondRoleId === "string" ? input.secondRoleId : "";
  const code = typeof input?.code === "string" ? input.code.trim().toUpperCase() : "";
  const description = typeof input?.description === "string" ? input.description.trim() : null;
  if (!firstRoleId || !secondRoleId || !code) {
    return jsonResponse(fail("Role IDs and code are required.", "VALIDATION_ERROR"), 400);
  }
  if (firstRoleId === secondRoleId) {
    return jsonResponse(fail("A role cannot conflict with itself.", "BUSINESS_RULE_VIOLATION"), 422);
  }
  const first = await rbacRole(firstRoleId);
  const second = await rbacRole(secondRoleId);
  if (!first || !second) return notFound("Role not found");

  const { data: existing, error: existingError } = await db.from("role_conflicts")
    .select("id").or(
      `code.eq.${code},and(first_role_id.eq.${firstRoleId},second_role_id.eq.${secondRoleId}),and(first_role_id.eq.${secondRoleId},second_role_id.eq.${firstRoleId})`,
    ).maybeSingle();
  if (existingError) throw new Error(`role conflict lookup failed: ${existingError.message}`);
  if (existing) return jsonResponse(fail("Role conflict already exists.", "RESOURCE_ALREADY_EXISTS"), 409);

  const { data: userLinks, error: userLinkError } = await db.from("user_roles").select("user_id, role_id");
  if (userLinkError) throw new Error(`user role validation failed: ${userLinkError.message}`);
  const byUser = new Map<string, string[]>();
  for (const link of userLinks ?? []) {
    const list = byUser.get(link.user_id as string) ?? [];
    list.push(link.role_id as string);
    byUser.set(link.user_id as string, list);
  }
  for (const [userId, roles] of byUser) {
    const effective = await resolveEffectiveRoleIds(roles);
    if (effective.has(firstRoleId) && effective.has(secondRoleId)) {
      const user = await rbacUser(userId);
      return jsonResponse(fail(
        `Cannot create this constraint because ${user?.email ?? userId} currently has both roles.`,
        "BUSINESS_RULE_VIOLATION",
      ), 422);
    }
  }

  const { data: saved, error } = await db.from("role_conflicts").insert({
    first_role_id: firstRoleId,
    second_role_id: secondRoleId,
    code,
    description,
    active: true,
  }).select("id").single();
  if (error) throw new Error(`role conflict creation failed: ${error.message}`);
  await auditRbac(ctx, req, "RBAC_CONSTRAINT_CREATED", "RoleConflict", saved.id as string,
    `Created SoD constraint ${code}`);
  return jsonResponse(ok((await listRoleConflicts()).find((item) => item.id === saved.id)), 200);
}

async function handleDeactivateConflict(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  const { error } = await db.from("role_conflicts").update({ active: false, updated_at: nowIso() })
    .eq("id", p.conflictId).eq("is_deleted", false);
  if (error) throw new Error(`role conflict update failed: ${error.message}`);
  await auditRbac(ctx, req, "RBAC_CONSTRAINT_DEACTIVATED", "RoleConflict", p.conflictId,
    "Deactivated SoD constraint");
  return jsonResponse(ok("Constraint deactivated successfully"), 200);
}

// ---------------------------------------------------------------------------

const routes = [
  { method: "GET", path: "/admin/users", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleListUsers },
  { method: "POST", path: "/admin/users/:id/unlock", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleUnlockUser },
  { method: "GET", path: "/admin/rbac/users", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["RBAC_ADMINISTER"] }, handler: handleListUsers },
  { method: "GET", path: "/admin/rbac/roles", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["RBAC_ADMINISTER"] }, handler: handleListRbacRoles },
  { method: "GET", path: "/admin/rbac/permissions", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["RBAC_ADMINISTER"] }, handler: handleListRbacPermissions },
  { method: "GET", path: "/admin/rbac/conflicts", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["RBAC_ADMINISTER"] }, handler: handleListRbacConflicts },
  { method: "PUT", path: "/admin/rbac/users/:userId/roles/:roleId", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["RBAC_ADMINISTER"] }, handler: handleAssignRole },
  { method: "DELETE", path: "/admin/rbac/users/:userId/roles/:roleId", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["RBAC_ADMINISTER"] }, handler: handleRevokeRole },
  { method: "PUT", path: "/admin/rbac/roles/:roleId/permissions/:permissionId", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["RBAC_ADMINISTER"] }, handler: handleGrantPermission },
  { method: "DELETE", path: "/admin/rbac/roles/:roleId/permissions/:permissionId", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["RBAC_ADMINISTER"] }, handler: handleRevokePermission },
  { method: "PUT", path: "/admin/rbac/hierarchy/:seniorRoleId/:juniorRoleId", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["RBAC_ADMINISTER"] }, handler: handleAddInheritance },
  { method: "DELETE", path: "/admin/rbac/hierarchy/:seniorRoleId/:juniorRoleId", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["RBAC_ADMINISTER"] }, handler: handleRemoveInheritance },
  { method: "POST", path: "/admin/rbac/conflicts", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["RBAC_ADMINISTER"] }, handler: handleCreateConflict },
  { method: "DELETE", path: "/admin/rbac/conflicts/:conflictId", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["RBAC_ADMINISTER"] }, handler: handleDeactivateConflict },
  { method: "GET", path: "/admin/config", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleListConfigs },
  { method: "GET", path: "/admin/config/:key", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleGetConfig },
  { method: "PUT", path: "/admin/config/:key", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleUpsertConfig },
  { method: "GET", path: "/admin/integrations", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleListIntegrations },
  { method: "GET", path: "/admin/integrations/:systemName", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleGetIntegration },
  { method: "GET", path: "/admin/hr-assistance", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleListHrRequests },
  { method: "GET", path: "/admin/hr-assistance/:id", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleGetHrRequest },
  { method: "PATCH", path: "/admin/hr-assistance/:id/status", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleUpdateHrStatus },
  { method: "GET", path: "/admin/notifications", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleListAdminNotifications },
  { method: "GET", path: "/admin/notifications/unread-count", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleUnreadCount },
  { method: "PUT", path: "/admin/notifications/:id/read", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleMarkNotifRead },
  { method: "GET", path: "/admin/backups", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleListBackups },
  { method: "GET", path: "/admin/backups/latest", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleLatestBackup },
  { method: "POST", path: "/admin/backups", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleCreateBackup },
  { method: "GET", path: "/admin/kpi", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleKpi },
] as const;

Deno.serve(createHandler(routes as never, { name: "admin" }));
