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

const SECURITY_THREAT_ACTIONS = [
  "LOGIN_FAILED", "FAILED_LOGIN", "AUTH_FAILURE",
  "LOGIN_BLOCKED", "ACCOUNT_LOCKOUT", "ACCOUNT_LOCKED",
  "RATE_LIMIT_EXCEEDED", "RATE_LIMIT",
  "SQL_INJECTION", "SQLI", "XSS", "PORT_SCAN", "BLOCKED_IP",
];

const GEO_LOOKUP_LIMIT = 12;
const GEO_LOOKUP_TIMEOUT_MS = 3_000;

type ThreatGeo = {
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
  isp: string | null;
  asn: string | null;
  accuracyRadiusKm: number | null;
  confidence: number | null;
};

// Synthetic public IPs with plausible geolocation used by the admin Test
// Security Event action. The map needs public addresses the geolocation layer
// can place, so demo sources are drawn from this pool.
const DEMO_THREAT_SOURCES = [
  { ip: "45.155.205.233", country: "Russian Federation", countryCode: "RU", city: "Moscow", latitude: 55.7558, longitude: 37.6173, isp: "Sia Nano IT", asn: "AS197068" },
  { ip: "185.220.101.34", country: "Germany", countryCode: "DE", city: "Frankfurt", latitude: 50.1109, longitude: 8.6821, isp: "EVANZO", asn: "AS50472" },
  { ip: "103.99.10.20", country: "Vietnam", countryCode: "VN", city: "Ho Chi Minh City", latitude: 10.8231, longitude: 106.6297, isp: "Phuc Long Telecom", asn: "AS45195" },
  { ip: "197.210.0.89", country: "Nigeria", countryCode: "NG", city: "Lagos", latitude: 6.5244, longitude: 3.3792, isp: "MTN Nigeria", asn: "AS37240" },
  { ip: "111.90.150.90", country: "Malaysia", countryCode: "MY", city: "Kuala Lumpur", latitude: 3.139, longitude: 101.6869, isp: "GlobalConnect", asn: "AS45011" },
  { ip: "218.92.0.15", country: "China", countryCode: "CN", city: "Shanghai", latitude: 31.2304, longitude: 121.4737, isp: "China Telecom", asn: "AS4134" },
  { ip: "186.250.64.10", country: "Brazil", countryCode: "BR", city: "Sao Paulo", latitude: -23.5505, longitude: -46.6333, isp: "WHSR", asn: "AS53013" },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

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

function securityLogThreatType(actionValue: unknown): string | null {
  const action = String(actionValue ?? "").trim().toUpperCase();
  if (["LOGIN_FAILED", "FAILED_LOGIN", "AUTH_FAILURE"].includes(action)) return "FAILED_LOGIN";
  if (["LOGIN_BLOCKED", "ACCOUNT_LOCKOUT", "ACCOUNT_LOCKED"].includes(action)) return "ACCOUNT_LOCKED";
  if (["RATE_LIMIT_EXCEEDED", "RATE_LIMIT"].includes(action)) return "RATE_LIMIT";
  if (["SQL_INJECTION", "SQLI"].includes(action)) return "SQL_INJECTION";
  if (action === "XSS") return "XSS";
  if (action === "PORT_SCAN") return "PORT_SCAN";
  if (action === "BLOCKED_IP") return "BLOCKED_IP";
  return null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseStoredGeo(value: unknown): Partial<ThreatGeo> | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const latitude = optionalNumber(parsed.latitude ?? parsed.lat);
    const longitude = optionalNumber(parsed.longitude ?? parsed.lon);
    if (latitude === null || longitude === null) return null;
    return {
      country: optionalString(parsed.country),
      countryCode: optionalString(parsed.countryCode),
      region: optionalString(parsed.region),
      city: optionalString(parsed.city),
      latitude,
      longitude,
      timezone: optionalString(parsed.timezone),
      isp: optionalString(parsed.isp),
      asn: optionalString(parsed.asn),
      accuracyRadiusKm: optionalNumber(parsed.accuracyRadiusKm),
      confidence: optionalNumber(parsed.confidence),
    };
  } catch {
    return null;
  }
}

