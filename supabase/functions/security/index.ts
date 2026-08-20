import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminDb } from "../_shared/db.ts";

const db = adminDb();

// NOTE: Spring's SecurityAdminController returns RAW objects (ResponseEntity.ok(...))
// — NO ApiResponse envelope. These handlers therefore return raw JSON.

function raw(data: unknown, status = 200): Response {
  return jsonResponse(data, status);
}

function emptyOk(): Response {
  return new Response(null, { status: 200, headers: corsHeaders() });
}

// ---------------------------------------------------------------------------
// DTO mappers (snake_case DB -> camelCase JSON, matching JPA entities)
// ---------------------------------------------------------------------------

type SecurityLogRow = Record<string, unknown>;
function securityLogDto(r: SecurityLogRow) {
  return {
    id: r.id, timestamp: r.timestamp, userId: r.user_id, username: r.username,
    fullName: r.full_name, role: r.role, department: r.department,
    ipAddress: r.ip_address, deviceName: r.device_name, browser: r.browser,
    operatingSystem: r.operating_system, sessionId: r.session_id, requestId: r.request_id,
    apiEndpoint: r.api_endpoint, httpMethod: r.http_method, action: r.action,
    module: r.module, affectedRecord: r.affected_record, previousValue: r.previous_value,
    newValue: r.new_value, status: r.status, reason: r.reason, geoLocation: r.geo_location,
    riskLevel: r.risk_level,
  };
}

function activeSessionDto(r: Record<string, unknown>) {
  return {
    id: r.id, sessionId: r.session_id, userId: r.user_id, username: r.username,
    fullName: r.full_name, role: r.role, ipAddress: r.ip_address, browser: r.browser,
    deviceName: r.device_name, country: r.country, loginTime: r.login_time,
    lastActivity: r.last_activity, status: r.status,
  };
}

function blockedIpDto(r: Record<string, unknown>) {
  return {
    id: r.id, ipAddress: r.ip_address, reason: r.reason, blockedBy: r.blocked_by,
    blockedAt: r.blocked_at, expiresAt: r.expires_at, status: r.status,
    attemptsCount: r.attempts_count,
  };
}

function securityAlertDto(r: Record<string, unknown>) {
  return {
    id: r.id, createdAt: r.created_at, title: r.title, description: r.description,
    severity: r.severity, alertType: r.alert_type, targetIp: r.target_ip,
    targetUserId: r.target_user_id, status: r.status, resolvedBy: r.resolved_by,
    resolvedAt: r.resolved_at,
  };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

async function handleMetrics(_ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const countBy = async (table: string, col: string, val: string) => {
    const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).eq(col, val);
    if (error) throw new Error(`${table} count failed: ${error.message}`);
    return count ?? 0;
  };
  const activeSessions = await countBy("active_sessions", "status", "ACTIVE");
  const failedLogins = await (async () => {
    const { count, error } = await db.from("login_history").select("id", { count: "exact", head: true })
      .eq("status", "FAILED").in("username", ["admin", "user"]);
    if (error) throw new Error(`login_history count failed: ${error.message}`);
    return count ?? 0;
  })();
  const blockedIps = await countBy("blocked_ips", "status", "ACTIVE");
  const securityAlerts = await countBy("security_alerts", "status", "UNRESOLVED");

  return raw({
    activeSessions,
    failedLoginAttempts: failedLogins,
    blockedIpsCount: blockedIps,
    activeAlertsCount: securityAlerts,
    ddosBlockedRequests: 0,
    suspiciousActivitiesCount: securityAlerts > 0 ? securityAlerts + 2 : 0,
  });
}

// ---------------------------------------------------------------------------
// Logs (Spring Page shape)
// ---------------------------------------------------------------------------

