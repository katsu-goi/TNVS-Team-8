import { createHandler, AuthContext } from "../_shared/guard.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { fail, ok } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";

const db = adminDb();
const TIMEZONE = "Asia/Manila";
const MANILA_OFFSET = "+08:00";
const MAX_RANGE_MS = 366 * 86_400_000;

const ANALYTICS_ROLES = [
  "SYSTEM_ADMIN", "SUPER_ADMIN", "FACILITIES_MANAGER", "FACILITIES_OFFICER",
  "COMPLIANCE_MANAGER", "COMPLIANCE_OFFICER", "RECORDS_OFFICER",
  "LEGAL_COUNSEL", "LEGAL_OFFICER", "CONTRACT_OFFICER", "EMPLOYEE",
];

type AnalyticsWindow = { from: Date; to: Date; preset: string };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function manilaDate(now = new Date()): string {
  const local = new Date(now.getTime() + 8 * 3_600_000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

function dateOnlyStart(value: string): Date {
  return new Date(`${value}T00:00:00${MANILA_OFFSET}`);
}

function addLocalDays(value: string, days: number): Date {
  return new Date(dateOnlyStart(value).getTime() + days * 86_400_000);
}

function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function parseBoundary(value: string | null, endExclusive: boolean): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return endExclusive ? addLocalDays(value, 1) : dateOnlyStart(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function analyticsWindow(req: Request): AnalyticsWindow | Response {
  const url = new URL(req.url);
  const preset = (url.searchParams.get("preset") ?? "last_30_days").toLowerCase();
  const today = manilaDate();
  let from: Date;
  let to: Date;
  const explicitFrom = parseBoundary(url.searchParams.get("from"), false);
  const explicitTo = parseBoundary(url.searchParams.get("to"), true);
  if (explicitFrom || explicitTo) {
    if (!explicitFrom || !explicitTo) return jsonResponse(fail("Both from and to are required for a custom range.", "INVALID_DATE_RANGE"), 400);
    from = explicitFrom;
    to = explicitTo;
  } else if (preset === "today") {
    from = dateOnlyStart(today);
    to = addLocalDays(today, 1);
  } else if (preset === "last_7_days") {
    from = addLocalDays(today, -6);
    to = addLocalDays(today, 1);
  } else if (preset === "this_month") {
    from = dateOnlyStart(firstOfMonth(today));
    const shifted = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1));
    to = dateOnlyStart(`${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-01`);
  } else if (preset === "previous_month") {
    to = dateOnlyStart(firstOfMonth(today));
    const shifted = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1));
    from = dateOnlyStart(`${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-01`);
  } else {
    from = addLocalDays(today, -29);
    to = addLocalDays(today, 1);
  }
  if (from >= to || to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return jsonResponse(fail("Date range must be positive and no longer than 366 days.", "INVALID_DATE_RANGE"), 400);
  }
  return { from, to, preset };
}

function selectedRole(ctx: AuthContext): string | null {
  const assigned = new Set(ctx.user.assignedRoles.map((role) => role.toUpperCase()));
  const granted = new Set(ctx.roles.map((role) => role.toUpperCase()));
  return ANALYTICS_ROLES.find((role) => assigned.has(role) || granted.has(role)) ?? null;
}

async function runtimeCheck(name: string, action: () => Promise<{ empty?: boolean; detail: string }>) {
  const started = performance.now();
  try {
    const result = await action();
    return { name, status: result.empty ? "EMPTY" : "LIVE", latencyMs: Math.round((performance.now() - started) * 10) / 10, detail: result.detail };
  } catch {
    return { name, status: "DISCONNECTED", latencyMs: Math.round((performance.now() - started) * 10) / 10, detail: `${name} check failed` };
  }
}

