import { createHandler } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import { buildHealthSnapshot } from "../_shared/subsystem-health.ts";

const db = adminDb();

// ---------------------------------------------------------------------------
// Time helpers (all UTC, mirroring the Spring AnalyticsService)
// ---------------------------------------------------------------------------

function toMs(s: unknown): number {
  if (s == null) return 0;
  const str = String(s).replace(" ", "T");
  if (str.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(str)) return new Date(str).getTime();
  return new Date(str + "Z").getTime();
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function truncHour(ms: number): number {
  const d = new Date(ms);
  d.setUTCMinutes(0, 0, 0);
  return d.getTime();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function hoursBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / 3_600_000);
}

function buildLabels(fromMs: number, toMs: number): string[] {
  const hourly = hoursBetween(fromMs, toMs) <= 48;
  const labels: string[] = [];
  if (hourly) {
    let cursor = truncHour(fromMs);
    while (cursor <= toMs) {
      const d = new Date(cursor);
      labels.push(`${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`);
      cursor += 3_600_000;
    }
  } else {
    let cursor = startOfDay(fromMs);
    while (cursor <= startOfDay(toMs)) {
      const d = new Date(cursor);
      labels.push(`${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
      cursor += 86_400_000;
    }
  }
  return labels;
}

function bucket(items: unknown[], fromMs: number, endMs: number, labels: string[]): number[] {
  const hourly = hoursBetween(fromMs, endMs) <= 48;
  const counts = new Array<number>(labels.length).fill(0);
  const bucketStart = hourly ? truncHour(fromMs) : startOfDay(fromMs);
  for (const item of items) {
    const ims = toMs(item);
    if (ims < bucketStart) continue;
    const idx = hourly
      ? Math.floor((ims - bucketStart) / 3_600_000)
      : Math.floor((startOfDay(ims) - bucketStart) / 86_400_000);
    if (idx >= 0 && idx < counts.length) counts[idx]++;
  }
  return counts;
}

function periodLabel(from: Date, to: Date): string {
  // Mirrors Spring's Duration.between(...).toHours() (truncated toward zero).
  const hours = Math.floor((to.getTime() - from.getTime()) / 3_600_000);
  if (hours <= 24) return "Last 24 Hours";
  if (hours <= 48) return "Last 48 Hours";
  if (hours <= 24 * 7) return "Last 7 Days";
  if (hours <= 24 * 30) return "Last 30 Days";
  if (hours <= 24 * 90) return "Last 90 Days";
  const fmt = (d: Date) => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };
  return `${fmt(from)} - ${fmt(to)}`;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

async function count(table: string, fn?: (q: any) => any): Promise<number> {
  let q = db.from(table).select("id", { count: "exact", head: true });
  if (fn) q = fn(q);
  const { count: n, error } = await q;
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return n ?? 0;
}

async function rows(table: string, cols: string, fn?: (q: any) => any): Promise<Array<Record<string, unknown>>> {
  let q = db.from(table).select(cols);
  if (fn) q = fn(q);
  const { data, error } = await q;
  if (error) throw new Error(`${table} query failed: ${error.message}`);
  return (data as unknown as Array<Record<string, unknown>>) ?? [];
}

function betweenTs(q: any, col: string, from: Date, to: Date) {
  return q.gte(col, from.toISOString()).lte(col, to.toISOString());
}

function betweenNaive(q: any, col: string, from: Date, to: Date) {
  const fmt = (d: Date) => `${d.toISOString().slice(0, 23)}`;
  return q.gte(col, fmt(from)).lte(col, fmt(to));
}

// ---------------------------------------------------------------------------
// Analytics builders
// ---------------------------------------------------------------------------

function kpi(key: string, label: string, current: number, description: string, previous: number | null, status: string) {
  const hasComparison = previous != null && previous > 0 && current > 0;
  let delta: number | null = null;
  let trend: string | null = null;
  if (hasComparison && previous != null) {
    delta = Math.round(((current - previous) * 1000) / previous) / 10;
    trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  }
  return {
    key, label, value: String(current), description,
    previous: hasComparison ? previous : null,
    deltaPct: delta, trend, status, hasComparison,
  };
}

function series(key: string, name: string, color: string, values: number[]) {
  return { key, name, color, values };
}

function labelValue(label: string, value: number) {
  return { label, value };
}

async function buildKpis(from: Date, to: Date, health: Awaited<ReturnType<typeof buildHealthSnapshot>>) {
  const prevMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime());
  const prevFrom = new Date(prevTo.getTime() - prevMs);

  const security = await count("security_logs", (q) => betweenTs(q, "timestamp", from, to));
  const securityPrev = await count("security_logs", (q) => betweenTs(q, "timestamp", prevFrom, prevTo));
  const audit = await count("audit_logs", (q) => betweenNaive(q, "created_at", from, to));
  const auditPrev = await count("audit_logs", (q) => betweenNaive(q, "created_at", prevFrom, prevTo));
  const failed = await count("login_history", (q) => betweenTs(q, "timestamp", from, to).eq("status", "FAILED"));
  const failedPrev = await count("login_history", (q) => betweenTs(q, "timestamp", prevFrom, prevTo).eq("status", "FAILED"));
  const errors = await count("security_logs", (q) => betweenTs(q, "timestamp", from, to).eq("status", "FAILED"));
  const errorsPrev = await count("security_logs", (q) => betweenTs(q, "timestamp", prevFrom, prevTo).eq("status", "FAILED"));
  const activeSessions = await count("active_sessions", (q) => q.eq("status", "ACTIVE"));

  const components = health.subsystems.length;
  const healthy = health.healthyCount;
  const availability = components === 0 ? 0 : Math.round((healthy * 100) / components);

  return [
    kpi("securityEvents", "Security Events", security, "Events in period", securityPrev, security > 0 ? "warning" : "neutral"),
    kpi("auditActivity", "Audit Activity", audit, "Audit trail entries", auditPrev, "neutral"),
    kpi("failedLogins", "Failed Logins", failed, "Login attempts rejected", failedPrev, failed > 0 ? "bad" : "good"),
    kpi("systemErrors", "System Errors", errors, "Failed security/API events", errorsPrev, errors > 0 ? "bad" : "good"),
    kpi("activeSessions", "Active Sessions", activeSessions, "Users online now", null, activeSessions > 0 ? "good" : "neutral"),
    {
      key: "availability",
      label: "System Availability",
      value: availability + "%",
      description: healthy + " of " + components + " subsystems healthy",
      previous: null, deltaPct: null, trend: null,
      status: availability >= 80 ? "good" : availability >= 50 ? "warning" : "bad",
      hasComparison: false,
    },
  ];
}

async function buildActivity(from: Date, to: Date, labels: string[]) {
  const security = await rows("security_logs", "timestamp", (q) => betweenTs(q, "timestamp", from, to));
  const logins = await rows("login_history", "timestamp", (q) => betweenTs(q, "timestamp", from, to));
  const audit = await rows("audit_logs", "created_at", (q) => betweenNaive(q, "created_at", from, to));
  const visitors = await rows("visitors", "created_at", (q) => betweenTs(q, "created_at", from, to));
  const documents = await rows("documents", "created_at", (q) => betweenTs(q, "created_at", from, to));
  const contracts = await rows("contracts", "created_at", (q) => betweenTs(q, "created_at", from, to));
  const reservations = await rows("reservations", "start_time", (q) => betweenTs(q, "start_time", from, to));

  const b = (items: unknown[]) => bucket(items, from.getTime(), to.getTime(), labels);
  return {
    labels,
    series: [
      series("securityEvents", "Security Events", "#ef4444", b(security.map((r) => r.timestamp))),
      series("logins", "Login Attempts", "#f59e0b", b(logins.map((r) => r.timestamp))),
      series("audit", "Audit Events", "#3b82f6", b(audit.map((r) => r.created_at))),
      series("reservations", "Reservations", "#10b981", b(reservations.map((r) => r.start_time))),
      series("visitors", "Visitors", "#8b5cf6", b(visitors.map((r) => r.created_at))),
      series("documents", "Documents", "#06b6d4", b(documents.map((r) => r.created_at))),
      series("contracts", "Contracts", "#64748b", b(contracts.map((r) => r.created_at))),
    ],
  };
}

async function buildSecurity(from: Date, to: Date, labels: string[]) {
  const total = await count("security_logs", (q) => betweenTs(q, "timestamp", from, to));
  const byRisk = (risk: string) => count("security_logs", (q) => betweenTs(q, "timestamp", from, to).eq("risk_level", risk));
  const critical = await byRisk("CRITICAL");
  const high = await byRisk("HIGH");
  const medium = await byRisk("MEDIUM");
  const low = await byRisk("LOW");
  const failedLogins = await count("login_history", (q) => betweenTs(q, "timestamp", from, to).eq("status", "FAILED"));
  const blockedIps = await count("blocked_ips", (q) => q.eq("status", "ACTIVE"));

  const securitySeries = await rows("security_logs", "timestamp", (q) => betweenTs(q, "timestamp", from, to));
  const values = bucket(securitySeries.map((r) => r.timestamp), from.getTime(), to.getTime(), labels);
  return {
    total, critical, high, medium, low, failedLogins, blockedIps,
    byRiskLevel: [
      labelValue("Critical", critical),
      labelValue("High", high),
      labelValue("Medium", medium),
      labelValue("Low", low),
    ],
    overTime: labels.map((l, i) => labelValue(l, values[i] ?? 0)),
  };
}

async function buildAi() {
  const providers = await rows("ai_providers", "id, name, default_model, status, is_default, provider_type, is_deleted");
  const active = providers.filter((p) => p.is_deleted !== true);
  return {
    totalRequests: 0,
    successful: 0,
    failed: 0,
    successRate: null,
    avgResponseTimeMs: null,
    source: "IN_MEMORY",
    providers: active.map((p) => ({
      id: String(p.id ?? ""),
      name: String(p.name ?? ""),
      model: String(p.default_model ?? ""),
      status: String(p.status ?? ""),
      responseTime: null,
      isDefault: p.is_default === true,
      type: String(p.provider_type ?? ""),
    })),
    requestsByProvider: [],
  };
}

async function buildHealth() {
  const snapshot = await buildHealthSnapshot();
  return {
    overallStatus: snapshot.overallStatus,
    healthyCount: snapshot.healthyCount,
    warningCount: snapshot.warningCount,
    offlineCount: snapshot.offlineCount,
    errorCount: snapshot.errorCount,
    components: snapshot.subsystems.map((s) => ({
      id: s.id, name: s.name, status: s.status,
      uptimePercent: s.uptimePercent, errorCount: s.errorCount,
    })),
  };
}

async function buildAudit(from: Date, to: Date) {
  const logs = await rows("audit_logs", "module, action", (q) => betweenNaive(q, "created_at", from, to));
  const byModule = new Map<string, number>();
  const byAction = new Map<string, number>();
  for (const a of logs) {
    const mod = a.module != null && String(a.module).trim() !== "" ? String(a.module) : null;
    const act = a.action != null && String(a.action).trim() !== "" ? String(a.action) : null;
    if (mod) byModule.set(mod, (byModule.get(mod) ?? 0) + 1);
    if (act) byAction.set(act, (byAction.get(act) ?? 0) + 1);
  }
  const toList = (m: Map<string, number>) =>
    [...m.entries()].map(([label, value]) => labelValue(label, value)).sort((a, b) => b.value - a.value);
  const byModuleList = toList(byModule);
  const byActionList = toList(byAction);
  return {
    total: logs.length,
    byModule: byModuleList,
    byAction: byActionList,
    mostActiveModule: byModuleList.length > 0 ? byModuleList[0].label : null,
    mostCommonAction: byActionList.length > 0 ? byActionList[0].label : null,
  };
}

async function buildDocuments(from: Date, to: Date) {
  const total = await count("documents");
  const uploaded = await count("documents", (q) => betweenTs(q, "created_at", from, to));
  const archived = await count("documents", (q) => q.eq("status", "ARCHIVED"));
  const aiClassified = await count("documents", (q) => q.not("ai_predicted_category", "is", null));
  return { total, uploaded, archived, aiClassified };
}

async function buildContracts() {
  const horizon = new Date(Date.now() + 30 * 86_400_000);
  const horizonStr = `${horizon.getUTCFullYear()}-${pad(horizon.getUTCMonth() + 1)}-${pad(horizon.getUTCDate())}`;
  const total = await count("contracts");
  const active = await count("contracts", (q) => q.eq("status", "ACTIVE"));
  const expiringSoon = await count("contracts", (q) => q.eq("status", "ACTIVE").lte("end_date", horizonStr));
  const expired = await count("contracts", (q) => q.eq("status", "EXPIRED"));
  const renewed = await count("contracts", (q) => q.eq("status", "RENEWED"));
  return { total, active, expiringSoon, expired, renewed };
}

async function buildBackups(from: Date, to: Date) {
  const inRange = await rows("backup_records", "status, started_at, completed_at", (q) => betweenTs(q, "started_at", from, to));
  const total = inRange.length;
  const success = inRange.filter((b) => String(b.status ?? "").toUpperCase() === "COMPLETED").length;
  const failed = inRange.filter((b) => String(b.status ?? "").toUpperCase() === "FAILED").length;
  const successRate = total === 0 ? null : Math.round((success * 1000) / total) / 10;

  const all = await rows("backup_records", "status, started_at, completed_at", (q) => q.order("started_at", { ascending: false }));
  const lastSuccessful = all.find((b) => String(b.status ?? "").toUpperCase() === "COMPLETED");
  const lastBackup = all.length > 0 ? all[0] : null;
  return {
    total, successCount: success, failedCount: failed, successRate,
    lastSuccessfulAt: lastSuccessful
      ? (lastSuccessful.completed_at != null ? String(lastSuccessful.completed_at) : String(lastSuccessful.started_at))
      : null,
    lastBackupAt: lastBackup ? String(lastBackup.started_at) : null,
  };
}

async function buildInsights(from: Date, to: Date) {
  const insights: Array<{ severity: string; title: string; description: string }> = [];
  const security = await count("security_logs", (q) => betweenTs(q, "timestamp", from, to));
  const errors = await count("security_logs", (q) => betweenTs(q, "timestamp", from, to).eq("status", "FAILED"));
  const failedLogins = await count("login_history", (q) => betweenTs(q, "timestamp", from, to).eq("status", "FAILED"));

  if (security > 0) {
    insights.push({
      severity: errors > 0 ? "warning" : "info",
      title: `Security events: ${security}`,
      description: `${security} security events recorded in this period, ${errors} failed (${security > 0 ? Math.round((errors * 100) / security) : 0}%).`,
    });
  }
  if (failedLogins > 0) {
    insights.push({
      severity: "critical",
      title: `Failed logins: ${failedLogins}`,
      description: `${failedLogins} login attempts were rejected. Review IP reputation in Security Center.`,
    });
  }

  const horizon = new Date(Date.now() + 30 * 86_400_000);
  const horizonStr = `${horizon.getUTCFullYear()}-${pad(horizon.getUTCMonth() + 1)}-${pad(horizon.getUTCDate())}`;
  const expiring = await count("contracts", (q) => q.eq("status", "ACTIVE").lte("end_date", horizonStr));
  if (expiring > 0) {
    insights.push({
      severity: "warning",
      title: `Contracts expiring: ${expiring}`,
      description: `${expiring} active contracts approach their end date within 30 days.`,
    });
  }

  const inRange = await rows("backup_records", "status", (q) => betweenTs(q, "started_at", from, to));
  const failedBackups = inRange.filter((b) => String(b.status ?? "").toUpperCase() === "FAILED").length;
  if (failedBackups > 0) {
    insights.push({
      severity: "critical",
      title: `Backup failures: ${failedBackups}`,
      description: `${failedBackups} backup run(s) failed in this period.`,
    });
  } else if (inRange.length > 0) {
    insights.push({
      severity: "good",
      title: "Backups healthy",
      description: `No backup failures in this period (${inRange.length} run(s)).`,
    });
  }

  const activeSessions = await count("active_sessions", (q) => q.eq("status", "ACTIVE"));
  if (activeSessions > 0) {
    insights.push({
      severity: "info",
      title: `Active sessions: ${activeSessions}`,
      description: `${activeSessions} users are currently online.`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      severity: "info",
      title: "No activity in this period",
      description: "No security, audit, backup, or AI activity was recorded for the selected range.",
    });
  }
  return insights;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function handleAnalytics(_ctx: unknown, req: Request) {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const end = toParam ? new Date(toParam) : new Date();
  let start = fromParam ? new Date(fromParam) : new Date(end.getTime() - 30 * 86_400_000);
  if (start.getTime() > end.getTime()) start = new Date(end.getTime() - 30 * 86_400_000);
  const label = periodLabel(start, end);

  const health = await buildHealthSnapshot();
  const response = {
    period: { from: start.toISOString(), to: end.toISOString(), label },
    kpis: await buildKpis(start, end, health),
    activity: await buildActivity(start, end, buildLabels(start.getTime(), end.getTime())),
    security: await buildSecurity(start, end, buildLabels(start.getTime(), end.getTime())),
    ai: await buildAi(),
    health: {
      overallStatus: health.overallStatus,
      healthyCount: health.healthyCount,
      warningCount: health.warningCount,
      offlineCount: health.offlineCount,
      errorCount: health.errorCount,
      components: health.subsystems.map((s) => ({
        id: s.id, name: s.name, status: s.status,
        uptimePercent: s.uptimePercent, errorCount: s.errorCount,
      })),
    },
    audit: await buildAudit(start, end),
    documents: await buildDocuments(start, end),
    contracts: await buildContracts(),
    backups: await buildBackups(start, end),
    insights: await buildInsights(start, end),
  };
  return jsonResponse(ok(response), 200);
}

const routes = [
  { method: "GET", path: "/admin/analytics", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleAnalytics },
] as const;

Deno.serve(createHandler(routes as never, { name: "analytics" }));