async function handleLogs(_ctx: AuthContext | null, req: Request, _body: unknown, _p: RouteParams) {
  const qp = new URL(req.url).searchParams;
  const page = parseInt(qp.get("page") ?? "0", 10);
  const size = parseInt(qp.get("size") ?? "15", 10);
  const userId = qp.get("userId");
  const role = qp.get("role");
  const module = qp.get("module");
  const riskLevel = qp.get("riskLevel");
  const ipAddress = qp.get("ipAddress");
  const startDate = qp.get("startDate");
  const endDate = qp.get("endDate");

  let query = db.from("security_logs").select("*", { count: "exact" }).order("timestamp", { ascending: false });
  if (userId) query = query.eq("user_id", userId);
  if (role) query = query.eq("role", role);
  if (module) query = query.eq("module", module);
  if (riskLevel) query = query.eq("risk_level", riskLevel);
  if (ipAddress) query = query.eq("ip_address", ipAddress);
  if (startDate) query = query.gte("timestamp", startDate);
  if (endDate) query = query.lte("timestamp", endDate);
  query = query.range(page * size, page * size + size - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(`security logs query failed: ${error.message}`);

  const content = (data ?? []).map((r: Record<string, unknown>) => securityLogDto(r));
  const total = count ?? 0;
  const totalPages = size > 0 ? Math.ceil(total / size) : 0;

  return raw({
    content,
    pageable: { pageNumber: page, pageSize: size, sort: { sorted: true, unsorted: false, empty: false }, offset: page * size, paged: true, unpaged: false },
    totalElements: total,
    last: page >= totalPages - 1,
    totalPages,
    size,
    number: page,
    sort: { sorted: true, unsorted: false, empty: false },
    first: page === 0,
    numberOfElements: content.length,
    empty: content.length === 0,
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

async function handleSessions(_ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { data, error } = await db.from("active_sessions").select("*").eq("status", "ACTIVE");
  if (error) throw new Error(`sessions load failed: ${error.message}`);
  return raw((data ?? []).map((r: Record<string, unknown>) => activeSessionDto(r)));
}

async function handleRevokeSession(_ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { error } = await db.from("active_sessions").update({ status: "REVOKED" }).eq("id", p.id);
  if (error) throw new Error(`session revoke failed: ${error.message}`);
  return emptyOk();
}

// ---------------------------------------------------------------------------
// Blocked IPs
// ---------------------------------------------------------------------------

async function handleBlockedIps(_ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { data, error } = await db.from("blocked_ips").select("*");
  if (error) throw new Error(`blocked ips load failed: ${error.message}`);
  return raw((data ?? []).map((r: Record<string, unknown>) => blockedIpDto(r)));
}

async function handleBlockIp(_ctx: AuthContext | null, req: Request, body: unknown, _p: RouteParams) {
  const qp = new URL(req.url).searchParams;
  const b = body as Record<string, unknown> | null;
  const ipAddress = (typeof b?.ipAddress === "string" ? b.ipAddress : qp.get("ipAddress")) ?? "";
  const reason = (typeof b?.reason === "string" ? b.reason : qp.get("reason")) ?? "";
  const durationMinutesRaw = b?.durationMinutes !== undefined ? String(b.durationMinutes) : qp.get("durationMinutes");
  if (!ipAddress || !reason) {
    return raw({ error: "ipAddress and reason are required" }, 400);
  }
  const durationMinutes = durationMinutesRaw ? parseInt(durationMinutesRaw, 10) : null;
  const expiresAt = durationMinutes && durationMinutes > 0
    ? new Date(Date.now() + durationMinutes * 60_000).toISOString()
    : null;

  const { data, error } = await db.from("blocked_ips").insert({
    ip_address: ipAddress,
    reason,
    blocked_by: "ADMIN",
    blocked_at: new Date().toISOString(),
    expires_at: expiresAt,
    status: "ACTIVE",
  }).select("*").single();
  if (error) throw new Error(`block ip failed: ${error.message}`);
  return raw(blockedIpDto(data as Record<string, unknown>));
}

async function handleUnblockIp(_ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data } = await db.from("blocked_ips").select("id").eq("ip_address", p.ipAddress).eq("status", "ACTIVE").maybeSingle();
  if (data) {
    const { error } = await db.from("blocked_ips").update({ status: "UNBLOCKED" }).eq("id", (data as { id: string }).id);
    if (error) throw new Error(`unblock ip failed: ${error.message}`);
  }
  return emptyOk();
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

async function handleAlerts(_ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const { data, error } = await db.from("security_alerts").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(`alerts load failed: ${error.message}`);
  return raw((data ?? []).map((r) => securityAlertDto(r as Record<string, unknown>)));
}

async function handleResolveAlert(_ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  const qp = new URL(req.url).searchParams;
  const b = body as Record<string, unknown> | null;
  const resolvedBy = (typeof b?.resolvedBy === "string" ? b.resolvedBy : qp.get("resolvedBy")) ?? "ADMIN";
  const { error } = await db.from("security_alerts").update({
    status: "RESOLVED",
    resolved_by: resolvedBy,
    resolved_at: new Date().toISOString(),
  }).eq("id", p.id);
  if (error) throw new Error(`alert resolve failed: ${error.message}`);
  return emptyOk();
}

// ---------------------------------------------------------------------------

const routes = [
  { method: "GET", path: "/security/admin/metrics", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleMetrics },
  { method: "GET", path: "/security/admin/logs", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleLogs },
  { method: "GET", path: "/security/admin/sessions", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleSessions },
  { method: "POST", path: "/security/admin/sessions/:id/revoke", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleRevokeSession },
  { method: "GET", path: "/security/admin/blocked-ips", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleBlockedIps },
  { method: "POST", path: "/security/admin/blocked-ips", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleBlockIp },
  { method: "DELETE", path: "/security/admin/blocked-ips/:ipAddress", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleUnblockIp },
  { method: "GET", path: "/security/admin/alerts", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleAlerts },
  { method: "POST", path: "/security/admin/alerts/:id/resolve", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleResolveAlert },
] as const;

Deno.serve(createHandler(routes as never, { name: "security" }));