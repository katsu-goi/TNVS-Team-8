import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminDb } from "../_shared/db.ts";
import { isPrivateOrLocal, resolveClientIp } from "../_shared/ip.ts";

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

function auditLogDto(r: Record<string, unknown>) {
  return {
    id: r.id,
    timestamp: r.created_at,
    userId: r.user_id,
    username: r.user_email,
    fullName: r.user_full_name,
    role: null,
    module: r.module ?? "SYSTEM",
    action: r.action,
    ipAddress: r.ip_address,
    riskLevel: r.severity ?? "INFO",
    status: r.status ?? "SUCCESS",
    source: "APPLICATION_AUDIT",
  };
}

function globalSecurityLogDto(r: Record<string, unknown>) {
  return {
    id: r.id,
    timestamp: r.timestamp ?? r.created_at,
    userId: r.user_id,
    username: r.username,
    fullName: r.full_name,
    role: r.role,
    module: r.module ?? "SECURITY",
    action: r.action,
    ipAddress: r.ip_address,
    riskLevel: r.risk_level ?? "LOW",
    status: r.status ?? "SUCCESS",
    source: "SECURITY_AUDIT",
  };
}

function adminAuditLogDto(r: Record<string, unknown>, actor?: Record<string, unknown>) {
  const fullName = actor
    ? `${String(actor.first_name ?? "")} ${String(actor.last_name ?? "")}`.trim()
    : "";
  return {
    id: r.id,
    timestamp: r.occurred_at,
    userId: r.actor_user_id,
    username: actor?.email ?? null,
    fullName: fullName || null,
    role: null,
    module: "ADMIN",
    action: r.action,
    ipAddress: r.source_ip,
    riskLevel: "INFO",
    status: "SUCCESS",
    source: "ADMIN_AUDIT",
  };
}