function securityLogToThreatRow(row: Record<string, unknown>): Record<string, unknown> | null {
  const threatType = securityLogThreatType(row.action);
  const ip = optionalString(row.ip_address);
  if (!threatType || !ip) return null;
  const timestamp = String(row.timestamp ?? row.created_at ?? new Date().toISOString());
  const geo = parseStoredGeo(row.geo_location);
  const blocked = threatType === "ACCOUNT_LOCKED" || threatType === "BLOCKED_IP";
  return {
    source: "SECURITY_LOGS",
    source_log_id: row.id,
    ip,
    country: geo?.country ?? null,
    flag: geo?.countryCode ?? null,
    region: geo?.region ?? null,
    city: geo?.city ?? null,
    latitude: geo?.latitude ?? null,
    longitude: geo?.longitude ?? null,
    timezone: geo?.timezone ?? null,
    isp: geo?.isp ?? null,
    asn: geo?.asn ?? null,
    accuracy_radius_km: geo?.accuracyRadiusKm ?? null,
    confidence: geo?.confidence ?? null,
    threat_type: threatType,
    severity: normalizeSeverity(String(row.risk_level ?? "LOW")),
    requests: 1,
    status: blocked ? "BLOCKED" : "DETECTED",
    created_at: timestamp,
    first_seen: timestamp,
    last_seen: timestamp,
  };
}

function blockedIpToThreatRow(row: Record<string, unknown>, fromIso: string): Record<string, unknown> | null {
  const ip = optionalString(row.ip_address);
  const timestamp = String(row.blocked_at ?? row.created_at ?? "");
  if (!ip || !timestamp || timestamp < fromIso) return null;
  return {
    source: "BLOCKED_IPS",
    ip,
    country: null,
    flag: null,
    region: null,
    city: null,
    latitude: null,
    longitude: null,
    timezone: null,
    isp: null,
    asn: null,
    accuracy_radius_km: null,
    confidence: null,
    threat_type: "BLOCKED_IP",
    severity: "CRITICAL",
    requests: Number(row.attempts_count ?? 1),
    status: "BLOCKED",
    created_at: timestamp,
    first_seen: timestamp,
    last_seen: timestamp,
  };
}

