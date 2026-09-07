import { createHandler, AuthContext, hasRole, RouteParams } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import { writeAudit } from "../_shared/lockout.ts";
import { resolveClientIp } from "../_shared/ip.ts";
import { findUserById } from "../_shared/auth-users.ts";
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

const BACKUP_BUCKET = "backup-archives";
const BACKUP_ROW_LIMIT = 5000;
const BACKUP_TABLES: Record<string, string[]> = {
  audit_logs: ["audit_logs", "admin_audit_logs"],
  facilities: [
    "facilities",
    "rooms",
    "equipment",
    "facility_amenities",
    "facility_permits",
    "maintenance_schedules",
    "facility_data_logs",
    "hub_inventory_assets",
    "facility_reorder_requests",
  ],
  compliance_permits: [
    "facility_compliance_documents",
    "retention_policies",
    "compliance_alerts",
    "compliance_incidents",
    "management_signoffs",
    "disposal_requests",
  ],
  security_events: [
    "security_logs",
    "security_alerts",
    "ip_threats",
    "blocked_ips",
    "active_sessions",
    "security_role_incidents",
    "privacy_breach_incidents",
    "login_history",
    "api_request_logs",
  ],
};
const FULL_BACKUP_TABLES = [
  ...new Set([
    ...BACKUP_TABLES.audit_logs,
    ...BACKUP_TABLES.facilities,
    ...BACKUP_TABLES.compliance_permits,
    ...BACKUP_TABLES.security_events,
    "visitors",
    "documents",
    "contracts",
    "legal_cases",
    "reservations",
    "admin_notifications",
    "integration_status",
    "system_configurations",
    "employee_notifications",
    "employee_requests",
    "legal_notices",
    "vendors",
    "vendor_obligations",
    "procurement_notices",
    "folders",
    "categories",
    "tags",
    "document_tags",
    "reservation_approvals",
    "retention_disposal_queue",
    "visitor_verifications",
    "visitor_watchlist",
    "hr_assistance_requests",
    "user_activity_events",
    "online_users",
    "oversight_sessions",
    "department_scope_assignments",
    "data_subject_requests",
    "cctv_export_requests",
    "governance_settings",
    "department_approvals",
    "users",
    "roles",
    "permissions",
    "user_roles",
    "role_permissions",
    "role_hierarchy",
    "role_conflicts",
    "backup_records",
    "backup_schedules",
  ]),
];

async function ensureBackupBucket() {
  const { data, error } = await db.storage.getBucket(BACKUP_BUCKET);
  if (data) return;
  if (error && Number((error as { statusCode?: unknown }).statusCode) !== 404) {
    throw new Error(`backup storage lookup failed: ${error.message}`);
  }
  const { error: createError } = await db.storage.createBucket(BACKUP_BUCKET, { public: false });
  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw new Error(`backup storage bucket create failed: ${createError.message}`);
  }
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

async function handleListLockedUsers(_ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("is_deleted", false)
    .gt("locked_until", nowIso())
    .order("locked_until", { ascending: true });
  if (error) throw new Error(`locked users load failed: ${error.message}`);
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
// Audited read-only oversight sessions
// ---------------------------------------------------------------------------

type OversightMode = "IMPERSONATION" | "SHADOW";

type OversightSessionRow = {
  id: string;
  actor_user_id: string;
  target_user_id: string;
  mode: OversightMode;
  actor_role: string;
  target_role_names: string[];
  justification: string;
  read_only: boolean;
  status: "ACTIVE" | "ENDED" | "EXPIRED";
  started_at: string;
  expires_at: string;
  ended_at: string | null;
};

type OversightTargetRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string | null;
  status: string;
  is_deleted: boolean;
};

const OVERSIGHT_SESSION_HEADER = "X-Oversight-Session";
const OVERSIGHT_DURATION_MINUTES = 15;
const MAX_OVERSIGHT_DURATION_MINUTES = 30;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPLIANCE_SHADOW_ROLES = new Set([
  "COMPLIANCE_OFFICER",
  "DATA_PROTECTION_OFFICER",
  "RECORDS_OFFICER",
]);
const SHADOW_COMPATIBLE_ROLES = new Set([...COMPLIANCE_SHADOW_ROLES, "EMPLOYEE"]);
const IMPERSONATION_PROTECTED_ROLES = new Set(["SUPER_ADMIN", "SYSTEM_ADMIN"]);

function oversightValidationError(message: string) {
  return jsonResponse(fail("Validation failed", "VALIDATION_ERROR", [message]), 400);
}

function oversightAccessDenied(message: string) {
  return jsonResponse(fail(message, "ACCESS_DENIED"), 403);
}

function parseOversightMode(value: unknown): OversightMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized === "IMPERSONATION" || normalized === "SHADOW" ? normalized : null;
}

