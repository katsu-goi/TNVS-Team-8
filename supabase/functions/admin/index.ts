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
const BACKUP_PAGE_SIZE = 1000;
const BACKUP_MAX_TABLE_ROWS = 50_000;
const BACKUP_RETENTION_DAYS = 30;
const BACKUP_MANIFEST_VERSION = 2;
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
    "security_role_incidents",
    "privacy_breach_incidents",
    "login_history",
    "api_request_logs",
  ],
};
const FULL_BACKUP_TABLES = [
  ...new Set([
    "roles",
    "permissions",
    "users",
    "role_conflicts",
    "role_hierarchy",
    "user_roles",
    "role_permissions",
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
    "visitor_clearance_reviews",
    "visitor_workflow_events",
    "hr_assistance_requests",
    "user_activity_events",
    "oversight_sessions",
    "department_scope_assignments",
    "data_subject_requests",
    "cctv_export_requests",
    "governance_settings",
    "department_approvals",
    "document_ai_classifications",
    "document_grants",
    "document_legal_holds",
    "document_retention_assignments",
    "retention_policy_versions",
    "contract_ai_analyses",
    "contract_clauses",
    "contract_obligations",
    "legal_contract_workflows",
    "lifecycle_alert_rules",
    "lifecycle_automation_runs",
    "lifecycle_notification_failures",
    "records_archives",
    "records_custody_events",
    "vendor_risk_assessments",
    "ai_module_config",
    "ai_providers",
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
  const { data: links, error } = await db
    .from("user_roles")
    .select("user_id, role_id");
  if (error) throw new Error(`user_roles load failed: ${error.message}`);
  const roleIds = [...new Set((links ?? []).map((link) => String(link.role_id)))];
  const { data: roles, error: rolesError } = roleIds.length
    ? await db.from("roles").select("id, name").in("id", roleIds)
    : { data: [], error: null };
  if (rolesError) throw new Error(`roles load failed: ${rolesError.message}`);
  const roleNames = new Map((roles ?? []).map((role) => [String(role.id), String(role.name)]));
  const map = new Map<string, string[]>();
  for (const link of links ?? []) {
    const userId = String(link.user_id);
    const name = roleNames.get(String(link.role_id));
    if (!name) continue;
    const list = map.get(userId) ?? [];
    list.push(name);
    map.set(userId, list);
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
  const { data: links, error } = await db
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId);
  if (error) throw new Error(`target roles lookup failed: ${error.message}`);
  const roleIds = [...new Set((links ?? []).map((link) => String(link.role_id)))];
  if (roleIds.length === 0) return [];
  const { data: roles, error: rolesError } = await db.from("roles").select("name").in("id", roleIds);
  if (rolesError) throw new Error(`target role names lookup failed: ${rolesError.message}`);
  return [...new Set((roles ?? []).map((role) => String(role.name).toUpperCase()))];
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
  verification_state: string;
  verified_at: string | null;
  retention_expires_at: string | null;
  is_protected: boolean;
  protected_at: string | null;
  protected_by: string | null;
  source_environment: string;
  schema_version: string | null;
  manifest_version: number;
  manifest_path: string | null;
  data_artifact_path: string | null;
  restore_artifact_path: string | null;
  artifact_objects: ArtifactDescriptor[] | null;
  table_count: number | null;
  row_count: number | null;
  storage_object_count: number | null;
  failure_reason: string | null;
  restore_test_status: string;
  last_restore_test_at: string | null;
  artifact_deleted_at: string | null;
  cleanup_status: string;
};

type ArtifactDescriptor = {
  path: string;
  kind: "MANIFEST" | "DATA_SQL" | "RESTORE_JSON" | "STORAGE_OBJECT";
  size: number;
  sha256: string;
  contentType: string;
};

type StorageManifestEntry = ArtifactDescriptor & {
  sourceBucket: string;
  sourcePath: string;
  linkedDocumentIds: string[];
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
    verificationState: b.verification_state,
    verifiedAt: b.verified_at,
    retentionExpiresAt: b.retention_expires_at,
    protected: b.is_protected,
    protectedAt: b.protected_at,
    sourceEnvironment: b.source_environment,
    schemaVersion: b.schema_version,
    manifestVersion: b.manifest_version,
    manifestPath: b.manifest_path,
    tableCount: b.table_count,
    rowCount: b.row_count,
    storageObjectCount: b.storage_object_count,
    failureReason: b.failure_reason,
    restoreTestStatus: b.restore_test_status,
    lastRestoreTestAt: b.last_restore_test_at,
    cleanupStatus: b.cleanup_status,
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
type LoadedBackupTables = { tables: BackupTableRows[]; totalRows: number; excludedSecretConfigurations: number };

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
  let totalRows = 0;
  let excludedSecretConfigurations = 0;
  for (const table of tableNames) {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += BACKUP_PAGE_SIZE) {
      const { data, error } = await db.from(table).select("*").range(offset, offset + BACKUP_PAGE_SIZE - 1);
      if (error) throw new Error(`required backup table ${table} could not be read: ${error.message}`);
      const page = (data ?? []) as Record<string, unknown>[];
      rows.push(...page);
      if (rows.length > BACKUP_MAX_TABLE_ROWS) {
        throw new Error(`required backup table ${table} exceeds the ${BACKUP_MAX_TABLE_ROWS}-row Edge backup safety limit; use the documented pg_dump procedure`);
      }
      if (page.length < BACKUP_PAGE_SIZE) break;
    }
    let safeRows = rows;
    if (table === "system_configurations") {
      const unsafe = /(?:secret|token|password|credential|private[_-]?key|service[_-]?role|jwt|api[_-]?key)/i;
      safeRows = rows.filter((row) => !unsafe.test(String(row.config_key ?? "")));
      excludedSecretConfigurations += rows.length - safeRows.length;
    }
    result.push({ table, rows: safeRows });
    totalRows += safeRows.length;
  }
  if (result.length === 0) throw new Error("No backup tables were available to export.");
  return { tables: result, totalRows, excludedSecretConfigurations };
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
    "-- Photonic Omega verified logical application-data backup",
    `-- Generated at: ${nowIso()}`,
    "-- Restore this file after applying the current Supabase schema migrations.",
    "-- Secrets from external secret stores and secret-like system configuration keys are intentionally excluded.",
    "BEGIN;",
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
  lines.push("COMMIT;", "");
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
  return `${JSON.stringify({ manifestVersion: BACKUP_MANIFEST_VERSION, generatedAt: nowIso(), tables: payload })}\n`;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function uploadVerified(path: string, bytes: Uint8Array, contentType: string, kind: ArtifactDescriptor["kind"]): Promise<ArtifactDescriptor> {
  if (bytes.byteLength === 0) throw new Error(`${kind} artifact is empty`);
  const expected = await sha256(bytes);
  const { error: uploadError } = await db.storage.from(BACKUP_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (uploadError) throw new Error(`${kind} upload failed: ${uploadError.message}`);
  const { data: downloaded, error: downloadError } = await db.storage.from(BACKUP_BUCKET).download(path);
  if (downloadError || !downloaded) throw new Error(`${kind} verification download failed: ${downloadError?.message ?? "no bytes"}`);
  const restoredBytes = new Uint8Array(await downloaded.arrayBuffer());
  const actual = await sha256(restoredBytes);
  if (restoredBytes.byteLength !== bytes.byteLength || actual !== expected) throw new Error(`${kind} integrity verification failed`);
  return { path, kind, size: bytes.byteLength, sha256: expected, contentType };
}

async function downloadVerified(descriptor: ArtifactDescriptor): Promise<Uint8Array> {
  const { data, error } = await db.storage.from(BACKUP_BUCKET).download(descriptor.path);
  if (error || !data) throw new Error(`${descriptor.kind} artifact is unavailable`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength !== descriptor.size || await sha256(bytes) !== descriptor.sha256) {
    throw new Error(`${descriptor.kind} artifact checksum mismatch`);
  }
  return bytes;
}

async function copyStorageObjects(backupId: string, tables: BackupTableRows[]): Promise<StorageManifestEntry[]> {
  const { data: inventory, error } = await db.rpc("phase7_storage_inventory");
  if (error) throw new Error(`storage inventory failed: ${error.message}`);
  const documentRows = tables.find((entry) => entry.table === "documents")?.rows ?? [];
  const copied: StorageManifestEntry[] = [];
  for (const object of (inventory ?? []) as Array<{ bucket_id: string; object_name: string; object_size: number }>) {
    const { data: source, error: sourceError } = await db.storage.from(object.bucket_id).download(object.object_name);
    if (sourceError || !source) throw new Error(`required private Storage object could not be read`);
    const bytes = new Uint8Array(await source.arrayBuffer());
    if (Number(object.object_size ?? 0) > 0 && bytes.byteLength !== Number(object.object_size)) {
      throw new Error("private Storage source size changed during backup");
    }
    const path = `backups/${backupId}/storage/${object.bucket_id}/${encodeURIComponent(object.object_name)}`;
    const artifact = await uploadVerified(path, bytes, source.type || "application/octet-stream", "STORAGE_OBJECT");
    copied.push({
      ...artifact,
      sourceBucket: object.bucket_id,
      sourcePath: object.object_name,
      linkedDocumentIds: documentRows.filter((row) => row.file_path === object.object_name).map((row) => String(row.id)),
    });
  }
  return copied;
}

function artifactList(record: BackupRow): ArtifactDescriptor[] {
  return Array.isArray(record.artifact_objects) ? record.artifact_objects : [];
}

async function updateScheduleOutcome(success: boolean) {
  const patch = success
    ? { last_success_at: nowIso(), consecutive_failures: 0 }
    : { last_failure_at: nowIso() };
  if (!success) {
    const { data } = await db.from("backup_schedules").select("consecutive_failures").eq("schedule_key", "BACKUP_DAILY").maybeSingle();
    (patch as Record<string, unknown>).consecutive_failures = Number(data?.consecutive_failures ?? 0) + 1;
  }
  await db.from("backup_schedules").update({ ...patch, updated_at: nowIso() }).eq("schedule_key", "BACKUP_DAILY");
}

async function materializeBackup(id: string, existing?: BackupRow): Promise<BackupRow> {
  const record = existing ?? (await db.from("backup_records").select("*").eq("id", id).single()).data as BackupRow;
  if (!record) throw new Error("Backup record not found");
  const uploadedPaths: string[] = [];
  try {
    await ensureBackupBucket();
    const { error: runningError } = await db.from("backup_records").update({
      status: "RUNNING", notes: "Capturing required tables and private Storage objects.", failure_reason: null,
    }).eq("id", id);
    if (runningError) throw new Error(`backup could not enter RUNNING: ${runningError.message}`);
    const loaded = await loadBackupTables(tablesForBackup(record.backup_type, record.module_scope));
    const tables = loaded.tables;
    const isGranular = record.backup_type === "GRANULAR_EXPORT";
    const format = isGranular && record.export_format === "JSON" ? "JSON" : isGranular ? "CSV" : "SQL";
    const dataContent = format === "JSON" ? createJsonArtifact(tables) : format === "CSV" ? createCsvArtifact(tables) : createSqlArtifact(tables);
    const dataPath = `backups/${id}/data.${format.toLowerCase()}`;
    const dataArtifact = await uploadVerified(dataPath, new TextEncoder().encode(dataContent),
      format === "JSON" ? "application/json" : format === "CSV" ? "text/csv" : "application/sql", "DATA_SQL");
    uploadedPaths.push(dataArtifact.path);
    const restoreArtifact = await uploadVerified(`backups/${id}/restore.json`, new TextEncoder().encode(createJsonArtifact(tables)), "application/json", "RESTORE_JSON");
    uploadedPaths.push(restoreArtifact.path);
    const storageObjects = isGranular ? [] : await copyStorageObjects(id, tables);
    uploadedPaths.push(...storageObjects.map((entry) => entry.path));
    const { data: schemaInventory, error: schemaError } = await db.rpc("phase7_schema_inventory");
    if (schemaError) throw new Error(`schema inventory failed: ${schemaError.message}`);
    const generatedAt = nowIso();
    const manifest = {
      manifestVersion: BACKUP_MANIFEST_VERSION,
      backupId: id,
      backupType: record.backup_type,
      generatedAt,
      sourceEnvironment: "production",
      schema: schemaInventory,
      database: {
        tableCount: tables.length,
        rowCount: loaded.totalRows,
        tables: tables.map((entry) => ({ table: entry.table, rows: entry.rows.length })),
        downloadableArtifact: dataArtifact,
        restoreArtifact,
        excludedSecretConfigurations: loaded.excludedSecretConfigurations,
      },
      storage: { bucketCount: 1, objectCount: storageObjects.length, objects: storageObjects },
      exclusions: ["Supabase/Vercel/AI secret stores", "refresh tokens", "active sessions", "online-presence state", "secret-like system configuration values"],
    };
    const manifestPath = `backups/${id}/manifest.json`;
    const manifestArtifact = await uploadVerified(manifestPath, new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`), "application/json", "MANIFEST");
    uploadedPaths.push(manifestArtifact.path);
    const artifacts: ArtifactDescriptor[] = [dataArtifact, restoreArtifact, ...storageObjects, manifestArtifact];
    const totalSize = artifacts.reduce((total, artifact) => total + artifact.size, 0);

    const { data: saved, error: saveError } = await db.from("backup_records").update({
      status: "COMPLETED",
      completed_at: generatedAt,
      file_size: totalSize,
      file_path: manifestPath,
      file_url: null,
      checksum: manifestArtifact.sha256,
      integrity_check: "PASSED",
      verification_state: "INTEGRITY_VERIFIED",
      verified_at: generatedAt,
      retention_expires_at: new Date(Date.now() + BACKUP_RETENTION_DAYS * 86_400_000).toISOString(),
      source_environment: "production",
      schema_version: String((schemaInventory as Record<string, unknown>)?.schemaVersion ?? "unknown"),
      manifest_version: BACKUP_MANIFEST_VERSION,
      manifest_path: manifestPath,
      data_artifact_path: dataPath,
      restore_artifact_path: restoreArtifact.path,
      artifact_objects: artifacts,
      table_count: tables.length,
      row_count: loaded.totalRows,
      storage_object_count: storageObjects.length,
      failure_reason: null,
      cleanup_status: "RETAINED",
      notes: `Verified backup completed: ${loaded.totalRows} rows in ${tables.length} required table(s), ${storageObjects.length} private Storage object(s), ${totalSize} bytes.`,
    }).eq("id", id).select("*").single();
    if (saveError) throw new Error(`backup metadata update failed: ${saveError.message}`);
    if (record.triggered_by === "pg_cron") await updateScheduleOutcome(true);
    return saved as unknown as BackupRow;
  } catch (error) {
    if (uploadedPaths.length > 0) await db.storage.from(BACKUP_BUCKET).remove(uploadedPaths);
    await db.from("backup_records").update({
      status: "FAILED",
      completed_at: nowIso(),
      integrity_check: "FAILED",
      verification_state: "FAILED",
      failure_reason: error instanceof Error ? error.message : "unknown backup error",
      file_path: null,
      file_url: null,
      manifest_path: null,
      data_artifact_path: null,
      restore_artifact_path: null,
      artifact_objects: [],
      notes: `Backup failed without a verified artifact.`,
    }).eq("id", id);
    if (record.triggered_by === "pg_cron") await updateScheduleOutcome(false);
    throw error;
  }
}

async function createBackupRecord(ctx: AuthContext | null, backupType: string, modules: string[], format: string, triggeredBy: string) {
  const now = nowIso();
  return await db.from("backup_records").insert({
    backup_type: backupType,
    status: "REQUESTED",
    started_at: now,
    triggered_by: triggeredBy,
    created_by: ctx?.userId ?? null,
    created_by_email: ctx?.email ?? triggeredBy,
    module_scope: modules,
    export_format: backupType === "GRANULAR_EXPORT" ? format : null,
    integrity_check: "NOT_VERIFIED",
    verification_state: "NOT_VERIFIED",
    source_environment: "production",
    retention_expires_at: new Date(Date.now() + BACKUP_RETENTION_DAYS * 86_400_000).toISOString(),
    notes: "Backup requested; no success is recorded until every artifact is re-downloaded and hashed.",
  }).select("*").single();
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

  const { data, error } = await createBackupRecord(ctx, granular ? "GRANULAR_EXPORT" : "FULL_SQL", modules, format, ctx!.email);
  if (error) {
    if (error.code === "23505") return jsonResponse(fail("Another backup is already REQUESTED or RUNNING.", "BACKUP_ALREADY_RUNNING"), 409);
    throw new Error(`backup request failed: ${error.message}`);
  }
  try {
    const completed = await materializeBackup(String((data as { id: string }).id), data as unknown as BackupRow);
    return jsonResponse(ok(backupDto(completed)), 200);
  } catch (error) {
    return jsonResponse(fail("Backup failed; no verified artifact was recorded.", "BACKUP_FAILED", [error instanceof Error ? error.message : "unknown failure"]), 500);
  }
}

async function schedulerAuthorized(req: Request): Promise<boolean> {
  const token = req.headers.get("x-backup-scheduler-token") ?? "";
  if (!token) return false;
  const { data, error } = await db.from("backup_schedules").select("scheduler_token_hash").eq("schedule_key", "BACKUP_DAILY").maybeSingle();
  if (error || !data?.scheduler_token_hash) return false;
  return await sha256(new TextEncoder().encode(token)) === data.scheduler_token_hash;
}

async function handleScheduledBackup(_ctx: AuthContext | null, req: Request) {
  if (!await schedulerAuthorized(req)) return notFound("Not found");
  const { data, error } = await createBackupRecord(null, "FULL_SQL", [], "SQL", "pg_cron");
  if (error) {
    if (error.code === "23505") return jsonResponse(ok({ skipped: true, reason: "BACKUP_ALREADY_RUNNING" }), 202);
    throw new Error(`scheduled backup request failed: ${error.message}`);
  }
  let completed: BackupRow;
  try {
    completed = await materializeBackup(String((data as { id: string }).id), data as unknown as BackupRow);
  } catch (error) {
    return jsonResponse(fail("Scheduled backup failed without a verified artifact.", "BACKUP_FAILED", [error instanceof Error ? error.message : "unknown failure"]), 500);
  }
  try {
    await handleBackupRetentionCleanup(null, req, null);
  } catch (cleanupError) {
    console.error("scheduled retention cleanup failed:", cleanupError instanceof Error ? cleanupError.message : "unknown cleanup failure");
  }
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
    lastDispatchedAt: data.last_dispatched_at,
    lastSuccessAt: data.last_success_at,
    lastFailureAt: data.last_failure_at,
    consecutiveFailures: data.consecutive_failures,
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
    lastDispatchedAt: data.last_dispatched_at,
    lastSuccessAt: data.last_success_at,
    lastFailureAt: data.last_failure_at,
    consecutiveFailures: data.consecutive_failures,
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
  if (target.status !== "COMPLETED" || !["INTEGRITY_VERIFIED", "RESTORE_VERIFIED"].includes(target.verification_state)) {
    return jsonResponse(fail("Only a completed, integrity-verified backup can be downloaded.", "BACKUP_FILE_NOT_READY"), 409);
  }
  const artifactPath = target.data_artifact_path;
  if (!artifactPath) return jsonResponse(fail("The verified data artifact is unavailable.", "BACKUP_FILE_NOT_READY"), 409);
  const descriptor = artifactList(target).find((entry) => entry.path === artifactPath);
  if (!descriptor) return jsonResponse(fail("The data artifact is not present in the integrity manifest.", "BACKUP_FILE_NOT_READY"), 409);
  await downloadVerified(descriptor);
  const { data: signed, error: signedError } = await db.storage.from(BACKUP_BUCKET).createSignedUrl(artifactPath, 300);
  if (signedError || !signed?.signedUrl) return jsonResponse(fail("The verified backup could not be authorized for download.", "BACKUP_FILE_NOT_READY"), 409);

  const { error } = await db.rpc("record_backup_download", {
    p_backup_id: p.id,
    p_user_id: ctx!.userId,
    p_user_email: ctx!.email,
    p_ip_address: ctx!.ip,
    p_user_agent: ctx!.userAgent,
  });
  if (error) throw new Error(`backup download audit failed: ${error.message}`);
  return jsonResponse(ok({ fileUrl: signed.signedUrl, backupId: p.id, expiresInSeconds: 300 }), 200);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function recordHash(value: unknown): Promise<string> {
  return await sha256(new TextEncoder().encode(stableJson(value)));
}

async function handleVerifyBackupRestore(ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const { data, error } = await db.from("backup_records").select("*").eq("id", p.id).maybeSingle();
  if (error) throw new Error(`backup restore lookup failed: ${error.message}`);
  if (!data) return notFound("Backup record not found");
  const record = data as unknown as BackupRow;
  if (record.status !== "COMPLETED" || !record.manifest_path || !record.restore_artifact_path) {
    return jsonResponse(fail("Restore verification requires a completed backup with verified artifacts.", "RESTORE_NOT_READY"), 409);
  }
  const descriptors = artifactList(record);
  const manifestDescriptor = descriptors.find((entry) => entry.path === record.manifest_path);
  const restoreDescriptor = descriptors.find((entry) => entry.path === record.restore_artifact_path);
  if (!manifestDescriptor || !restoreDescriptor) return jsonResponse(fail("Backup integrity manifest is incomplete.", "RESTORE_NOT_READY"), 409);

  const testId = crypto.randomUUID();
  const { error: testInsertError } = await db.from("backup_restore_tests").insert({
    id: testId, backup_id: record.id, status: "RUNNING", created_by: ctx!.userId, created_by_email: ctx!.email,
  });
  if (testInsertError) throw new Error(`restore test record failed: ${testInsertError.message}`);
  const restoreTempPaths: string[] = [];
  try {
    const manifestBytes = await downloadVerified(manifestDescriptor);
    if ((body as Record<string, unknown> | null)?.corruptTest === true) {
      const corrupt = manifestBytes.slice();
      corrupt[0] = corrupt[0] ^ 1;
      if (await sha256(corrupt) === manifestDescriptor.sha256) throw new Error("controlled corruption was not detected");
      await db.from("backup_restore_tests").update({
        status: "FAILED_EXPECTED", completed_at: nowIso(), failure_reason: "Controlled manifest checksum mismatch rejected before restore.",
      }).eq("id", testId);
      return jsonResponse(ok({ expectedFailure: true, reason: "CHECKSUM_MISMATCH", productionChanged: false, restoreTestId: testId }), 200);
    }
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as { storage?: { objects?: StorageManifestEntry[] } };
    const restoreBytes = await downloadVerified(restoreDescriptor);
    const archive = JSON.parse(new TextDecoder().decode(restoreBytes)) as { tables?: Record<string, Record<string, unknown>[]> };
    const ids = ((body as Record<string, unknown> | null)?.fixtureIds ?? {}) as Record<string, unknown>;
    const names: Record<string, string> = { facility: "facilities", room: "rooms", reservation: "reservations", visitor: "visitors", document: "documents", contract: "contracts" };
    const fixture: Record<string, Record<string, unknown>> = {};
    for (const [key, table] of Object.entries(names)) {
      const requestedId = typeof ids[key] === "string" ? String(ids[key]) : "";
      const row = (archive.tables?.[table] ?? []).find((candidate) => String(candidate.id) === requestedId);
      if (!row) throw new Error(`required restore fixture ${table} was not found in the verified artifact`);
      fixture[key] = row;
    }
    const { data: restored, error: restoreError } = await db.rpc("phase7_restore_fixture", { p_run_id: testId, p_payload: fixture });
    if (restoreError) throw new Error(`isolated schema restore failed: ${restoreError.message}`);
    const relationResult = restored as Record<string, unknown>;
    const relationshipsVerified = relationResult.facilityRoomLinked === true
      && relationResult.roomReservationLinked === true
      && relationResult.documentContractLinked === true;
    if (!relationshipsVerified) throw new Error("isolated schema relationship verification failed");

    const storageEntry = (manifest.storage?.objects ?? []).find((entry) => entry.linkedDocumentIds?.includes(String(fixture.document.id)));
    if (!storageEntry) throw new Error("linked private Storage object is absent from the backup manifest");
    const originalCopy = await downloadVerified(storageEntry);
    const restoredPath = `restore-tests/${testId}/${encodeURIComponent(storageEntry.sourcePath)}`;
    const restoredArtifact = await uploadVerified(restoredPath, originalCopy, storageEntry.contentType, "STORAGE_OBJECT");
    restoreTempPaths.push(restoredPath);
    const restoredCopy = await downloadVerified(restoredArtifact);
    const originalSha = await sha256(originalCopy);
    const restoredSha = await sha256(restoredCopy);
    if (originalSha !== restoredSha) throw new Error("isolated Storage restore checksum mismatch");

    const signatures: Record<string, string> = {};
    for (const [key, row] of Object.entries(fixture)) signatures[key] = await recordHash(row);
    await db.from("backup_restore_tests").update({
      status: "VERIFIED", completed_at: nowIso(), checksum_verified: true, restored_record_count: 6,
      relationships_verified: true, storage_verified: true, original_sha256: originalSha, restored_sha256: restoredSha,
    }).eq("id", testId);
    await db.from("backup_records").update({
      verification_state: "RESTORE_VERIFIED", restore_test_status: "VERIFIED", last_restore_test_at: nowIso(), verified_at: nowIso(),
    }).eq("id", record.id);
    return jsonResponse(ok({
      restoreTestId: testId, checksumVerified: true, restoredRecordCount: 6, relationshipsVerified: true,
      storageVerified: true, originalSha256: originalSha, restoredSha256: restoredSha,
      restoredIds: Object.fromEntries(Object.entries(fixture).map(([key, row]) => [key, row.id])),
      restoredRecordHashes: signatures,
      documentStorageLinked: storageEntry.sourcePath === fixture.document.file_path,
    }), 200);
  } catch (restoreError) {
    await db.from("backup_restore_tests").update({
      status: "FAILED", completed_at: nowIso(), failure_reason: restoreError instanceof Error ? restoreError.message : "restore verification failed",
    }).eq("id", testId);
    await db.from("backup_records").update({ restore_test_status: "FAILED", last_restore_test_at: nowIso() }).eq("id", record.id);
    return jsonResponse(fail("Isolated restore verification failed; production was not modified.", "RESTORE_VERIFICATION_FAILED", [restoreError instanceof Error ? restoreError.message : "unknown failure"]), 422);
  } finally {
    await db.rpc("phase7_cleanup_restore_fixture", { p_run_id: testId });
    if (restoreTempPaths.length > 0) await db.storage.from(BACKUP_BUCKET).remove(restoreTempPaths);
  }
}

async function handleBackupProtection(ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const isProtected = (body as Record<string, unknown> | null)?.protected === true;
  const { data, error } = await db.from("backup_records").update({
    is_protected: isProtected,
    protected_at: isProtected ? nowIso() : null,
    protected_by: ctx!.userId,
  }).eq("id", p.id).select("*").maybeSingle();
  if (error) throw new Error(`backup protection update failed: ${error.message}`);
  if (!data) return notFound("Backup record not found");
  return jsonResponse(ok(backupDto(data as unknown as BackupRow)), 200);
}

async function removeBackupArtifacts(record: BackupRow): Promise<void> {
  const paths = artifactList(record).map((entry) => entry.path);
  if (paths.length === 0) return;
  const { error } = await db.storage.from(BACKUP_BUCKET).remove(paths);
  if (error) throw new Error(`backup artifact deletion failed: ${error.message}`);
  for (const path of paths) {
    const probe = await db.storage.from(BACKUP_BUCKET).download(path);
    if (!probe.error) throw new Error("backup artifact deletion could not be verified");
  }
}

async function handleBackupRetentionCleanup(_ctx: AuthContext | null, _req: Request, body: unknown) {
  const requestedIds = Array.isArray((body as Record<string, unknown> | null)?.backupIds)
    ? ((body as Record<string, unknown>).backupIds as unknown[])
      .filter((value): value is string => typeof value === "string").slice(0, 50)
    : [];
  let query = db.from("backup_records").select("*")
    .eq("is_protected", false).lt("retention_expires_at", nowIso()).neq("cleanup_status", "DELETED").limit(50);
  if (requestedIds.length > 0) query = query.in("id", requestedIds);
  const { data, error } = await query;
  if (error) throw new Error(`backup retention lookup failed: ${error.message}`);
  let deleted = 0;
  let failed = 0;
  for (const raw of data ?? []) {
    const record = raw as unknown as BackupRow;
    await db.from("backup_records").update({ cleanup_status: "DELETE_RUNNING" }).eq("id", record.id);
    try {
      await removeBackupArtifacts(record);
      await db.from("backup_records").update({
        cleanup_status: "DELETED", artifact_deleted_at: nowIso(), file_path: null, file_url: null,
        manifest_path: null, data_artifact_path: null, restore_artifact_path: null, artifact_objects: [],
      }).eq("id", record.id);
      deleted += 1;
    } catch (cleanupError) {
      await db.from("backup_records").update({ cleanup_status: "DELETE_FAILED", failure_reason: cleanupError instanceof Error ? cleanupError.message : "cleanup failed" }).eq("id", record.id);
      failed += 1;
    }
  }
  return jsonResponse(ok({ eligible: data?.length ?? 0, deleted, failed }), failed > 0 ? 207 : 200);
}

async function handleBackupHealth() {
  const [latestSuccess, latestFailure, schedule] = await Promise.all([
    db.from("backup_records").select("id,completed_at,verification_state").eq("status", "COMPLETED").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("backup_records").select("id,completed_at,failure_reason").eq("status", "FAILED").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("backup_schedules").select("*").eq("schedule_key", "BACKUP_DAILY").maybeSingle(),
  ]);
  for (const result of [latestSuccess, latestFailure, schedule]) if (result.error) throw new Error(`backup health query failed: ${result.error!.message}`);
  const scheduleRow = schedule.data;
  return jsonResponse(ok({
    lastSuccess: latestSuccess.data ?? null,
    lastFailure: latestFailure.data ?? null,
    scheduleEnabled: scheduleRow?.enabled ?? false,
    cronExpression: scheduleRow?.cron_expression ?? null,
    nextSchedule: scheduleRow?.enabled ? (scheduleRow.cron_expression === "0 0 * * 0" ? "Next Sunday 00:00 UTC" : "Next day 00:00 UTC") : null,
    consecutiveFailures: scheduleRow?.consecutive_failures ?? 0,
  }), 200);
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
  kpi.global.unreadNotifications = await countRaw("employee_notifications", (q: any) =>
    q.eq("recipient_id", _ctx!.userId).eq("is_read", false).eq("is_deleted", false));

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
  { method: "GET", path: "/admin/backups/latest", guard: SYSTEM_ADMIN_ONLY, handler: handleLatestBackup },
  { method: "GET", path: "/admin/backups/health", guard: SYSTEM_ADMIN_ONLY, handler: handleBackupHealth },
  { method: "GET", path: "/admin/backups/schedule", guard: SYSTEM_ADMIN_ONLY, handler: handleGetBackupSchedule },
  { method: "PUT", path: "/admin/backups/schedule", guard: SYSTEM_ADMIN_ONLY, handler: handleSaveBackupSchedule },
  { method: "POST", path: "/admin/backups/scheduled", guard: { kind: "public" }, handler: handleScheduledBackup },
  { method: "POST", path: "/admin/backups/cleanup", guard: SYSTEM_ADMIN_ONLY, handler: handleBackupRetentionCleanup },
  { method: "POST", path: "/admin/backups/:id/verify-restore", guard: SYSTEM_ADMIN_ONLY, handler: handleVerifyBackupRestore },
  { method: "PATCH", path: "/admin/backups/:id/protection", guard: SYSTEM_ADMIN_ONLY, handler: handleBackupProtection },
  { method: "POST", path: "/admin/backups/:id/download", guard: SYSTEM_ADMIN_ONLY, handler: handleDownloadBackup },
  { method: "GET", path: "/admin/backups", guard: SYSTEM_ADMIN_ONLY, handler: handleListBackups },
  { method: "POST", path: "/admin/backups", guard: SYSTEM_ADMIN_ONLY, handler: handleCreateBackup },
] as const;

Deno.serve(createHandler(routes as never, { name: "admin" }));