async function lookupIpGeolocation(ip: string): Promise<ThreatGeo | null> {
  if (isPrivateOrLocal(ip)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEO_LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json() as Record<string, unknown>;
    if (payload.success !== true) return null;
    const latitude = optionalNumber(payload.latitude);
    const longitude = optionalNumber(payload.longitude);
    if (latitude === null || longitude === null) return null;
    const timezone = payload.timezone && typeof payload.timezone === "object"
      ? optionalString((payload.timezone as Record<string, unknown>).id)
      : null;
    const connection = payload.connection && typeof payload.connection === "object"
      ? payload.connection as Record<string, unknown>
      : {};
    return {
      country: optionalString(payload.country),
      countryCode: optionalString(payload.country_code),
      region: optionalString(payload.region),
      city: optionalString(payload.city),
      latitude,
      longitude,
      timezone,
      isp: optionalString(connection.isp),
      asn: connection.asn === null || connection.asn === undefined ? null : String(connection.asn),
      accuracyRadiusKm: null,
      confidence: null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function applyGeo(row: Record<string, unknown>, geo: ThreatGeo): void {
  row.country = geo.country;
  row.flag = geo.countryCode;
  row.region = geo.region;
  row.city = geo.city;
  row.latitude = geo.latitude;
  row.longitude = geo.longitude;
  row.timezone = geo.timezone;
  row.isp = geo.isp;
  row.asn = geo.asn;
  row.accuracy_radius_km = geo.accuracyRadiusKm;
  row.confidence = geo.confidence;
}

async function cacheGeo(ip: string, geo: ThreatGeo, rows: Record<string, unknown>[]): Promise<void> {
  const storedGeo: Record<string, unknown> = {
    country: geo.country,
    countryCode: geo.countryCode,
    region: geo.region,
    city: geo.city,
    latitude: geo.latitude,
    longitude: geo.longitude,
    timezone: geo.timezone,
    isp: geo.isp,
    asn: geo.asn,
  };
  let compactGeo = JSON.stringify(storedGeo);
  for (const key of ["isp", "asn", "region", "timezone", "city", "country"] as const) {
    if (compactGeo.length <= 240) break;
    delete storedGeo[key];
    compactGeo = JSON.stringify(storedGeo);
  }
  const securityLogIds = rows
    .filter((row) => row.source === "SECURITY_LOGS" && row.source_log_id)
    .map((row) => String(row.source_log_id));
  const writes: PromiseLike<unknown>[] = [
    db.from("ip_threats").update({
      country: geo.country,
      city: geo.city,
      latitude: geo.latitude,
      longitude: geo.longitude,
      isp: geo.isp,
      asn: geo.asn,
      flag: geo.countryCode,
    }).eq("ip", ip).is("latitude", null),
  ];
  if (securityLogIds.length) {
    writes.push(db.from("security_logs").update({ geo_location: compactGeo }).in("id", securityLogIds));
  }
  await Promise.allSettled(writes);
}

async function enrichThreatRows(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const rowsByIp = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const ip = String(row.ip ?? "");
    if (!ip) continue;
    const grouped = rowsByIp.get(ip) ?? [];
    grouped.push(row);
    rowsByIp.set(ip, grouped);
  }

  const unresolved: string[] = [];
  for (const [ip, ipRows] of rowsByIp) {
    const resolvedRow = ipRows.find((row) => optionalNumber(row.latitude) !== null && optionalNumber(row.longitude) !== null);
    if (resolvedRow) {
      const geo: ThreatGeo = {
        country: optionalString(resolvedRow.country),
        countryCode: optionalString(resolvedRow.flag),
        region: optionalString(resolvedRow.region),
        city: optionalString(resolvedRow.city),
        latitude: Number(resolvedRow.latitude),
        longitude: Number(resolvedRow.longitude),
        timezone: optionalString(resolvedRow.timezone),
        isp: optionalString(resolvedRow.isp),
        asn: optionalString(resolvedRow.asn),
        accuracyRadiusKm: optionalNumber(resolvedRow.accuracy_radius_km),
        confidence: optionalNumber(resolvedRow.confidence),
      };
      ipRows.forEach((row) => applyGeo(row, geo));
    } else if (!isPrivateOrLocal(ip) && unresolved.length < GEO_LOOKUP_LIMIT) {
      unresolved.push(ip);
    }
  }

  await Promise.all(unresolved.map(async (ip) => {
    const geo = await lookupIpGeolocation(ip);
    if (!geo) return;
    const ipRows = rowsByIp.get(ip) ?? [];
    ipRows.forEach((row) => applyGeo(row, geo));
    await cacheGeo(ip, geo, ipRows);
  }));
  return rows;
}

async function loadThreatRows(fromIso: string): Promise<Record<string, unknown>[]> {
  const [storedThreats, securityLogs, blockedIps] = await Promise.all([
    db.from("ip_threats").select("*").gte("created_at", fromIso).order("created_at", { ascending: false }),
    db.from("security_logs")
      .select("id,timestamp,created_at,action,status,risk_level,ip_address,geo_location")
      .in("action", SECURITY_THREAT_ACTIONS)
      .gte("timestamp", fromIso)
      .order("timestamp", { ascending: false }),
    db.from("blocked_ips").select("*").eq("status", "ACTIVE"),
  ]);
  if (storedThreats.error) throw new Error(`ip_threats load failed: ${storedThreats.error.message}`);
  if (securityLogs.error) throw new Error(`security_logs threat load failed: ${securityLogs.error.message}`);
  if (blockedIps.error) throw new Error(`blocked_ips threat load failed: ${blockedIps.error.message}`);

  const securityThreatRows = (securityLogs.data ?? [])
    .map((row) => securityLogToThreatRow(row as Record<string, unknown>))
    .filter((row): row is Record<string, unknown> => row !== null);
  const blockedThreatRows = (blockedIps.data ?? [])
    .map((row) => blockedIpToThreatRow(row as Record<string, unknown>, fromIso))
    .filter((row): row is Record<string, unknown> => row !== null);
  const rows: Record<string, unknown>[] = [
    ...(storedThreats.data ?? []).map((row) => ({ ...row, source: "IP_THREATS" })),
    ...securityThreatRows,
    ...blockedThreatRows,
  ];
  return enrichThreatRows(rows);
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
    const sources = new Set<string>();
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
      sources.add(String(r.source ?? "IP_THREATS"));
    }
    const geoRow = rs.find((r) => optionalNumber(r.latitude) !== null && optionalNumber(r.longitude) !== null) ?? rs[0];
    out.push({
      ip,
      country: optionalString(geoRow.country),
      countryCode: optionalString(geoRow.flag),
      region: optionalString(geoRow.region),
      city: optionalString(geoRow.city),
      latitude: optionalNumber(geoRow.latitude),
      longitude: optionalNumber(geoRow.longitude),
      timezone: optionalString(geoRow.timezone),
      isp: optionalString(geoRow.isp),
      asn: optionalString(geoRow.asn),
      accuracyRadiusKm: optionalNumber(geoRow.accuracy_radius_km),
      confidence: optionalNumber(geoRow.confidence),
      ipVersion: ip.includes(":") ? 6 : 4,
      privateIp: isPrivateOrLocal(ip),
      threatTypes: [...types.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      primaryThreat,
      severity: maxSevStr,
      eventCount,
      status,
      firstSeen,
      lastSeen,
      source: [...sources].join(","),
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
    const geo = parseStoredGeo((r as Record<string, unknown>).geo_location);
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
      country: geo?.country ?? null,
      countryCode: geo?.countryCode ?? null,
      city: geo?.city ?? null,
      privateIp: isPrivateOrLocal(ip),
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      accuracyRadiusKm: geo?.accuracyRadiusKm ?? null,
      confidence: geo?.confidence ?? null,
      isp: geo?.isp ?? null,
      asn: geo?.asn ?? null,
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
  const geolocation = await lookupIpGeolocation(resolved.ip);
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
    geoProvider: "ipwho.is-https",
    geoResolved: geolocation !== null,
    geolocation,
    broadcastWindow: "24h",
    trustedHeaderChain: chain,
  });
}

async function handleTestThreatEvent(ctx: AuthContext | null, _req: Request, _body: unknown, _p: RouteParams) {
  const actor = ctx?.email ?? "admin@photonic-omega.com";
  const source = pickRandom(DEMO_THREAT_SOURCES);
  const threatType = normalizeThreatType(pickRandom(THREAT_TYPES));
  const severity = pickRandom(["MEDIUM", "HIGH", "CRITICAL"]);
  const status = Math.random() < 0.5 ? "BLOCKED" : "DETECTED";
  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();

  const { error: threatError } = await db.from("ip_threats").insert({
    id,
    created_at: nowIso,
    ip: source.ip,
    country: source.country,
    city: source.city,
    latitude: source.latitude,
    longitude: source.longitude,
    threat_type: threatType,
    severity,
    requests: 1,
    status,
    first_seen: nowIso,
    last_seen: nowIso,
    asn: source.asn,
    isp: source.isp,
    flag: source.countryCode,
  });
  if (threatError) throw new Error(`test threat insert failed: ${threatError.message}`);

  const { error: logError } = await db.from("security_logs").insert({
    timestamp: nowIso,
    created_at: nowIso,
    action: "THREAT_TEST",
    module: "THREAT_MAP",
    username: actor,
    full_name: actor,
    role: "SUPER_ADMIN",
    ip_address: source.ip,
    risk_level: severity,
    status: status === "BLOCKED" ? "BLOCKED" : "DETECTED",
    reason: `Test security event: ${threatType} from ${source.ip} (${source.city}, ${source.country})`,
    geo_location: `${source.city}, ${source.country}`,
  });
  if (logError) throw new Error(`test log insert failed: ${logError.message}`);

  return raw({
    eventId: id,
    ip: source.ip,
    privateIp: false,
    geolocation: {
      country: source.country,
      countryCode: source.countryCode,
      city: source.city,
      latitude: source.latitude,
      longitude: source.longitude,
      isp: source.isp,
      asn: source.asn,
    },
  });
}

// ---------------------------------------------------------------------------

const routes = [
  { method: "GET", path: "/security/admin/metrics", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["SECURITY_MONITOR"] }, handler: handleMetrics },
  { method: "GET", path: "/security/admin/logs", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN"], permissions: ["SECURITY_MONITOR"] }, handler: handleLogs },
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
  { method: "POST", path: "/security/ip-threats/test-event", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleTestThreatEvent },
] as const;

Deno.serve(createHandler(routes as never, { name: "security" }));