function parseOversightDuration(value: unknown): number {
  if (value === undefined || value === null) return OVERSIGHT_DURATION_MINUTES;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return OVERSIGHT_DURATION_MINUTES;
  return Math.min(MAX_OVERSIGHT_DURATION_MINUTES, Math.max(5, Math.floor(parsed)));
}

async function assignedRolesForUser(userId: string): Promise<string[]> {
  const { data, error } = await db
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", userId);
  if (error) throw new Error(`target roles lookup failed: ${error.message}`);

  const roles = new Set<string>();
  for (const row of data ?? []) {
    const related = (row as { roles: unknown }).roles;
    const values = Array.isArray(related) ? related : related ? [related] : [];
    for (const value of values) {
      const name = (value as { name?: string }).name;
      if (name) roles.add(name.toUpperCase());
    }
  }
  return [...roles];
}

async function oversightTarget(userId: string): Promise<OversightTargetRow | null> {
  const { data, error } = await db
    .from("users")
    .select("id, first_name, last_name, email, department, status, is_deleted")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`oversight target lookup failed: ${error.message}`);
  return data as OversightTargetRow | null;
}

async function activeOversightSession(actorUserId: string, sessionId?: string): Promise<OversightSessionRow | null> {
  let query = db
    .from("oversight_sessions")
    .select(
      "id, actor_user_id, target_user_id, mode, actor_role, target_role_names, justification, read_only, status, started_at, expires_at, ended_at",
    )
    .eq("actor_user_id", actorUserId)
    .eq("read_only", true)
    .eq("status", "ACTIVE")
    .is("ended_at", null)
    .gt("expires_at", nowIso())
    .order("started_at", { ascending: false })
    .limit(1);
  if (sessionId) query = query.eq("id", sessionId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`oversight session lookup failed: ${error.message}`);
  return data as OversightSessionRow | null;
}

async function expireStaleOversightSessions(actorUserId: string): Promise<void> {
  const endedAt = nowIso();
  const { error } = await db
    .from("oversight_sessions")
    .update({ status: "EXPIRED", ended_at: endedAt, ended_by: actorUserId })
    .eq("actor_user_id", actorUserId)
    .eq("status", "ACTIVE")
    .lte("expires_at", endedAt);
  if (error) throw new Error(`expired oversight session cleanup failed: ${error.message}`);
}

async function writeOversightAudit(
  ctx: AuthContext,
  req: Request,
  action: string,
  session: OversightSessionRow,
  targetEmail: string,
) {
  const { error } = await db.from("admin_audit_logs").insert({
    actor_user_id: ctx.userId,
    target_user_id: session.target_user_id,
    oversight_session_id: session.id,
    action,
    entity_type: "OversightSession",
    entity_id: session.id,
    details: {
      mode: session.mode,
      actorEmail: ctx.email,
      targetEmail,
      actorRole: session.actor_role,
      targetRoles: session.target_role_names,
      readOnly: session.read_only,
      justification: session.justification,
    },
    source_ip: resolveClientIp(req).ip,
    user_agent: req.headers.get("User-Agent"),
    occurred_at: nowIso(),
  });
  if (error) throw new Error(`oversight audit write failed: ${error.message}`);
}

function oversightDto(
  session: OversightSessionRow,
  target: OversightTargetRow,
  targetRoles: string[],
  targetPermissions: string[] = [],
  dashboardKey: string | null = null,
  assignedRoles: string[] = targetRoles,
): Record<string, unknown> {
  return {
    id: session.id,
    mode: session.mode,
    actorRole: session.actor_role,
    readOnly: session.read_only,
    status: session.status,
    justification: session.justification,
    actorUserId: session.actor_user_id,
    targetUser: {
      id: target.id,
      email: target.email,
      firstName: target.first_name,
      lastName: target.last_name,
      fullName: `${target.first_name} ${target.last_name}`,
      department: target.department,
      roles: targetRoles,
      assignedRoles,
      permissions: targetPermissions,
      dashboardKey,
    },
    startedAt: session.started_at,
    expiresAt: session.expires_at,
  };
}