function boundedInteger(rawValue: string | null, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function auditPage(content: Record<string, unknown>[], total: number, page: number, size: number) {
  const totalPages = size > 0 ? Math.ceil(total / size) : 0;
  return {
    content,
    pageable: {
      pageNumber: page,
      pageSize: size,
      sort: { sorted: true, unsorted: false, empty: false },
      offset: page * size,
      paged: true,
      unpaged: false,
    },
    totalElements: total,
    last: page >= totalPages - 1,
    totalPages,
    size,
    number: page,
    sort: { sorted: true, unsorted: false, empty: false },
    first: page === 0,
    numberOfElements: content.length,
    empty: content.length === 0,
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

/**
 * Global audit view for Super Admin only. It intentionally excludes free-form
 * metadata (`old_values`, `new_values`, security evidence, and admin `details`) so credentials or
 * protected evidence cannot be returned by this endpoint even if bad historic
 * data exists. Authorization is applied by the route guard before this
 * service-role query runs.
 */
async function handleAuditLogs(_ctx: AuthContext | null, req: Request, _body: unknown, _p: RouteParams) {
  const qp = new URL(req.url).searchParams;
  const page = boundedInteger(qp.get("page"), 0, 0, 10_000);
  const size = boundedInteger(qp.get("size"), 20, 1, 100);
  const offset = page * size;
  const fetchLimit = offset + size;
  const userId = qp.get("userId")?.trim() || null;
  const action = qp.get("action")?.trim().toUpperCase() || null;
  const module = qp.get("module")?.trim().toUpperCase() || null;
  const severity = qp.get("riskLevel")?.trim().toUpperCase() || null;
  const startDate = qp.get("startDate")?.trim() || null;
  const endDate = qp.get("endDate")?.trim() || null;

  const safeToken = /^[A-Z][A-Z0-9_]{0,99}$/;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (userId && !uuid.test(userId)) return raw({ error: "Invalid audit user filter" }, 400);
  if ((action && !safeToken.test(action)) || (module && !safeToken.test(module))
    || (severity && !safeToken.test(severity))) {
    return raw({ error: "Invalid audit filter" }, 400);
  }
  if ((startDate && Number.isNaN(Date.parse(startDate))) || (endDate && Number.isNaN(Date.parse(endDate)))) {
    return raw({ error: "Invalid audit date range" }, 400);
  }

  let applicationQuery = db
    .from("audit_logs")
    .select(
      "id,user_id,user_email,user_full_name,action,module,ip_address,severity,status,created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(fetchLimit);
  if (userId) applicationQuery = applicationQuery.eq("user_id", userId);
  if (action) applicationQuery = applicationQuery.eq("action", action);
  if (module) applicationQuery = applicationQuery.eq("module", module);
  if (severity) applicationQuery = applicationQuery.eq("severity", severity);
  if (startDate) applicationQuery = applicationQuery.gte("created_at", startDate);
  if (endDate) applicationQuery = applicationQuery.lte("created_at", endDate);

  let securityQuery = db
    .from("security_logs")
    .select(
      "id,timestamp,created_at,user_id,full_name,role,action,module,ip_address,risk_level,status",
      { count: "exact" },
    )
    .order("timestamp", { ascending: false })
    .limit(fetchLimit);
  if (userId) securityQuery = securityQuery.eq("user_id", userId);
  if (action) securityQuery = securityQuery.eq("action", action);
  if (module) securityQuery = securityQuery.eq("module", module);
  if (severity) securityQuery = securityQuery.eq("risk_level", severity);
  if (startDate) securityQuery = securityQuery.gte("timestamp", startDate);
  if (endDate) securityQuery = securityQuery.lte("timestamp", endDate);

  const includeAdmin = (!module || module === "ADMIN") && (!severity || severity === "INFO");
  let adminQuery = db
    .from("admin_audit_logs")
    .select("id,actor_user_id,action,source_ip,occurred_at", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .limit(fetchLimit);
  if (userId) adminQuery = adminQuery.eq("actor_user_id", userId);
  if (action) adminQuery = adminQuery.eq("action", action);
  if (startDate) adminQuery = adminQuery.gte("occurred_at", startDate);
  if (endDate) adminQuery = adminQuery.lte("occurred_at", endDate);

  const [applicationResult, securityResult, adminResult] = await Promise.all([
    applicationQuery,
    securityQuery,
    includeAdmin ? adminQuery : Promise.resolve({ data: [], count: 0, error: null }),
  ]);
  if (applicationResult.error) throw new Error(`audit logs query failed: ${applicationResult.error.message}`);
  if (securityResult.error) throw new Error(`security audit logs query failed: ${securityResult.error.message}`);
  if (adminResult.error) throw new Error(`admin audit logs query failed: ${adminResult.error.message}`);

  const adminRows = (adminResult.data ?? []) as Record<string, unknown>[];
  const actorIds = [...new Set(adminRows.map((row) => row.actor_user_id).filter(Boolean) as string[])];
  const actors = new Map<string, Record<string, unknown>>();
  if (actorIds.length > 0) {
    const actorResult = await db.from("users").select("id,email,first_name,last_name").in("id", actorIds);
    if (actorResult.error) throw new Error(`audit actor lookup failed: ${actorResult.error.message}`);
    for (const actor of actorResult.data ?? []) actors.set(String(actor.id), actor as Record<string, unknown>);
  }

  const combined = [
    ...((applicationResult.data ?? []) as Record<string, unknown>[]).map(auditLogDto),
    ...((securityResult.data ?? []) as Record<string, unknown>[]).map(globalSecurityLogDto),
    ...adminRows.map((row) => adminAuditLogDto(row, actors.get(String(row.actor_user_id ?? "")))),
  ].sort((left, right) => Date.parse(String(right.timestamp ?? "")) - Date.parse(String(left.timestamp ?? "")));
  const content = combined.slice(offset, offset + size);
  const total = (applicationResult.count ?? 0) + (securityResult.count ?? 0) + (adminResult.count ?? 0);
  return raw(auditPage(content, total, page, size));
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
// IP Threat Map (geographic security telemetry)
// ---------------------------------------------------------------------------

const WINDOW_MS: Record<string, number> = {
  "15m": 15 * 60_000,
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
};

const SEVERITY_ORDER: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

const THREAT_TYPES = [
  "SQL_INJECTION", "XSS", "PORT_SCAN", "FAILED_LOGIN", "RATE_LIMIT", "ACCOUNT_LOCKED", "BLOCKED_IP",
];

function normalizeWindow(raw: string | null): string {
  return raw && raw in WINDOW_MS ? raw : "24h";
}

function normalizeThreatType(value: string): string {
  const v = value.toUpperCase();
  return THREAT_TYPES.includes(v) ? v : "FAILED_LOGIN";
}

function normalizeSeverity(value: string): string {
  const v = value.toUpperCase();
  return v in SEVERITY_ORDER ? v : "LOW";
}

async function loadThreatRows(fromIso: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await db.from("ip_threats").select("*")
    .gte("created_at", fromIso)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`ip_threats load failed: ${error.message}`);
  return data ?? [];
}

function aggregateThreats(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const ip = String(r.ip ?? "0.0.0.0");
    const list = grouped.get(ip) ?? [];
    list.push(r);
    grouped.set(ip, list);
  }
  const out: Record<string, unknown>[] = [];
  for (const [ip, rs] of grouped) {
    const types = new Map<string, number>();
    let maxSevIdx = -1;
    let maxSevStr = "LOW";
    let primaryThreat = "FAILED_LOGIN";
    let status = "DETECTED";
    let eventCount = 0;
    let firstSeen: string | null = null;
    let lastSeen: string | null = null;
    for (const r of rs) {
      const type = normalizeThreatType(String(r.threat_type ?? "FAILED_LOGIN"));
      const sevStr = normalizeSeverity(String(r.severity ?? "LOW"));
      const sevIdx = SEVERITY_ORDER[sevStr] ?? 0;
      if (sevIdx > maxSevIdx) {
        maxSevIdx = sevIdx;
        maxSevStr = sevStr;
        primaryThreat = type;
      }
      const count = Number(r.requests ?? 1);
      eventCount += count;
      types.set(type, (types.get(type) ?? 0) + count);
      const fs = r.first_seen ? String(r.first_seen) : String(r.created_at ?? "");
      const ls = r.last_seen ? String(r.last_seen) : String(r.created_at ?? "");
      if (fs && (!firstSeen || fs < firstSeen)) firstSeen = fs;
      if (ls && (!lastSeen || ls > lastSeen)) lastSeen = ls;
      if (String(r.status ?? "").toUpperCase() === "BLOCKED") status = "BLOCKED";
    }
    out.push({
      ip,
      country: rs[0].country ? String(rs[0].country) : null,
      countryCode: rs[0].flag ? String(rs[0].flag) : null,
      region: null,
      city: rs[0].city ? String(rs[0].city) : null,
      latitude: typeof rs[0].latitude === "number" ? rs[0].latitude : null,
      longitude: typeof rs[0].longitude === "number" ? rs[0].longitude : null,
      timezone: null,
      isp: rs[0].isp ? String(rs[0].isp) : null,
      asn: rs[0].asn ? String(rs[0].asn) : null,
      accuracyRadiusKm: null,
      confidence: null,
      ipVersion: ip.includes(":") ? 6 : 4,
      privateIp: isPrivateOrLocal(ip),
      threatTypes: [...types.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      primaryThreat,
      severity: maxSevStr,
      eventCount,
      status,
      firstSeen,
      lastSeen,
      source: "IP_THREATS",
    });
  }
  return out;
}

async function loadTrustedSessions(): Promise<Record<string, unknown>[]> {
  const { data, error } = await db.from("active_sessions").select("*").eq("status", "ACTIVE");
  if (error) throw new Error(`active_sessions load failed: ${error.message}`);
  return (data ?? []).map((r) => {
    const ip = String((r as Record<string, unknown>).ip_address ?? "127.0.0.1");
    return {
      sessionId: String((r as Record<string, unknown>).session_id ?? (r as Record<string, unknown>).id ?? ""),
      username: String((r as Record<string, unknown>).username ?? (r as Record<string, unknown>).full_name ?? ""),
      role: String((r as Record<string, unknown>).role ?? "EMPLOYEE"),
      ip,
      country: (r as Record<string, unknown>).country ? String((r as Record<string, unknown>).country) : null,
      countryCode: null,
      region: null,
      city: null,
      latitude: null,
      longitude: null,
      timezone: null,
      isp: null,
      asn: null,
      accuracyRadiusKm: null,
      confidence: null,
      ipVersion: ip.includes(":") ? 6 : 4,
      privateIp: isPrivateOrLocal(ip),
      loginTime: (r as Record<string, unknown>).login_time ? String((r as Record<string, unknown>).login_time) : null,
      lastActivity: (r as Record<string, unknown>).last_activity ? String((r as Record<string, unknown>).last_activity) : null,
    };
  });
}

async function buildThreatStats(rows: Record<string, unknown>[], fromIso: string): Promise<Record<string, unknown>> {
  const totalIps = new Set(rows.map((r) => String(r.ip ?? "")));
  const last24Iso = new Date(Date.now() - WINDOW_MS["24h"]).toISOString();
  const last24Ips = new Set(
    rows
      .filter((r) => (r.last_seen ? String(r.last_seen) : String(r.created_at ?? "")) >= last24Iso)
      .map((r) => String(r.ip ?? "")),
  );
  const countries = new Set(rows.map((r) => (r.country ? String(r.country) : "")).filter(Boolean));

  const [blocked, sessions, failed] = await Promise.all([
    db.from("blocked_ips").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
    db.from("active_sessions").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
    db.from("login_history").select("id", { count: "exact", head: true }).eq("status", "FAILED").gte("timestamp", fromIso),
  ]);

  return {
    totalThreatIps: totalIps.size,
    detectedLast24h: last24Ips.size,
    countriesAffected: countries.size,
    blockedIps: blocked.count ?? 0,
    activeSessions: sessions.count ?? 0,
    failedLoginAttempts: failed.count ?? 0,
  };
}

async function loadRecentLogs(limit: number): Promise<Record<string, unknown>[]> {
  const { data, error } = await db.from("security_logs").select("*")
    .order("timestamp", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`security logs load failed: ${error.message}`);
  return (data ?? []).map((r) => {
    const ip = String((r as Record<string, unknown>).ip_address ?? "0.0.0.0");
    return {
      timestamp: String((r as Record<string, unknown>).timestamp ?? (r as Record<string, unknown>).created_at ?? ""),
      action: String((r as Record<string, unknown>).action ?? "AUDIT"),
      ip,
      username: (r as Record<string, unknown>).username ? String((r as Record<string, unknown>).username)
        : (r as Record<string, unknown>).full_name ? String((r as Record<string, unknown>).full_name) : null,
      severity: normalizeSeverity(String((r as Record<string, unknown>).risk_level ?? "LOW")),
      module: String((r as Record<string, unknown>).module ?? "SECURITY"),
      status: String((r as Record<string, unknown>).status ?? "SUCCESS"),
      reason: String((r as Record<string, unknown>).reason ?? "Security log entry"),
      country: null,
      countryCode: null,
      city: null,
      privateIp: isPrivateOrLocal(ip),
      latitude: null,
      longitude: null,
      accuracyRadiusKm: null,
      confidence: null,
      isp: null,
      asn: null,
    };
  });
}

async function handleVectorMap(_ctx: AuthContext | null, req: Request, _body: unknown, _p: RouteParams) {
  const qp = new URL(req.url).searchParams;
  const window = normalizeWindow(qp.get("window"));
  const fromIso = new Date(Date.now() - WINDOW_MS[window]).toISOString();
  const rows = await loadThreatRows(fromIso);
  const [threats, trustedSessions, stats, recentLogs] = await Promise.all([
    Promise.resolve(aggregateThreats(rows)),
    loadTrustedSessions(),
    buildThreatStats(rows, fromIso),
    loadRecentLogs(50),
  ]);
  return raw({
    window,
    generatedAt: new Date().toISOString(),
    threats,
    trustedSessions,
    stats,
    recentLogs,
  });
}

async function handleThreatStats(_ctx: AuthContext | null, req: Request, _body: unknown, _p: RouteParams) {
  const qp = new URL(req.url).searchParams;
  const window = normalizeWindow(qp.get("window"));
  const fromIso = new Date(Date.now() - WINDOW_MS[window]).toISOString();
  const rows = await loadThreatRows(fromIso);
  return raw(await buildThreatStats(rows, fromIso));
}

async function handleThreatDiagnostics(_ctx: AuthContext | null, req: Request, _body: unknown, _p: RouteParams) {
  const resolved = resolveClientIp(req);
  const chain = [
    `x-forwarded-for: ${req.headers.get("x-forwarded-for") ?? "absent"}`,
    `x-real-ip: ${req.headers.get("x-real-ip") ?? "absent"}`,
    `x-forwarded-remote-addr: ${req.headers.get("x-forwarded-remote-addr") ?? "absent"}`,
    `x-supabase-fwd-for: ${req.headers.get("x-supabase-fwd-for") ?? "absent"}`,
  ].join(" | ");
  return raw({
    clientIp: resolved.ip,
    ipVersion: resolved.ipVersion,
    privateIp: resolved.isPrivate,
    geoProvider: "offline-approximation",
    geoResolved: false,
    geolocation: null,
    broadcastWindow: "24h",
    trustedHeaderChain: chain,
  });
}

// ---------------------------------------------------------------------------

const routes = [
  { method: "GET", path: "/security/admin/metrics", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["SECURITY_MONITOR"] }, handler: handleMetrics },
  { method: "GET", path: "/security/admin/logs", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["SECURITY_MONITOR"] }, handler: handleLogs },
  { method: "GET", path: "/security/admin/audit-logs", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleAuditLogs },
  { method: "GET", path: "/security/admin/sessions", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["SECURITY_MONITOR"] }, handler: handleSessions },
  { method: "POST", path: "/security/admin/sessions/:id/revoke", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleRevokeSession },
  { method: "GET", path: "/security/admin/blocked-ips", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["SECURITY_MONITOR"] }, handler: handleBlockedIps },
  { method: "POST", path: "/security/admin/blocked-ips", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleBlockIp },
  { method: "DELETE", path: "/security/admin/blocked-ips/:ipAddress", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleUnblockIp },
  { method: "GET", path: "/security/admin/alerts", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["SECURITY_MONITOR"] }, handler: handleAlerts },
  { method: "POST", path: "/security/admin/alerts/:id/resolve", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleResolveAlert },
  { method: "GET", path: "/security/ip-threats/vector-map", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["SECURITY_MONITOR"] }, handler: handleVectorMap },
  { method: "GET", path: "/security/ip-threats/stats", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["SECURITY_MONITOR"] }, handler: handleThreatStats },
  { method: "GET", path: "/security/ip-threats/diagnostics", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["SECURITY_MONITOR"] }, handler: handleThreatDiagnostics },
] as const;

Deno.serve(createHandler(routes as never, { name: "security" }));