async function operationalHealth() {
  const checks = await Promise.all([
    runtimeCheck("Edge Function API", async () => ({ detail: "Authenticated analytics handler responding" })),
    runtimeCheck("Database", async () => {
      const { count, error } = await db.from("users").select("id", { count: "exact", head: true });
      if (error) throw error;
      return { empty: (count ?? 0) === 0, detail: `${count ?? 0} user records reachable` };
    }),
    runtimeCheck("Storage", async () => {
      const { data, error } = await db.storage.listBuckets();
      if (error) throw error;
      return { empty: (data ?? []).length === 0, detail: `${data?.length ?? 0} storage buckets reachable` };
    }),
    runtimeCheck("Realtime marker stream", async () => {
      const { data, error } = await db.from("realtime_events").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return { empty: !data, detail: data ? `Latest marker ${String(data.created_at)}` : "No markers recorded" };
    }),
    runtimeCheck("Lifecycle automation", async () => {
      const { data, error } = await db.from("lifecycle_automation_runs").select("status, started_at").order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) return { empty: true, detail: "No automation run recorded" };
      if (data.status === "FAILED") throw new Error("latest automation run failed");
      return { detail: `Latest run ${data.status} at ${data.started_at}` };
    }),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    overallStatus: checks.some((check) => check.status === "DISCONNECTED") ? "DISCONNECTED" : checks.some((check) => check.status === "EMPTY") ? "EMPTY" : "LIVE",
    checks,
  };
}

async function handleAnalytics(ctx: AuthContext | null, req: Request) {
  const window = analyticsWindow(req);
  if (window instanceof Response) return window;
  const role = selectedRole(ctx!);
  if (!role) return jsonResponse(fail("This role has no analytics scope.", "ACCESS_DENIED"), 403);
  const { data, error } = await db.rpc("phase6_analytics_snapshot", {
    p_role: role,
    p_user_id: ctx!.userId,
    p_user_email: ctx!.email,
    p_from: window.from.toISOString(),
    p_to: window.to.toISOString(),
    p_timezone: TIMEZONE,
  });
  if (error) throw new Error(`analytics aggregation failed: ${error.message}`);
  const response = data as Record<string, unknown>;
  if (role === "SYSTEM_ADMIN" || role === "SUPER_ADMIN") {
    const [blockedIps, securityAlerts, unreadNotifications] = await Promise.all([
      db.from("blocked_ips").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
      db.from("security_alerts").select("id", { count: "exact", head: true }).eq("status", "UNRESOLVED"),
      db.from("employee_notifications").select("id", { count: "exact", head: true })
        .eq("recipient_id", ctx!.userId).eq("is_read", false).eq("is_deleted", false),
    ]);
    for (const result of [blockedIps, securityAlerts, unreadNotifications]) {
      if (result.error) throw new Error(`operational aggregate failed: ${result.error.message}`);
    }
    response.operational = {
      ...((response.operational as Record<string, unknown>) ?? {}),
      blockedIps: blockedIps.count ?? 0,
      activeSecurityAlerts: securityAlerts.count ?? 0,
      unreadNotifications: unreadNotifications.count ?? 0,
    };
    response.systemHealth = await operationalHealth();
  }
  response.filter = { preset: window.preset, semantics: "from-inclusive/to-exclusive" };
  return jsonResponse(ok(response, "Role-scoped analytics retrieved"), 200);
}

function safeCsvCell(value: unknown): string {
  let cell = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replaceAll('"', '""')}"`;
}