async function handleListOversightTargets(ctx: AuthContext | null) {
  const actor = ctx!;
  const { data, error } = await db
    .from("users")
    .select("id, first_name, last_name, email, department, status, is_deleted")
    .eq("status", "ACTIVE")
    .eq("is_deleted", false)
    .neq("id", actor.userId)
    .order("last_name")
    .limit(250);
  if (error) throw new Error(`oversight targets lookup failed: ${error.message}`);

  const targetIds = (data ?? []).map((row) => (row as OversightTargetRow).id);
  const [onlineResult, activityResult] = targetIds.length
    ? await Promise.all([
        db.from("online_users").select("user_id, last_activity").in("user_id", targetIds),
        db.from("user_activity_events").select("user_id, action, event_type, created_at").in("user_id", targetIds).order("created_at", { ascending: false }).limit(500),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (onlineResult.error) {
    console.warn(`Oversight online presence unavailable; treating all targets as offline: ${onlineResult.error.message}`);
  }
  if (activityResult.error) {
    console.warn(`Oversight activity telemetry unavailable; continuing without activity details: ${activityResult.error.message}`);
  }
  const onlineByUser = new Map<string, string>();
  for (const row of onlineResult.error ? [] : onlineResult.data ?? []) {
    if (row.user_id && row.last_activity) onlineByUser.set(String(row.user_id), String(row.last_activity));
  }
  const latestActivityByUser = new Map<string, { action: string; occurredAt: string }>();
  for (const row of activityResult.error ? [] : activityResult.data ?? []) {
    const userId = row.user_id ? String(row.user_id) : "";
    if (userId && !latestActivityByUser.has(userId)) {
      latestActivityByUser.set(userId, {
        action: String(row.action || row.event_type || "Account activity"),
        occurredAt: String(row.created_at),
      });
    }
  }

  const targets: Record<string, unknown>[] = [];
  for (const row of (data ?? []) as OversightTargetRow[]) {
    const profile = await findUserById(row.id);
    if (!profile || profile.assignedRoles.length === 0) continue;
    const roles = profile.assignedRoles;
    if (hasRole(actor, "COMPLIANCE_MANAGER")) {
      const hasSubordinateRole = roles.some((role) => COMPLIANCE_SHADOW_ROLES.has(role));
      const hasOutOfScopeRole = roles.some((role) => !SHADOW_COMPATIBLE_ROLES.has(role));
      if (!hasSubordinateRole || hasOutOfScopeRole) continue;
    } else if (roles.some((role) => IMPERSONATION_PROTECTED_ROLES.has(role))) {
      continue;
    }
    const lastActivity = onlineByUser.get(row.id) ?? null;
    const activity = latestActivityByUser.get(row.id) ?? null;
    const isOnline = Boolean(lastActivity && Date.now() - new Date(lastActivity).getTime() <= 5 * 60 * 1000);
    targets.push({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: `${row.first_name} ${row.last_name}`,
      department: row.department,
      roles: profile.roles,
      assignedRoles: profile.assignedRoles,
      permissions: profile.permissions,
      dashboardKey: profile.dashboardKey,
      isOnline,
      lastActiveAt: lastActivity,
      lastActiveOperation: activity?.action ?? null,
      lastActiveOperationAt: activity?.occurredAt ?? null,
    });
  }
  return jsonResponse(ok(targets), 200);
}

async function handleStartOversightSession(ctx: AuthContext | null, req: Request, body: unknown, _p: RouteParams) {
  const actor = ctx!;
  const payload = (body ?? {}) as Record<string, unknown>;
  const mode = parseOversightMode(payload.mode);
  if (!mode) return oversightValidationError("mode must be IMPERSONATION or SHADOW");

  const justification = typeof payload.justification === "string" ? payload.justification.trim() : "";
  if (justification.length < 10) {
    return oversightValidationError("justification must contain at least 10 characters");
  }

  const targetUserId = typeof payload.targetUserId === "string"
    ? payload.targetUserId.trim()
    : typeof payload.target_user_id === "string"
    ? payload.target_user_id.trim()
    : "";
  if (!UUID_PATTERN.test(targetUserId)) return oversightValidationError("targetUserId must be a valid UUID");
  if (targetUserId === actor.userId) return oversightValidationError("You cannot start oversight on your own account");

  if (mode === "IMPERSONATION" && !hasRole(actor, "SUPER_ADMIN")) {
    return oversightAccessDenied("Only a Super Admin can start an impersonation session");
  }
  if (mode === "SHADOW" && !hasRole(actor, "COMPLIANCE_MANAGER")) {
    return oversightAccessDenied("Only a Compliance Manager can start a compliance shadow session");
  }

  await expireStaleOversightSessions(actor.userId);
  const existing = await activeOversightSession(actor.userId);
  if (existing) {
    return jsonResponse(
      fail("An active oversight session already exists. Stop it before starting another.", "OVERSIGHT_SESSION_ACTIVE"),
      409,
    );
  }

  const target = await oversightTarget(targetUserId);
  if (!target || target.is_deleted || target.status !== "ACTIVE") {
    return notFound(`Active oversight target not found with id: ${targetUserId}`);
  }

  const targetRoles = await assignedRolesForUser(targetUserId);
  if (targetRoles.length === 0) return oversightValidationError("The target account has no assigned role");

  if (mode === "IMPERSONATION" && targetRoles.some((role) => IMPERSONATION_PROTECTED_ROLES.has(role))) {
    return oversightAccessDenied("Super Admin and System Admin accounts cannot be impersonated");
  }
  if (mode === "SHADOW") {
    const hasSubordinateRole = targetRoles.some((role) => COMPLIANCE_SHADOW_ROLES.has(role));
    const hasOutOfScopeRole = targetRoles.some((role) => !SHADOW_COMPATIBLE_ROLES.has(role));
    if (!hasSubordinateRole || hasOutOfScopeRole) {
      return oversightAccessDenied(
        "Compliance Manager shadow mode is limited to Compliance Officer, Data Protection Officer, and Records Officer accounts",
      );
    }
  }

  const startedAt = new Date();
  const durationMinutes = parseOversightDuration(payload.durationMinutes ?? payload.duration_minutes);
  const expiresAt = new Date(startedAt.getTime() + durationMinutes * 60_000);
  const actorRole = mode === "IMPERSONATION" ? "SUPER_ADMIN" : "COMPLIANCE_MANAGER";
  const { data, error } = await db
    .from("oversight_sessions")
    .insert({
      actor_user_id: actor.userId,
      target_user_id: targetUserId,
      mode,
      actor_role: actorRole,
      target_role_names: targetRoles,
      justification,
      read_only: true,
      status: "ACTIVE",
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      source_ip: resolveClientIp(req).ip,
      user_agent: req.headers.get("User-Agent"),
    })
    .select(
      "id, actor_user_id, target_user_id, mode, actor_role, target_role_names, justification, read_only, status, started_at, expires_at, ended_at",
    )
    .single();
  if (error) throw new Error(`oversight session start failed: ${error.message}`);

  const session = data as OversightSessionRow;
  const targetProfile = await findUserById(targetUserId);
  if (!targetProfile) return notFound(`Active oversight target not found with id: ${targetUserId}`);
  try {
    await writeOversightAudit(
      actor,
      req,
      mode === "IMPERSONATION" ? "IMPERSONATION_STARTED" : "SHADOW_SESSION_STARTED",
      session,
      target.email,
    );
  } catch (e) {
    await db.from("oversight_sessions").update({
      status: "ENDED",
      ended_at: nowIso(),
      ended_by: actor.userId,
    }).eq("id", session.id);
    throw e;
  }

  return jsonResponse(ok(oversightDto(
    session,
    target,
    targetProfile.roles,
    targetProfile.permissions,
    targetProfile.dashboardKey,
    targetProfile.assignedRoles,
  ), "Oversight session started"), 201);
}

async function handleCurrentOversightSession(ctx: AuthContext | null, req: Request, _body: unknown, _p: RouteParams) {
  const requestedSessionId = req.headers.get(OVERSIGHT_SESSION_HEADER)?.trim();
  if (requestedSessionId && !UUID_PATTERN.test(requestedSessionId)) {
    return oversightValidationError(`${OVERSIGHT_SESSION_HEADER} must contain a valid UUID`);
  }

  const session = await activeOversightSession(ctx!.userId, requestedSessionId || undefined);
  if (!session) return jsonResponse(ok(null, "No active oversight session"), 200);

  const target = await oversightTarget(session.target_user_id);
  if (!target) return notFound(`Oversight target not found with id: ${session.target_user_id}`);
  const targetProfile = await findUserById(session.target_user_id);
  if (!targetProfile) return notFound(`Oversight target not found with id: ${session.target_user_id}`);
  return jsonResponse(ok(oversightDto(
    session,
    target,
    targetProfile.roles,
    targetProfile.permissions,
    targetProfile.dashboardKey,
    targetProfile.assignedRoles,
  )), 200);
}

async function handleStopOversightSession(ctx: AuthContext | null, req: Request, body: unknown, _p: RouteParams) {
  const payload = (body ?? {}) as Record<string, unknown>;
  const bodySessionId = typeof payload.sessionId === "string"
    ? payload.sessionId.trim()
    : typeof payload.session_id === "string"
    ? payload.session_id.trim()
    : "";
  if (bodySessionId && !UUID_PATTERN.test(bodySessionId)) {
    return oversightValidationError("sessionId must be a valid UUID");
  }

  const session = await activeOversightSession(ctx!.userId, bodySessionId || undefined);
  if (!session) return notFound("No active oversight session was found for the current user");

  const target = await oversightTarget(session.target_user_id);
  if (!target) return notFound(`Oversight target not found with id: ${session.target_user_id}`);

  const { error } = await db
    .from("oversight_sessions")
    .update({ status: "ENDED", ended_at: nowIso(), ended_by: ctx!.userId })
    .eq("id", session.id)
    .eq("actor_user_id", ctx!.userId)
    .eq("status", "ACTIVE");
  if (error) throw new Error(`oversight session stop failed: ${error.message}`);

  await writeOversightAudit(
    ctx!,
    req,
    session.mode === "IMPERSONATION" ? "IMPERSONATION_STOPPED" : "SHADOW_SESSION_STOPPED",
    session,
    target.email,
  );
  return jsonResponse(ok("Oversight session stopped"), 200);
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
  created_at: string;
  backup_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  file_size: number | null;
  file_path: string | null;
  file_url: string | null;
  checksum: string | null;
  integrity_check: string | null;
  triggered_by: string | null;
  created_by: string | null;
  created_by_email: string | null;
  module_scope: string[] | null;
  export_format: string | null;
  notes: string | null;
};

function backupDto(b: BackupRow): Record<string, unknown> {
  return {
    id: b.id,
    createdAt: b.created_at,
    backupType: b.backup_type,
    status: b.status,
    startedAt: b.started_at,
    completedAt: b.completed_at,
    fileSize: b.file_size,
    filePath: b.file_path,
    fileUrl: b.file_url,
    checksum: b.checksum,
    integrityCheck: b.integrity_check,
    triggeredBy: b.triggered_by,
    createdBy: b.created_by_email ?? b.created_by,
    moduleScope: b.module_scope ?? [],
    exportFormat: b.export_format,
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

const ALLOWED_BACKUP_MODULES = new Set([
  "audit_logs",
  "facilities",
  "compliance_permits",
  "security_events",
]);

type BackupTableRows = { table: string; rows: Record<string, unknown>[] };
type LoadedBackupTables = { tables: BackupTableRows[]; skippedTables: string[] };

function tablesForBackup(backupType: string, modules: string[] | null | undefined): string[] {
  if (backupType === "GRANULAR_EXPORT") {
    const selectedTables = (modules ?? []).flatMap((module) => BACKUP_TABLES[module] ?? []);
    // Older granular records were created before module_scope was persisted.
    // Preserve their downloadability by exporting the available granular scope.
    return [...new Set(selectedTables.length > 0
      ? selectedTables
      : Object.values(BACKUP_TABLES).flat())];
  }
  return FULL_BACKUP_TABLES;
}

async function loadBackupTables(tableNames: string[]): Promise<LoadedBackupTables> {
  const result: BackupTableRows[] = [];
  const skippedTables: string[] = [];
  const batchSize = 8;

  for (let offset = 0; offset < tableNames.length; offset += batchSize) {
    const batch = tableNames.slice(offset, offset + batchSize);
    const settled = await Promise.allSettled(batch.map(async (table) => {
      const { data, error } = await db.from(table).select("*").limit(BACKUP_ROW_LIMIT);
      if (error) throw new Error(error.message);
      return { table, rows: (data ?? []) as Record<string, unknown>[] };
    }));

    settled.forEach((entry, index) => {
      if (entry.status === "fulfilled") {
        result.push(entry.value);
      } else {
        const table = batch[index];
        skippedTables.push(table);
        console.warn(`Skipping unavailable backup table ${table}: ${entry.reason instanceof Error ? entry.reason.message : String(entry.reason)}`);
      }
    });
  }

  if (result.length === 0) throw new Error("No backup tables were available to export.");
  return { tables: result, skippedTables };
}

function quoteSqlIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteSqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `'${(text ?? "").replace(/'/g, "''")}'`;
}

function csvValue(value: unknown): string {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${(text ?? "").replace(/"/g, '""')}"`;
}

function createSqlArtifact(tables: BackupTableRows[]): string {
  const lines = [
    "-- Photonic Omega logical backup generated by the Backup & Disaster Recovery console",
    `-- Generated at: ${nowIso()}`,
    "-- Restore this file after applying the current Supabase schema migrations.",
    "",
  ];
  for (const { table, rows } of tables) {
    lines.push(`-- TABLE: public.${table}`);
    if (rows.length === 0) {
      lines.push("-- No rows captured.", "");
      continue;
    }
    for (const row of rows) {
      const columns = Object.keys(row);
      lines.push(
        `INSERT INTO public.${quoteSqlIdentifier(table)} (${columns.map(quoteSqlIdentifier).join(", ")}) VALUES (${columns.map((column) => quoteSqlValue(row[column])).join(", ")}) ON CONFLICT DO NOTHING;`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function createCsvArtifact(tables: BackupTableRows[]): string {
  const lines = ["table,record"];
  for (const { table, rows } of tables) {
    for (const row of rows) lines.push(`${csvValue(table)},${csvValue(row)}`);
  }
  return `${lines.join("\n")}\n`;
}

function createJsonArtifact(tables: BackupTableRows[]): string {
  const payload = Object.fromEntries(tables.map(({ table, rows }) => [table, rows]));
  return `${JSON.stringify({ generatedAt: nowIso(), tables: payload }, null, 2)}\n`;
}

async function materializeBackup(id: string, existing?: BackupRow): Promise<BackupRow> {
  const record = existing ?? (await db.from("backup_records").select("*").eq("id", id).single()).data as BackupRow;
  if (!record) throw new Error("Backup record not found");

  try {
    await ensureBackupBucket();
    await db.from("backup_records").update({ status: "RUNNING", notes: "Generating backup archive..." }).eq("id", id);

    const loaded = await loadBackupTables(tablesForBackup(record.backup_type, record.module_scope));
    const tables = loaded.tables;
    const legacyGranularFallback = record.backup_type === "GRANULAR_EXPORT" && (record.module_scope ?? []).length === 0;
    const skippedNote = loaded.skippedTables.length > 0
      ? ` Skipped unavailable tables: ${loaded.skippedTables.join(", ")}.`
      : "";
    const legacyNote = legacyGranularFallback
      ? " Legacy granular record had no saved module scope; available granular tables were included."
      : "";
    const isGranular = record.backup_type === "GRANULAR_EXPORT";
    const format = isGranular && record.export_format === "JSON" ? "JSON" : isGranular ? "CSV" : "SQL";
    const content = format === "JSON" ? createJsonArtifact(tables) : format === "CSV" ? createCsvArtifact(tables) : createSqlArtifact(tables);
    const bytes = new TextEncoder().encode(content);
    const digestBytes = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = Array.from(new Uint8Array(digestBytes)).map((value) => value.toString(16).padStart(2, "0")).join("");
    const extension = format.toLowerCase();
    const objectPath = `backups/${id}/${record.backup_type.toLowerCase()}-${id}.${extension}`;
    const contentType = format === "JSON" ? "application/json" : format === "CSV" ? "text/csv" : "application/sql";
    const { error: uploadError } = await db.storage.from(BACKUP_BUCKET).upload(objectPath, bytes, {
      contentType,
      upsert: true,
    });
    if (uploadError) throw new Error(`backup archive upload failed: ${uploadError.message}`);

    const { data: signed, error: signedError } = await db.storage.from(BACKUP_BUCKET).createSignedUrl(objectPath, 900);
    if (signedError || !signed?.signedUrl) throw new Error(`backup signed URL creation failed: ${signedError?.message ?? "no URL returned"}`);

    const { data: saved, error: saveError } = await db.from("backup_records").update({
      status: "COMPLETED",
      completed_at: nowIso(),
      file_size: bytes.byteLength,
      file_path: objectPath,
      file_url: signed.signedUrl,
      checksum,
      integrity_check: "PASSED",
      notes: `Backup completed. ${bytes.byteLength} bytes across ${tables.length} table(s).${legacyNote}${skippedNote}`,
    }).eq("id", id).select("*").single();
    if (saveError) throw new Error(`backup metadata update failed: ${saveError.message}`);
    return saved as unknown as BackupRow;
  } catch (error) {
    await db.from("backup_records").update({
      status: "FAILED",
      completed_at: nowIso(),
      integrity_check: "FAILED",
      notes: `Backup failed: ${error instanceof Error ? error.message : "unknown error"}`,
    }).eq("id", id);
    throw error;
  }
}

async function handleCreateBackup(ctx: AuthContext | null, _req: Request, body: unknown, _p: RouteParams) {
  const b = (body ?? {}) as Record<string, unknown>;
  const requestedType = typeof b.backupType === "string" && b.backupType.trim()
    ? b.backupType.toUpperCase()
    : "FULL";
  const granular = requestedType === "GRANULAR" || requestedType === "GRANULAR_EXPORT";
  const modules = Array.isArray(b.modules)
    ? b.modules.filter((value): value is string => typeof value === "string" && ALLOWED_BACKUP_MODULES.has(value))
    : [];
  const format = b.format === "JSON" ? "JSON" : "CSV";

  if (granular && modules.length === 0) {
    return jsonResponse(fail("At least one export module is required.", "VALIDATION_ERROR"), 400);
  }

  const now = nowIso();
  const { data, error } = await db
    .from("backup_records")
    .insert({
      backup_type: granular ? "GRANULAR_EXPORT" : "FULL_SQL",
      status: "QUEUED",
      started_at: now,
      triggered_by: ctx!.email,
      created_by: ctx!.userId,
      created_by_email: ctx!.email,
      module_scope: modules,
      export_format: granular ? format : null,
      notes: "Backup request queued for the configured backup worker.",
    })
    .select("*")
    .single();
  if (error) throw new Error(`backup insert failed: ${error.message}`);
  const completed = await materializeBackup(String((data as { id: string }).id), data as unknown as BackupRow);
  return jsonResponse(ok(backupDto(completed)), 200);
}

async function handleGetBackupSchedule(_ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { data, error } = await db
    .from("backup_schedules")
    .select("*")
    .eq("schedule_key", "BACKUP_DAILY")
    .maybeSingle();
  if (error) throw new Error(`backup schedule load failed: ${error.message}`);
  if (!data) {
    return jsonResponse(ok({
      scheduleKey: "BACKUP_DAILY",
      cronExpression: "0 0 * * *",
      enabled: false,
    }), 200);
  }
  return jsonResponse(ok({
    id: data.id,
    scheduleKey: data.schedule_key,
    cronExpression: data.cron_expression,
    enabled: data.enabled,
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
  }), 200);
}

async function handleSaveBackupSchedule(ctx: AuthContext | null, _req: Request, body: unknown, _p: RouteParams) {
  const b = (body ?? {}) as Record<string, unknown>;
  const cronExpression = b.cronExpression === "0 0 * * 0" ? "0 0 * * 0" : "0 0 * * *";
  const enabled = b.enabled === true;
  const { data, error } = await db
    .from("backup_schedules")
    .upsert({
      schedule_key: "BACKUP_DAILY",
      cron_expression: cronExpression,
      enabled,
      updated_by: ctx!.userId,
      updated_at: nowIso(),
    }, { onConflict: "schedule_key" })
    .select("*")
    .single();
  if (error) throw new Error(`backup schedule save failed: ${error.message}`);
  return jsonResponse(ok({
    id: data.id,
    scheduleKey: data.schedule_key,
    cronExpression: data.cron_expression,
    enabled: data.enabled,
    updatedAt: data.updated_at,
    updatedBy: ctx!.email,
  }), 200);
}

async function handleDownloadBackup(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data: record, error: lookupError } = await db
    .from("backup_records")
    .select("*")
    .eq("id", p.id)
    .maybeSingle();
  if (lookupError) throw new Error(`backup download lookup failed: ${lookupError.message}`);
  if (!record) return notFound("Backup record not found");

  const target = record as unknown as BackupRow;
  let fileUrl: string | null = null;
  let storageObjectAvailable = false;
  if (target.file_path) {
    await ensureBackupBucket();
    const { data: signed, error: signedError } = await db.storage.from(BACKUP_BUCKET).createSignedUrl(target.file_path, 900);
    if (!signedError && signed?.signedUrl) {
      fileUrl = signed.signedUrl;
      storageObjectAvailable = true;
    }
  }
  if (!storageObjectAvailable) {
    const materialized = await materializeBackup(p.id, target);
    fileUrl = materialized.file_url;
  }
  if (!fileUrl) return jsonResponse(fail("The backup archive is not available yet.", "BACKUP_FILE_NOT_READY"), 409);

  await db.from("backup_records").update({ file_url: fileUrl }).eq("id", p.id);

  const { data, error } = await db.rpc("record_backup_download", {
    p_backup_id: p.id,
    p_user_id: ctx!.userId,
    p_user_email: ctx!.email,
    p_ip_address: ctx!.ip,
    p_user_agent: ctx!.userAgent,
  });
  if (error) throw new Error(`backup download audit failed: ${error.message}`);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.file_url && !fileUrl) {
    return jsonResponse(fail("The backup service did not return a valid file URL.", "BACKUP_FILE_NOT_READY"), 409);
  }
  return jsonResponse(ok({ fileUrl: fileUrl ?? result.file_url, backupId: p.id }), 200);
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

const SUPER_ADMIN_ONLY = { kind: "roles", roles: ["SUPER_ADMIN"] } as const;
const SYSTEM_ADMIN_ONLY = { kind: "roles", roles: ["SYSTEM_ADMIN"] } as const;
const ADMIN_PORTAL_ROLES = { kind: "roles", roles: ["SUPER_ADMIN", "SYSTEM_ADMIN"] } as const;
const OVERSIGHT_ADMIN_ROLES = { kind: "roles", roles: ["SUPER_ADMIN", "COMPLIANCE_MANAGER"] } as const;

const routes = [
  { method: "GET", path: "/admin/users", guard: SUPER_ADMIN_ONLY, handler: handleListUsers },
  { method: "GET", path: "/admin/account-lockouts", guard: SYSTEM_ADMIN_ONLY, handler: handleListLockedUsers },
  { method: "POST", path: "/admin/users/:id/unlock", guard: ADMIN_PORTAL_ROLES, handler: handleUnlockUser },
  { method: "GET", path: "/admin/rbac/users", guard: SUPER_ADMIN_ONLY, handler: handleListUsers },
  { method: "GET", path: "/admin/rbac/roles", guard: SUPER_ADMIN_ONLY, handler: handleListRbacRoles },
  { method: "GET", path: "/admin/rbac/permissions", guard: SUPER_ADMIN_ONLY, handler: handleListRbacPermissions },
  { method: "GET", path: "/admin/rbac/conflicts", guard: SUPER_ADMIN_ONLY, handler: handleListRbacConflicts },
  { method: "PUT", path: "/admin/rbac/users/:userId/roles/:roleId", guard: SUPER_ADMIN_ONLY, handler: handleAssignRole },
  { method: "DELETE", path: "/admin/rbac/users/:userId/roles/:roleId", guard: SUPER_ADMIN_ONLY, handler: handleRevokeRole },
  { method: "PUT", path: "/admin/rbac/roles/:roleId/permissions/:permissionId", guard: SUPER_ADMIN_ONLY, handler: handleGrantPermission },
  { method: "DELETE", path: "/admin/rbac/roles/:roleId/permissions/:permissionId", guard: SUPER_ADMIN_ONLY, handler: handleRevokePermission },
  { method: "PUT", path: "/admin/rbac/hierarchy/:seniorRoleId/:juniorRoleId", guard: SUPER_ADMIN_ONLY, handler: handleAddInheritance },
  { method: "DELETE", path: "/admin/rbac/hierarchy/:seniorRoleId/:juniorRoleId", guard: SUPER_ADMIN_ONLY, handler: handleRemoveInheritance },
  { method: "POST", path: "/admin/rbac/conflicts", guard: SUPER_ADMIN_ONLY, handler: handleCreateConflict },
  { method: "DELETE", path: "/admin/rbac/conflicts/:conflictId", guard: SUPER_ADMIN_ONLY, handler: handleDeactivateConflict },
  { method: "POST", path: "/admin/oversight/start", guard: OVERSIGHT_ADMIN_ROLES, handler: handleStartOversightSession },
  { method: "GET", path: "/admin/oversight/targets", guard: OVERSIGHT_ADMIN_ROLES, handler: handleListOversightTargets },
  { method: "GET", path: "/admin/oversight/current", guard: OVERSIGHT_ADMIN_ROLES, handler: handleCurrentOversightSession },
  { method: "POST", path: "/admin/oversight/stop", guard: OVERSIGHT_ADMIN_ROLES, handler: handleStopOversightSession },
  { method: "GET", path: "/admin/config", guard: SYSTEM_ADMIN_ONLY, handler: handleListConfigs },
  { method: "GET", path: "/admin/config/:key", guard: SYSTEM_ADMIN_ONLY, handler: handleGetConfig },
  { method: "PUT", path: "/admin/config/:key", guard: SYSTEM_ADMIN_ONLY, handler: handleUpsertConfig },
  { method: "GET", path: "/admin/integrations", guard: SYSTEM_ADMIN_ONLY, handler: handleListIntegrations },
  { method: "GET", path: "/admin/integrations/:systemName", guard: SYSTEM_ADMIN_ONLY, handler: handleGetIntegration },
  { method: "GET", path: "/admin/hr-assistance", guard: SUPER_ADMIN_ONLY, handler: handleListHrRequests },
  { method: "GET", path: "/admin/hr-assistance/:id", guard: SUPER_ADMIN_ONLY, handler: handleGetHrRequest },
  { method: "PATCH", path: "/admin/hr-assistance/:id/status", guard: SUPER_ADMIN_ONLY, handler: handleUpdateHrStatus },
  { method: "GET", path: "/admin/notifications", guard: ADMIN_PORTAL_ROLES, handler: handleListAdminNotifications },
  { method: "GET", path: "/admin/notifications/unread-count", guard: ADMIN_PORTAL_ROLES, handler: handleUnreadCount },
  { method: "PUT", path: "/admin/notifications/:id/read", guard: ADMIN_PORTAL_ROLES, handler: handleMarkNotifRead },
  { method: "GET", path: "/admin/backups/latest", guard: SYSTEM_ADMIN_ONLY, handler: handleLatestBackup },
  { method: "GET", path: "/admin/backups/schedule", guard: SYSTEM_ADMIN_ONLY, handler: handleGetBackupSchedule },
  { method: "PUT", path: "/admin/backups/schedule", guard: SYSTEM_ADMIN_ONLY, handler: handleSaveBackupSchedule },
  { method: "POST", path: "/admin/backups/:id/download", guard: SYSTEM_ADMIN_ONLY, handler: handleDownloadBackup },
  { method: "GET", path: "/admin/backups", guard: SYSTEM_ADMIN_ONLY, handler: handleListBackups },
  { method: "POST", path: "/admin/backups", guard: SYSTEM_ADMIN_ONLY, handler: handleCreateBackup },
  { method: "GET", path: "/admin/kpi", guard: ADMIN_PORTAL_ROLES, handler: handleKpi },
] as const;

Deno.serve(createHandler(routes as never, { name: "admin" }));