function csvFromRows(rows: Array<Record<string, unknown>>, metadata: Record<string, string>): string {
  const dataColumns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const columns = [...Object.keys(metadata), ...dataColumns];
  const lines = [columns.map(safeCsvCell).join(",")];
  for (const row of rows) {
    const merged: Record<string, unknown> = { ...metadata, ...row };
    lines.push(columns.map((column) => safeCsvCell(merged[column])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

async function exportRows(ctx: AuthContext, role: string, from: Date, to: Date, status: string | null) {
  let query: any;
  let reportType: string;
  if (role === "SYSTEM_ADMIN" || role === "SUPER_ADMIN") {
    reportType = "SYSTEM_OPERATIONAL_EVENTS";
    query = db.from("security_logs").select("timestamp,module,action,status,risk_level").gte("timestamp", from.toISOString()).lt("timestamp", to.toISOString()).order("timestamp").limit(5001);
  } else if (role === "FACILITIES_MANAGER" || role === "FACILITIES_OFFICER") {
    reportType = "FACILITIES_RESERVATIONS";
    query = db.from("reservations").select("id,title,status,start_time,end_time,room_id,created_at").eq("is_deleted", false).gte("created_at", from.toISOString()).lt("created_at", to.toISOString()).order("created_at").limit(5001);
  } else if (role === "COMPLIANCE_MANAGER" || role === "COMPLIANCE_OFFICER" || role === "RECORDS_OFFICER") {
    reportType = "COMPLIANCE_DOCUMENTS";
    query = db.from("documents").select("id,title,status,classification_level,retention_status,retention_expires_at,created_at").eq("is_deleted", false).gte("created_at", from.toISOString()).lt("created_at", to.toISOString()).order("created_at").limit(5001);
  } else if (role === "LEGAL_COUNSEL" || role === "LEGAL_OFFICER" || role === "CONTRACT_OFFICER") {
    reportType = "CONTRACT_LIFECYCLE";
    query = db.from("contracts").select("id,contract_number,title,type,counter_party,status,ai_assessed_risk_level,start_date,end_date,renewal_notice_date,created_at").eq("is_deleted", false).gte("created_at", from.toISOString()).lt("created_at", to.toISOString()).order("created_at").limit(5001);
  } else {
    reportType = "EMPLOYEE_RESERVATIONS";
    query = db.from("reservations").select("id,title,status,start_time,end_time,room_id,created_at").eq("is_deleted", false).eq("user_id", ctx.userId).gte("created_at", from.toISOString()).lt("created_at", to.toISOString()).order("created_at").limit(5001);
  }
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(`analytics export failed: ${error.message}`);
  const rows = (data as Array<Record<string, unknown>>) ?? [];
  if (rows.length > 5000) return { error: jsonResponse(fail("Export exceeds 5,000 rows; narrow the date range or filters.", "EXPORT_TOO_LARGE"), 413) };
  return { rows, reportType };
}

async function handleCsvExport(ctx: AuthContext | null, req: Request) {
  const window = analyticsWindow(req);
  if (window instanceof Response) return window;
  const role = selectedRole(ctx!);
  if (!role) return jsonResponse(fail("This role cannot export analytics.", "ACCESS_DENIED"), 403);
  const status = new URL(req.url).searchParams.get("status")?.trim().toUpperCase() || null;
  if (status && !/^[A-Z][A-Z0-9_]{0,49}$/.test(status)) return jsonResponse(fail("Invalid status filter.", "INVALID_FILTER"), 400);
  const exported = await exportRows(ctx!, role, window.from, window.to, status);
  if ("error" in exported) return exported.error!;
  const generatedAt = new Date().toISOString();
  const filters = { preset: window.preset, ...(status ? { status } : {}) };
  const { error: auditError } = await db.from("analytics_export_audit").insert({
    generated_by: ctx!.userId,
    generated_by_email: ctx!.email,
    generated_by_role: role,
    report_type: exported.reportType,
    range_from: window.from.toISOString(),
    range_to: window.to.toISOString(),
    filters,
    row_count: exported.rows!.length,
  });
  if (auditError) throw new Error(`export audit failed: ${auditError.message}`);
  const csv = csvFromRows(exported.rows!, {
    report_type: exported.reportType!, generated_at: generatedAt, generated_by: ctx!.email,
    role, timezone: TIMEZONE, range_from: window.from.toISOString(), range_to_exclusive: window.to.toISOString(),
    filters: JSON.stringify(filters),
  });
  const headers = corsHeaders();
  headers.set("Content-Type", "text/csv; charset=utf-8");
  headers.set("Content-Disposition", `attachment; filename="${exported.reportType!.toLowerCase()}-${generatedAt.slice(0, 10)}.csv"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(csv, { status: 200, headers });
}

const routes = [
  { method: "GET", path: "/analytics", guard: { kind: "auth" }, handler: handleAnalytics },
  { method: "GET", path: "/analytics/export.csv", guard: { kind: "auth" }, handler: handleCsvExport },
  { method: "GET", path: "/admin/analytics", guard: { kind: "roles", roles: ["SYSTEM_ADMIN", "SUPER_ADMIN"] }, handler: handleAnalytics },
] as const;

Deno.serve(createHandler(routes as never, { name: "analytics" }));
