import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import { naiveIso } from "../_shared/auth-users.ts";
import { writeAudit } from "../_shared/lockout.ts";
import { resolveClientIp } from "../_shared/ip.ts";

const db = adminDb();

const MODULE = "PROCUREMENT";
const EXPIRY_WINDOW_DAYS = 30;
const RENEWAL_WINDOW_DAYS = 30;
const OBLIGATION_DUE_SOON_DAYS = 14;
const SLA_MIN = 90;
const PERF_MIN = 60;

const CONTRACT_ROLES = ["CONTRACT_OFFICER"];

const CONTRACT_TYPES = ["LEASE", "VENDOR_SERVICE", "MAINTENANCE_SLA", "PROCUREMENT", "EMPLOYMENT", "NON_DISCLOSURE", "PARTNERSHIP"];
const CONTRACT_STATUSES = ["DRAFT", "UNDER_REVIEW", "APPROVED", "ACTIVE", "EXPIRED", "TERMINATED", "RENEWED"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const VENDOR_CATEGORIES = ["IT_SERVICES", "FACILITIES", "PROFESSIONAL_SERVICES", "SUPPLIES", "LOGISTICS", "MAINTENANCE", "OTHER"];
const VENDOR_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_APPROVAL"];
const OBLIGATION_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE"];
const NOTICE_STATUSES = ["OPEN", "ACKNOWLEDGED", "DISMISSED"];
const DOCUMENT_STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "ARCHIVED", "DELETED"];

const CONTRACT_KEYWORDS = [
  "contract", "procurement", "vendor", "supplier", "sla",
  "lease", "purchase", "agreement", "obligation", "dpa",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Interprets a naive LocalDateTime as UTC (matches Spring's naive persistence). */
function toUtcIso(s: string): string {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s).toISOString();
  const naive = s.includes("T") ? s : `${s}T00:00:00`;
  return naive + "Z";
}

/** PostgREST returns DATE columns as "YYYY-MM-DD"; Spring LocalDate serializes identically. */
function dateStr(v: string | null): string | null {
  if (!v) return null;
  return v.slice(0, 10);
}

/** NaN-aware numeric coercion for numeric/bigint columns (Spring emits numbers). */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Unix ms from a DB timestamp, treating naive timestamps as UTC. */
function dbMs(v: string | null): number | null {
  if (!v) return null;
  return new Date(toUtcIso(v)).getTime();
}

/** contracts/documents/legal_cases.created_at are timestamptz; Spring emits naive UTC LocalDateTime. */
function createdAtUtc(v: unknown): string | null {
  if (!v) return null;
  return toUtcIso(String(v)).replace("Z", "");
}

function isUuid(s: string | undefined): s is string {
  return s != null && UUID_RE.test(s);
}

function resourceNotFound(resource: string, id: string) {
  return jsonResponse(fail(`${resource} not found with id: '${id}'`, "RESOURCE_NOT_FOUND"), 404);
}

function businessRule(message: string) {
  return jsonResponse(fail(message, "BUSINESS_RULE_VIOLATION"), 422);
}

function generic500() {
  return jsonResponse(
    fail("An unexpected error occurred. Please contact system administrator.", "INTERNAL_SERVER_ERROR"),
    500,
  );
}

function str(o: unknown): string | null {
  return o === null || o === undefined ? null : String(o);
}

function intVal(o: unknown): number | null {
  if (o === null || o === undefined) return null;
  const s = String(o).trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Invalid integer value: ${o}`);
  return Math.trunc(n);
}

function decimalVal(o: unknown): string | null {
  if (o === null || o === undefined) return null;
  const s = String(o).trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric value: ${o}`);
  return s;
}

function parseUuid(o: unknown): string | null {
  if (o === null || o === undefined) return null;
  const s = String(o).trim();
  if (s === "") return null;
  if (!UUID_RE.test(s)) throw new Error(`Invalid vendor id: ${o}`);
  return s;
}

function parseDate(o: unknown): string | null {
  if (o === null || o === undefined) return null;
  const s = String(o).trim();
  if (s === "") return null;
  const candidate = s.length > 10 ? s.slice(0, 10) : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) throw new Error(`Invalid date: ${o}`);
  const d = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${o}`);
  return candidate;
}

function parseEnum(o: unknown, allowed: string[], label: string, fallback?: string): string {
  if (o === null || o === undefined) return fallback as string;
  const up = String(o).toUpperCase();
  if (!allowed.includes(up)) throw new Error(`Invalid ${label}: ${o}`);
  return up;
}

const parseType = (o: unknown) => parseEnum(o, CONTRACT_TYPES, "contract type", "VENDOR_SERVICE");
const parseRisk = (o: unknown) => parseEnum(o, RISK_LEVELS, "risk level");
const parseCategory = (o: unknown) => parseEnum(o, VENDOR_CATEGORIES, "vendor category", "OTHER");
const parseVendorStatus = (o: unknown, fallback: string) => parseEnum(o, VENDOR_STATUSES, "vendor status", fallback);
const parseObligationStatus = (o: unknown, fallback: string) => parseEnum(o, OBLIGATION_STATUSES, "obligation status", fallback);

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// DTO mappers (lazy-safe: only scalar fields; mirror ProcurementOfficerController)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> & { id: string };

function toContractDto(c: Row, vendorNames?: Map<string, string>) {
  return {
    id: c.id,
    contractNumber: c.contract_number ?? null,
    title: c.title ?? null,
    type: c.type ?? null,
    counterParty: c.counter_party ?? null,
    contractValue: num(c.contract_value),
    vendorId: c.vendor_id ?? null,
    vendorName: (c.vendor_id != null ? vendorNames?.get(String(c.vendor_id)) ?? null : null),
    startDate: dateStr(str(c.start_date)),
    endDate: dateStr(str(c.end_date)),
    renewalNoticeDate: dateStr(str(c.renewal_notice_date)),
    status: c.status ?? null,
    aiAssessedRiskLevel: c.ai_assessed_risk_level ?? null,
    aiRiskSummary: c.ai_risk_summary ?? null,
    createdAt: createdAtUtc(c.created_at),
  };
}

function toClauseDto(cl: Row) {
  return {
    id: cl.id,
    clauseType: cl.clause_type ?? null,
    content: cl.content ?? null,
    riskLevel: cl.risk_level ?? null,
    aiAnalysisNotes: cl.ai_analysis_notes ?? null,
  };
}

function toVendorDto(v: Row) {
  return {
    id: v.id,
    vendorCode: v.vendor_code ?? null,
    name: v.name ?? null,
    category: v.category ?? null,
    contactName: v.contact_name ?? null,
    contactEmail: v.contact_email ?? null,
    contactPhone: v.contact_phone ?? null,
    address: v.address ?? null,
    status: v.status ?? null,
    performanceScore: num(v.performance_score),
    slaComplianceRate: num(v.sla_compliance_rate),
    notes: v.notes ?? null,
    createdAt: v.created_at ?? null,
  };
}

function toObligationDto(o: Row) {
  return {
    id: o.id,
    vendorId: o.vendor_id ?? null,
    title: o.title ?? null,
    description: o.description ?? null,
    dueDate: dateStr(str(o.due_date)),
    status: o.status ?? null,
    notes: o.notes ?? null,
    createdAt: o.created_at ?? null,
  };
}

function toDocumentDto(d: Row) {
  return {
    id: d.id,
    title: d.title ?? null,
    fileName: d.file_name ?? null,
    fileType: d.file_type ?? null,
    fileSize: num(d.file_size),
    status: d.status ?? null,
    classificationLevel: d.classification_level ?? null,
    aiSummary: d.ai_summary ?? null,
    versionNumber: num(d.version_number),
    createdAt: createdAtUtc(d.created_at),
  };
}

/** ProcurementOfficerController.toCaseDto: read-only, no judge/lead/closed fields. */
function toCaseDto(c: Row) {
  return {
    id: c.id,
    caseNumber: c.case_number ?? null,
    title: c.title ?? null,
    description: c.description ?? null,
    courtName: c.court_name ?? null,
    opposingParty: c.opposing_party ?? null,
    caseType: c.case_type ?? null,
    status: c.status ?? null,
    priority: c.priority ?? null,
    filingDate: dateStr(str(c.filing_date)),
    expectedResolutionDate: dateStr(str(c.expected_resolution_date)),
    createdAt: createdAtUtc(c.created_at),
  };
}

function toNoticeDto(a: Row) {
  return {
    id: a.id,
    type: a.type ?? null,
    severity: a.severity ?? null,
    title: a.title ?? null,
    message: a.message ?? null,
    entityType: a.entity_type ?? null,
    entityId: a.entity_id ?? null,
    status: a.status ?? null,
    acknowledgedBy: a.acknowledged_by ?? null,
    acknowledgedAt: a.acknowledged_at ?? null,
    createdAt: a.created_at ?? null,
  };
}

function toAuditDto(a: Row) {
  return {
    id: a.id,
    action: a.action ?? null,
    entityType: a.entity_type ?? null,
    entityName: a.entity_name ?? null,
    module: a.module ?? null,
    userEmail: a.user_email ?? null,
    severity: a.severity ?? null,
    status: a.status ?? null,
    createdAt: a.created_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

async function loadContract(id: string): Promise<Row | null> {
  const { data, error } = await db.from("contracts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`contract lookup failed: ${error.message}`);
  return (data as unknown as Row) ?? null;
}

async function loadClause(id: string): Promise<Row | null> {
  const { data, error } = await db.from("contract_clauses").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`clause lookup failed: ${error.message}`);
  return (data as unknown as Row) ?? null;
}

async function loadVendor(id: string): Promise<Row | null> {
  const { data, error } = await db.from("vendors").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`vendor lookup failed: ${error.message}`);
  return (data as unknown as Row) ?? null;
}

async function loadObligation(id: string): Promise<Row | null> {
  const { data, error } = await db.from("vendor_obligations").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`obligation lookup failed: ${error.message}`);
  return (data as unknown as Row) ?? null;
}

async function loadNotice(id: string): Promise<Row | null> {
  const { data, error } = await db.from("procurement_notices").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`notice lookup failed: ${error.message}`);
  return (data as unknown as Row) ?? null;
}

async function loadDocument(id: string): Promise<Row | null> {
  const { data, error } = await db.from("documents").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`document lookup failed: ${error.message}`);
  return (data as unknown as Row) ?? null;
}

async function vendorNameMap(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data, error } = await db.from("vendors").select("id, name").in("id", unique);
  if (error) throw new Error(`vendor name lookup failed: ${error.message}`);
  for (const v of (data as unknown as Array<Record<string, unknown>>) ?? []) {
    map.set(String(v.id), String(v.name));
  }
  return map;
}

// ---------------------------------------------------------------------------
// Procurement notices (mirrors ProcurementService.generateNotices + upsertNotice)
// ---------------------------------------------------------------------------

async function upsertNotice(
  dedupKey: string, type: string, severity: string, title: string,
  message: string, entityType: string, entityId: string,
) {
  const existing = await db.from("procurement_notices").select("id").eq("dedup_key", dedupKey).maybeSingle();
  if (existing.error) throw new Error(`notice dedup check failed: ${existing.error.message}`);
  if (existing.data) return; // Preserve existing state (acknowledged/dismissed).

  const now = naiveIso();
  const { error } = await db.from("procurement_notices").insert({
    type,
    severity,
    title,
    message,
    entity_type: entityType,
    entity_id: entityId,
    status: "OPEN",
    dedup_key: dedupKey,
    created_at: now,
    updated_at: now,
    created_by: "SYSTEM",
    updated_by: "SYSTEM",
  });
  if (error) throw new Error(`notice insert failed: ${error.message}`);
}

async function generateNotices() {
  const today = todayStr();
  const expiryCutoff = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const renewalEnd = new Date(Date.now() + RENEWAL_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const dueSoonEnd = new Date(Date.now() + OBLIGATION_DUE_SOON_DAYS * 86400000).toISOString().slice(0, 10);

  const urRes = await db.from("contracts").select("*").eq("status", "UNDER_REVIEW");
  if (urRes.error) throw new Error(`pending review contracts query failed: ${urRes.error.message}`);
  for (const c of (urRes.data as unknown as Row[]) ?? []) {
    await upsertNotice(`CONTRACT_PENDING_REVIEW:${c.id}`, "CONTRACT_PENDING_REVIEW", "INFO",
      `Contract pending review: ${c.title}`,
      `${c.contract_number} with ${c.counter_party} awaits review.`,
      "Contract", String(c.id));
  }

  const expiringRes = await db.from("contracts").select("*").eq("status", "ACTIVE")
    .lte("end_date", expiryCutoff);
  if (expiringRes.error) throw new Error(`expiring contracts query failed: ${expiringRes.error.message}`);
  for (const c of (expiringRes.data as unknown as Row[]) ?? []) {
    await upsertNotice(`CONTRACT_EXPIRING:${c.id}`, "CONTRACT_EXPIRING", "WARNING",
      `Contract expiring soon: ${c.title}`,
      `${c.contract_number} with ${c.counter_party} ends ${c.end_date}.`,
      "Contract", String(c.id));
  }

  const expiredRes = await db.from("contracts").select("*").eq("status", "EXPIRED");
  if (expiredRes.error) throw new Error(`expired contracts query failed: ${expiredRes.error.message}`);
  for (const c of (expiredRes.data as unknown as Row[]) ?? []) {
    await upsertNotice(`CONTRACT_EXPIRED:${c.id}`, "CONTRACT_EXPIRED", "CRITICAL",
      `Contract expired: ${c.title}`,
      `${c.contract_number} with ${c.counter_party} expired on ${c.end_date}.`,
      "Contract", String(c.id));
  }

  const activeRes = await db.from("contracts").select("*").eq("status", "ACTIVE");
  if (activeRes.error) throw new Error(`active contracts query failed: ${activeRes.error.message}`);
  for (const c of (activeRes.data as unknown as Row[]) ?? []) {
    const renewal = dateStr(str(c.renewal_notice_date));
    if (renewal != null && renewal >= today && renewal <= renewalEnd) {
      await upsertNotice(`CONTRACT_RENEWAL_DUE:${c.id}`, "CONTRACT_RENEWAL_DUE", "WARNING",
        `Contract renewal decision due: ${c.title}`,
        `${c.contract_number} renewal notice date is ${renewal}.`,
        "Contract", String(c.id));
    }
  }

  const vendorsRes = await db.from("vendors").select("*");
  if (vendorsRes.error) throw new Error(`vendors query failed: ${vendorsRes.error.message}`);
  for (const v of (vendorsRes.data as unknown as Row[]) ?? []) {
    const sla = v.sla_compliance_rate;
    if (sla != null && Number(sla) < SLA_MIN) {
      await upsertNotice(`VENDOR_SLA_BREACH:${v.id}`, "VENDOR_SLA_BREACH", "CRITICAL",
        `Vendor SLA breach: ${v.name}`,
        `${v.vendor_code} SLA compliance is ${sla}% (min ${SLA_MIN}%).`,
        "Vendor", String(v.id));
    }
    const perf = v.performance_score;
    if (perf != null && Number(perf) < PERF_MIN) {
      await upsertNotice(`VENDOR_LOW_PERFORMANCE:${v.id}`, "VENDOR_LOW_PERFORMANCE", "WARNING",
        `Vendor low performance: ${v.name}`,
        `${v.vendor_code} performance score is ${perf} (min ${PERF_MIN}).`,
        "Vendor", String(v.id));
    }
  }

  const obligationsRes = await db.from("vendor_obligations").select("*");
  if (obligationsRes.error) throw new Error(`obligations query failed: ${obligationsRes.error.message}`);
  const obligations = (obligationsRes.data as unknown as Row[]) ?? [];
  const vnames = await vendorNameMap(obligations.map((o) => String(o.vendor_id ?? "")));
  for (const o of obligations) {
    if (o.status === "COMPLETED" || o.due_date == null) continue;
    const vendorName = o.vendor_id != null ? vnames.get(String(o.vendor_id)) ?? "a vendor" : "a vendor";
    const due = dateStr(str(o.due_date))!;
    if (due < today) {
      await upsertNotice(`OBLIGATION_OVERDUE:${o.id}`, "OBLIGATION_OVERDUE", "CRITICAL",
        `Obligation overdue: ${o.title}`,
        `'${o.title}' for ${vendorName} was due ${due}.`,
        "VendorObligation", String(o.id));
    } else if (due <= dueSoonEnd) {
      await upsertNotice(`OBLIGATION_DUE_SOON:${o.id}`, "OBLIGATION_DUE_SOON", "WARNING",
        `Obligation due soon: ${o.title}`,
        `'${o.title}' for ${vendorName} is due ${due}.`,
        "VendorObligation", String(o.id));
    }
  }
}

// ---------------------------------------------------------------------------
// Document access policy (mirrors DocumentAccessPolicy for CONTRACT_OFFICER)
// ---------------------------------------------------------------------------

function normalizeDept(value: string | null): string {
  return value == null ? "" : value.trim().toLowerCase();
}

function isContractRelated(d: Record<string, unknown>, categoryName: string | null): boolean {
  const parts = [str(d.title), str(d.ai_predicted_category), str(d.department), categoryName]
    .filter((v): v is string => v != null && v !== "");
  const text = parts.join(" ").toLowerCase();
  return CONTRACT_KEYWORDS.some((kw) => text.includes(kw));
}

function canViewDocument(
  userEmail: string, userRoles: string[], userDept: string | null,
  d: Record<string, unknown>,
  grants: Array<Record<string, unknown>>,
): boolean {
  const roles = userRoles.map((r) => r.toUpperCase());
  if (roles.includes("SUPER_ADMIN")) return true;

  const ownerEmail = str(d.owner_email);
  const createdBy = str(d.created_by);
  if ((ownerEmail != null && ownerEmail !== "" && ownerEmail.toLowerCase() === userEmail.toLowerCase()) ||
      (createdBy != null && createdBy.toLowerCase() === userEmail.toLowerCase())) {
    return true;
  }

  const roleSet = new Set(roles);
  for (const g of grants) {
    if (g.is_deleted === true) continue;
    const key = str(g.grantee_key) ?? "";
    if (g.grantee_type === "USER") {
      if (key.toLowerCase() === userEmail.toLowerCase()) return true;
    } else if (g.grantee_type === "ROLE") {
      if (roleSet.has(key.toUpperCase())) return true;
    }
  }

  if (roles.includes("COMPLIANCE_OFFICER") || roles.includes("LEGAL_OFFICER")) return true;

  const categoryName = Array.isArray(d.categories) && d.categories.length > 0
    ? str((d.categories as unknown as Array<Record<string, unknown>>)[0].name)
    : (d.categories != null && typeof d.categories === "object"
        ? str((d.categories as Record<string, unknown>).name)
        : null);

  if (roles.includes("CONTRACT_OFFICER")) {
    return isContractRelated(d, categoryName) || sameDepartment(userDept, str(d.department));
  }
  if (roles.includes("EMPLOYEE")) return false;
  return sameDepartment(userDept, str(d.department));
}

function sameDepartment(userDept: string | null, docDept: string | null): boolean {
  const ud = normalizeDept(userDept);
  const dd = normalizeDept(docDept);
  return ud !== "" && ud === dd;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function handleDashboard(ctx: AuthContext | null) {
  await generateNotices();

  const [contractsRes, vendorsRes, obligationsRes, auditRes, docsRes, noticesRes] = await Promise.all([
    db.from("contracts").select("*"),
    db.from("vendors").select("*"),
    db.from("vendor_obligations").select("*"),
    db.from("audit_logs").select("id").gte("created_at", naiveIso(new Date(Date.now() - 7 * 86400000))),
    db.from("documents").select("id").eq("status", "PENDING_REVIEW"),
    db.from("procurement_notices").select("id").eq("status", "OPEN"),
  ]);
  for (const r of [contractsRes, vendorsRes, obligationsRes, auditRes, docsRes, noticesRes]) {
    if (r.error) throw new Error(`dashboard query failed: ${r.error.message}`);
  }

  const contracts = (contractsRes.data as unknown as Row[]) ?? [];
  const vendors = (vendorsRes.data as unknown as Row[]) ?? [];
  const obligations = (obligationsRes.data as unknown as Row[]) ?? [];
  const vnames = await vendorNameMap(contracts.map((c) => String(c.vendor_id ?? "")));

  const today = todayStr();
  const cutoff = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const renewalEnd = new Date(Date.now() + RENEWAL_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  const countByStatus = (list: Array<Record<string, unknown>>, status: string) =>
    list.filter((x) => x.status === status).length;

  const expiring = contracts
    .filter((c) => c.status === "ACTIVE" && c.end_date != null && dateStr(str(c.end_date))! <= cutoff);

  const totalActiveContractValue = contracts
    .filter((c) => c.status === "ACTIVE" && c.contract_value != null)
    .reduce((sum, c) => sum + Number(c.contract_value), 0);

  const perfValues = vendors.map((v) => v.performance_score).filter((x): x is number => x != null && x !== "").map(Number);
  const slaValues = vendors.map((v) => v.sla_compliance_rate).filter((x): x is string | number => x != null && x !== "").map(Number);
  const avgVendorPerformance = perfValues.length === 0 ? 0 : perfValues.reduce((a, b) => a + b, 0) / perfValues.length;
  const avgSlaCompliance = slaValues.length === 0 ? 0 : slaValues.reduce((a, b) => a + b, 0) / slaValues.length;

  const openObligations = obligations.filter((o) => o.status !== "COMPLETED").length;
  const overdueObligations = obligations.filter(
    (o) => o.status !== "COMPLETED" && o.due_date != null && dateStr(str(o.due_date))! < today,
  ).length;

  const contractsByStatus: Record<string, number> = {};
  for (const c of contracts) {
    if (c.status != null) contractsByStatus[String(c.status)] = (contractsByStatus[String(c.status)] ?? 0) + 1;
  }
  const contractsByType: Record<string, number> = {};
  for (const c of contracts) {
    if (c.type != null) contractsByType[String(c.type)] = (contractsByType[String(c.type)] ?? 0) + 1;
  }
  const vendorsByStatus: Record<string, number> = {};
  for (const v of vendors) {
    if (v.status != null) vendorsByStatus[String(v.status)] = (vendorsByStatus[String(v.status)] ?? 0) + 1;
  }

  const expiringSoon = [...expiring]
    .sort((a, b) => (dbMs(dateStr(str(a.end_date))) ?? Number.MAX_SAFE_INTEGER) - (dbMs(dateStr(str(b.end_date))) ?? Number.MAX_SAFE_INTEGER))
    .map((c) => toContractDto(c, vnames));

  const pendingReviews = contracts
    .filter((c) => c.status === "UNDER_REVIEW")
    .map((c) => toContractDto(c, vnames));

  const recentlyUpdatedContracts = [...contracts]
    .sort((a, b) => {
      const ta = dbMs(str(a.created_at));
      const tb = dbMs(str(b.created_at));
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1;
      if (tb == null) return -1;
      return tb - ta;
    })
    .slice(0, 5)
    .map((c) => toContractDto(c, vnames));

  const vendorPerformance = vendors
    .filter((v) => v.performance_score != null || v.sla_compliance_rate != null)
    .sort((a, b) => {
      const pa = a.performance_score == null ? Number.MAX_SAFE_INTEGER : Number(a.performance_score);
      const pb = b.performance_score == null ? Number.MAX_SAFE_INTEGER : Number(b.performance_score);
      return pa - pb;
    })
    .map(toVendorDto);

  const renewalAlerts = contracts
    .filter((c) => {
      if (c.status !== "ACTIVE") return false;
      const r = dateStr(str(c.renewal_notice_date));
      return r != null && r >= today && r <= renewalEnd;
    })
    .sort((a, b) => (dbMs(dateStr(str(a.renewal_notice_date))) ?? Number.MAX_SAFE_INTEGER) - (dbMs(dateStr(str(b.renewal_notice_date))) ?? Number.MAX_SAFE_INTEGER))
    .map((c) => toContractDto(c, vnames));

  const summary = {
    activeContracts: countByStatus(contracts, "ACTIVE"),
    pendingContractReviews: countByStatus(contracts, "UNDER_REVIEW"),
    expiringContracts: expiring.length,
    totalContracts: contracts.length,
    totalActiveContractValue,
    totalVendors: vendors.length,
    activeVendors: countByStatus(vendors, "ACTIVE"),
    avgVendorPerformance: Math.round(avgVendorPerformance * 10) / 10,
    avgSlaCompliance: Math.round(avgSlaCompliance * 10) / 10,
    openObligations,
    overdueObligations,
    openNotices: (noticesRes.data ?? []).length,
    documentReviewQueue: (docsRes.data ?? []).length,
    recentAuditEvents: (auditRes.data ?? []).length,
    contractsByStatus,
    contractsByType,
    vendorsByStatus,
    expiringSoon,
    pendingReviews,
    recentlyUpdatedContracts,
    vendorPerformance,
    renewalAlerts,
  };

  return jsonResponse(ok(summary), 200);
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

async function handleListContracts(ctx: AuthContext | null, req: Request) {
  const url = new URL(req.url);
  const rawStatus = url.searchParams.get("status");
  if (rawStatus != null && !CONTRACT_STATUSES.includes(rawStatus)) return generic500();
  const rawVendorId = url.searchParams.get("vendorId");
  if (rawVendorId != null && !isUuid(rawVendorId)) return generic500();

  let data;
  let error;
  if (rawVendorId != null) {
    ({ data, error } = await db.from("contracts").select("*").eq("vendor_id", rawVendorId));
  } else if (rawStatus != null) {
    ({ data, error } = await db.from("contracts").select("*").eq("status", rawStatus));
  } else {
    ({ data, error } = await db.from("contracts").select("*"));
  }
  if (error) throw new Error(`contracts query failed: ${error.message}`);
  const rows = (data as unknown as Row[]) ?? [];
  const vnames = await vendorNameMap(rows.map((c) => String(c.vendor_id ?? "")));
  const result = rows.map((c) => toContractDto(c, vnames));
  return jsonResponse(ok(result, "Contracts retrieved"), 200);
}

async function handleGetContract(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const c = await loadContract(p.id);
  if (!c) return businessRule(`Contract not found: ${p.id}`);
  const clausesRes = await db.from("contract_clauses").select("*").eq("contract_id", p.id);
  if (clausesRes.error) throw new Error(`clauses query failed: ${clausesRes.error.message}`);
  const vnames = await vendorNameMap([String(c.vendor_id ?? "")]);
  const dto = toContractDto(c, vnames) as Record<string, unknown>;
  dto.clauses = ((clausesRes.data as unknown as Row[]) ?? []).map(toClauseDto);
  return jsonResponse(ok(dto, "Contract retrieved"), 200);
}

async function handleCreateContract(ctx: AuthContext | null, req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = str(b.title)?.trim();
  if (!title || title === "") {
    return businessRule("Contract title is required.");
  }
  let number = str(b.contractNumber)?.trim();
  if (!number || number === "") {
    number = "CTR-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  }
  const contractNumber = number;
  const dup = await db.from("contracts").select("id").eq("contract_number", contractNumber).maybeSingle();
  if (dup.error) throw new Error(`contract number check failed: ${dup.error.message}`);
  if (dup.data) {
    return businessRule(`A contract with number '${contractNumber}' already exists.`);
  }

  let type: string;
  let risk: string | null;
  let startDate: string | null;
  let endDate: string | null;
  let renewal: string | null;
  let value: string | null;
  let vendorId: string | null;
  try {
    type = parseType(b.type);
    risk = parseRisk(b.aiAssessedRiskLevel) ?? null;
    startDate = parseDate(b.startDate);
    endDate = parseDate(b.endDate);
    renewal = parseDate(b.renewalNoticeDate);
    value = decimalVal(b.contractValue);
    vendorId = parseUuid(b.vendorId);
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const now = naiveIso();
  const { data: saved, error } = await db.from("contracts").insert({
    contract_number: contractNumber,
    title,
    type,
    counter_party: str(b.counterParty),
    contract_value: value,
    vendor_id: vendorId,
    start_date: startDate,
    end_date: endDate,
    renewal_notice_date: renewal,
    status: "DRAFT",
    ai_assessed_risk_level: risk,
    ai_risk_summary: str(b.aiRiskSummary),
    updated_at: now,
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).select("*").single();
  if (error) throw new Error(`contract insert failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "CREATE_CONTRACT", MODULE, "Contract",
    (saved as unknown as { id: string }).id, `Created contract: ${title}`,
    ctx ? resolveClientIp(req).ip : null, "INFO");

  const vnames = await vendorNameMap([String((saved as unknown as Row).vendor_id ?? "")]);
  return jsonResponse(ok(toContractDto(saved as unknown as Row, vnames), "Contract created"), 200);
}

async function handleUpdateContract(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const c = await loadContract(p.id);
  if (!c) return resourceNotFound("Contract", p.id);
  const b = (body ?? {}) as Record<string, unknown>;

  const patch: Record<string, unknown> = { updated_at: naiveIso(), updated_by: ctx ? ctx.email : "SYSTEM" };
  try {
    if ("title" in b && str(b.title) != null) patch["title"] = str(b.title);
    if ("type" in b) patch["type"] = parseType(b.type);
    if ("counterParty" in b) patch["counter_party"] = str(b.counterParty);
    if ("contractValue" in b) patch["contract_value"] = decimalVal(b.contractValue);
    if ("vendorId" in b) patch["vendor_id"] = parseUuid(b.vendorId);
    if ("startDate" in b) patch["start_date"] = parseDate(b.startDate);
    if ("endDate" in b) patch["end_date"] = parseDate(b.endDate);
    if ("renewalNoticeDate" in b) patch["renewal_notice_date"] = parseDate(b.renewalNoticeDate);
    if ("aiAssessedRiskLevel" in b) patch["ai_assessed_risk_level"] = parseRisk(b.aiAssessedRiskLevel) ?? null;
    if ("aiRiskSummary" in b) patch["ai_risk_summary"] = str(b.aiRiskSummary);
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const { data: saved, error } = await db.from("contracts").update(patch)
    .eq("id", p.id).select("*").single();
  if (error) throw new Error(`contract update failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "UPDATE_CONTRACT", MODULE, "Contract", p.id,
    `Updated contract: ${saved.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  const vnames = await vendorNameMap([String((saved as unknown as Row).vendor_id ?? "")]);
  return jsonResponse(ok(toContractDto(saved as unknown as Row, vnames), "Contract updated"), 200);
}

async function transitionContract(
  ctx: AuthContext | null, req: Request, p: RouteParams,
  target: string, action: string, message: string, description: (title: string) => string,
) {
  if (!isUuid(p.id)) return generic500();
  const c = await loadContract(p.id);
  if (!c) return resourceNotFound("Contract", p.id);

  const { data: saved, error } = await db.from("contracts")
    .update({ status: target, updated_at: naiveIso(), updated_by: ctx ? ctx.email : "SYSTEM" })
    .eq("id", p.id).select("*").single();
  if (error) throw new Error(`contract transition failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, action, MODULE, "Contract", p.id,
    description(String(c.title)), ctx ? resolveClientIp(req).ip : null, "INFO");

  const vnames = await vendorNameMap([String((saved as unknown as Row).vendor_id ?? "")]);
  return jsonResponse(ok(toContractDto(saved as unknown as Row, vnames), message), 200);
}

async function handleSubmitReview(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  const c = await loadContract(p.id);
  if (!c) return resourceNotFound("Contract", p.id);
  if (c.status !== "DRAFT") {
    return businessRule("Only draft contracts can be submitted for review.");
  }
  return transitionContract(ctx, req, p, "UNDER_REVIEW", "SUBMIT_CONTRACT_REVIEW",
    "Contract submitted for review", (title) => `Submitted contract for review: ${title}`);
}

async function handleApproveContract(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  const c = await loadContract(p.id);
  if (!c) return resourceNotFound("Contract", p.id);
  if (c.status !== "UNDER_REVIEW") {
    return businessRule("Only contracts under review can be approved.");
  }
  return transitionContract(ctx, req, p, "APPROVED", "APPROVE_CONTRACT",
    "Contract approved", (title) => `Approved contract: ${title}`);
}

async function handleActivateContract(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  const c = await loadContract(p.id);
  if (!c) return resourceNotFound("Contract", p.id);
  if (c.status !== "APPROVED") {
    return businessRule("Only approved contracts can be activated.");
  }
  return transitionContract(ctx, req, p, "ACTIVE", "ACTIVATE_CONTRACT",
    "Contract activated", (title) => `Activated contract: ${title}`);
}

async function handleRenewContract(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const c = await loadContract(p.id);
  if (!c) return resourceNotFound("Contract", p.id);
  if (c.status !== "ACTIVE" && c.status !== "EXPIRED") {
    return businessRule("Only active or expired contracts can be renewed.");
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: naiveIso(), updated_by: ctx ? ctx.email : "SYSTEM" };
  try {
    const newEnd = parseDate(b.endDate);
    if (newEnd != null) patch["end_date"] = newEnd;
    const newRenewal = parseDate(b.renewalNoticeDate);
    if (newRenewal != null) patch["renewal_notice_date"] = newRenewal;
  } catch (e) {
    return businessRule((e as Error).message);
  }
  patch["status"] = "RENEWED";

  const { data: saved, error } = await db.from("contracts").update(patch)
    .eq("id", p.id).select("*").single();
  if (error) throw new Error(`contract renew failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "RENEW_CONTRACT", MODULE, "Contract", p.id,
    `Renewed contract: ${c.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  const vnames = await vendorNameMap([String((saved as unknown as Row).vendor_id ?? "")]);
  return jsonResponse(ok(toContractDto(saved as unknown as Row, vnames), "Contract renewed"), 200);
}

async function handleTerminateContract(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  const c = await loadContract(p.id);
  if (!c) return resourceNotFound("Contract", p.id);
  if (c.status === "TERMINATED") {
    return businessRule("Contract is already terminated.");
  }
  return transitionContract(ctx, req, p, "TERMINATED", "TERMINATE_CONTRACT",
    "Contract terminated", (title) => `Terminated contract: ${title}`);
}

// ---------------------------------------------------------------------------
// Clauses
// ---------------------------------------------------------------------------

async function handleAddClause(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const c = await loadContract(p.id);
  if (!c) return resourceNotFound("Contract", p.id);
  const b = (body ?? {}) as Record<string, unknown>;
  const clauseType = str(b.clauseType)?.trim();
  const content = str(b.content)?.trim();
  if (!clauseType || clauseType === "" || !content || content === "") {
    return businessRule("Clause type and content are required.");
  }

  let risk: string | null;
  try {
    risk = parseRisk(b.riskLevel) ?? null;
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const now = naiveIso();
  const { data: saved, error } = await db.from("contract_clauses").insert({
    id: crypto.randomUUID(),
    contract_id: p.id,
    clause_type: clauseType,
    content,
    risk_level: risk,
    ai_analysis_notes: str(b.aiAnalysisNotes),
    is_deleted: false,
    created_at: now,
    updated_at: now,
    created_by: ctx ? ctx.email : "SYSTEM",
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).select("*").single();
  if (error) throw new Error(`clause insert failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "ADD_CLAUSE", MODULE, "ContractClause",
    (saved as unknown as { id: string }).id, `Added clause '${clauseType}' to contract: ${c.title}`,
    ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toClauseDto(saved as unknown as Row), "Clause added"), 200);
}

async function handleUpdateClause(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const cl = await loadClause(p.id);
  if (!cl) return resourceNotFound("ContractClause", p.id);
  const b = (body ?? {}) as Record<string, unknown>;

  const patch: Record<string, unknown> = { updated_at: naiveIso(), updated_by: ctx ? ctx.email : "SYSTEM" };
  try {
    if ("clauseType" in b && str(b.clauseType) != null) patch["clause_type"] = str(b.clauseType);
    if ("content" in b && str(b.content) != null) patch["content"] = str(b.content);
    if ("riskLevel" in b) patch["risk_level"] = parseRisk(b.riskLevel) ?? null;
    if ("aiAnalysisNotes" in b) patch["ai_analysis_notes"] = str(b.aiAnalysisNotes);
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const { data: saved, error } = await db.from("contract_clauses").update(patch)
    .eq("id", p.id).select("*").single();
  if (error) throw new Error(`clause update failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "UPDATE_CLAUSE", MODULE, "ContractClause", p.id,
    `Updated clause: ${saved.clause_type}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toClauseDto(saved as unknown as Row), "Clause updated"), 200);
}

async function handleDeleteClause(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const cl = await loadClause(p.id);
  if (!cl) return resourceNotFound("ContractClause", p.id);

  const { error } = await db.from("contract_clauses").delete().eq("id", p.id);
  if (error) throw new Error(`clause delete failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "DELETE_CLAUSE", MODULE, "ContractClause", p.id,
    `Deleted clause: ${cl.clause_type}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok("Clause deleted"), 200);
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

async function handleListVendors(ctx: AuthContext | null, req: Request) {
  const url = new URL(req.url);
  const rawStatus = url.searchParams.get("status");
  if (rawStatus != null && !VENDOR_STATUSES.includes(rawStatus)) return generic500();

  let data;
  let error;
  if (rawStatus != null) {
    ({ data, error } = await db.from("vendors").select("*").eq("status", rawStatus));
  } else {
    ({ data, error } = await db.from("vendors").select("*"));
  }
  if (error) throw new Error(`vendors query failed: ${error.message}`);
  const result = ((data as unknown as Row[]) ?? []).map(toVendorDto);
  return jsonResponse(ok(result, "Vendors retrieved"), 200);
}

async function handleGetVendor(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const v = await loadVendor(p.id);
  if (!v) return businessRule(`Vendor not found: ${p.id}`);

  const [obligationsRes, contractsRes] = await Promise.all([
    db.from("vendor_obligations").select("*").eq("vendor_id", p.id),
    db.from("contracts").select("*").eq("vendor_id", p.id),
  ]);
  if (obligationsRes.error) throw new Error(`obligations query failed: ${obligationsRes.error.message}`);
  if (contractsRes.error) throw new Error(`vendor contracts query failed: ${contractsRes.error.message}`);

  const contracts = (contractsRes.data as unknown as Row[]) ?? [];
  const vnames = await vendorNameMap(contracts.map((c) => String(c.vendor_id ?? "")));

  const dto = toVendorDto(v) as Record<string, unknown>;
  dto.obligations = ((obligationsRes.data as unknown as Row[]) ?? []).map(toObligationDto);
  dto.contracts = contracts.map((c) => toContractDto(c, vnames));
  return jsonResponse(ok(dto, "Vendor retrieved"), 200);
}

async function handleCreateVendor(ctx: AuthContext | null, req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = str(b.name)?.trim();
  if (!name || name === "") {
    return businessRule("Vendor name is required.");
  }
  let code = str(b.vendorCode)?.trim();
  if (!code || code === "") {
    code = "VND-" + crypto.randomUUID().slice(0, 4).toUpperCase();
  }
  const vendorCode = code;
  const dup = await db.from("vendors").select("id").eq("vendor_code", vendorCode).maybeSingle();
  if (dup.error) throw new Error(`vendor code check failed: ${dup.error.message}`);
  if (dup.data) {
    return businessRule(`A vendor with code '${vendorCode}' already exists.`);
  }

  let category: string;
  let status: string;
  let perf: number | null;
  let sla: string | null;
  try {
    category = parseCategory(b.category);
    status = parseVendorStatus(b.status, "ACTIVE");
    perf = intVal(b.performanceScore);
    sla = decimalVal(b.slaComplianceRate);
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const now = naiveIso();
  const { data: saved, error } = await db.from("vendors").insert({
    vendor_code: vendorCode,
    name,
    category,
    contact_name: str(b.contactName),
    contact_email: str(b.contactEmail),
    contact_phone: str(b.contactPhone),
    address: str(b.address),
    status,
    performance_score: perf,
    sla_compliance_rate: sla,
    notes: str(b.notes),
    created_at: now,
    updated_at: now,
    created_by: ctx ? ctx.email : "SYSTEM",
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).select("*").single();
  if (error) throw new Error(`vendor insert failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "CREATE_VENDOR", MODULE, "Vendor",
    (saved as unknown as { id: string }).id, `Created vendor: ${name}`,
    ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toVendorDto(saved as unknown as Row), "Vendor created"), 200);
}

async function handleUpdateVendor(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const v = await loadVendor(p.id);
  if (!v) return resourceNotFound("Vendor", p.id);
  const b = (body ?? {}) as Record<string, unknown>;

  const patch: Record<string, unknown> = { updated_at: naiveIso(), updated_by: ctx ? ctx.email : "SYSTEM" };
  try {
    if ("name" in b && str(b.name) != null) patch["name"] = str(b.name);
    if ("category" in b) patch["category"] = parseCategory(b.category);
    if ("contactName" in b) patch["contact_name"] = str(b.contactName);
    if ("contactEmail" in b) patch["contact_email"] = str(b.contactEmail);
    if ("contactPhone" in b) patch["contact_phone"] = str(b.contactPhone);
    if ("address" in b) patch["address"] = str(b.address);
    if ("notes" in b) patch["notes"] = str(b.notes);
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const { data: saved, error } = await db.from("vendors").update(patch)
    .eq("id", p.id).select("*").single();
  if (error) throw new Error(`vendor update failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "UPDATE_VENDOR", MODULE, "Vendor", p.id,
    `Updated vendor: ${saved.name}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toVendorDto(saved as unknown as Row), "Vendor updated"), 200);
}

async function handleChangeVendorStatus(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const b = (body ?? {}) as Record<string, unknown>;
  const statusRaw = b.status;
  if (statusRaw == null) {
    return businessRule("A target status is required.");
  }
  let status: string;
  try {
    status = parseVendorStatus(statusRaw, "");
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const v = await loadVendor(p.id);
  if (!v) return resourceNotFound("Vendor", p.id);

  const { data: saved, error } = await db.from("vendors").update({
    status,
    updated_at: naiveIso(),
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).eq("id", p.id).select("*").single();
  if (error) throw new Error(`vendor status change failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "CHANGE_VENDOR_STATUS", MODULE, "Vendor", p.id,
    `Set vendor '${saved.name}' status=${status}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toVendorDto(saved as unknown as Row), "Vendor status updated"), 200);
}

async function handleRecordVendorPerformance(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const v = await loadVendor(p.id);
  if (!v) return resourceNotFound("Vendor", p.id);
  const b = (body ?? {}) as Record<string, unknown>;

  const patch: Record<string, unknown> = { updated_at: naiveIso(), updated_by: ctx ? ctx.email : "SYSTEM" };
  try {
    if ("performanceScore" in b) patch["performance_score"] = intVal(b.performanceScore);
    if ("slaComplianceRate" in b) patch["sla_compliance_rate"] = decimalVal(b.slaComplianceRate);
    if ("notes" in b && str(b.notes) != null) patch["notes"] = str(b.notes);
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const { data: saved, error } = await db.from("vendors").update(patch)
    .eq("id", p.id).select("*").single();
  if (error) throw new Error(`vendor performance update failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "RECORD_VENDOR_PERFORMANCE", MODULE, "Vendor", p.id,
    `Recorded performance for vendor: ${saved.name} (score=${saved.performance_score ?? "null"}, sla=${saved.sla_compliance_rate ?? "null"})`,
    ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toVendorDto(saved as unknown as Row), "Vendor performance recorded"), 200);
}

// ---------------------------------------------------------------------------
// Vendor obligations
// ---------------------------------------------------------------------------

async function handleAddObligation(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const v = await loadVendor(p.id);
  if (!v) return resourceNotFound("Vendor", p.id);
  const b = (body ?? {}) as Record<string, unknown>;
  const title = str(b.title)?.trim();
  if (!title || title === "") {
    return businessRule("Obligation title is required.");
  }

  let status: string;
  let dueDate: string | null;
  try {
    status = parseObligationStatus(b.status, "PENDING");
    dueDate = parseDate(b.dueDate);
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const now = naiveIso();
  const { data: saved, error } = await db.from("vendor_obligations").insert({
    vendor_id: p.id,
    title,
    description: str(b.description),
    due_date: dueDate,
    status,
    notes: str(b.notes),
    created_at: now,
    updated_at: now,
    created_by: ctx ? ctx.email : "SYSTEM",
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).select("*").single();
  if (error) throw new Error(`obligation insert failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "ADD_OBLIGATION", MODULE, "VendorObligation",
    (saved as unknown as { id: string }).id, `Added obligation '${title}' for vendor: ${v.name}`,
    ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toObligationDto(saved as unknown as Row), "Obligation added"), 200);
}

async function handleUpdateObligation(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const o = await loadObligation(p.id);
  if (!o) return resourceNotFound("VendorObligation", p.id);
  const b = (body ?? {}) as Record<string, unknown>;

  const patch: Record<string, unknown> = { updated_at: naiveIso(), updated_by: ctx ? ctx.email : "SYSTEM" };
  try {
    if ("title" in b && str(b.title) != null) patch["title"] = str(b.title);
    if ("description" in b) patch["description"] = str(b.description);
    if ("dueDate" in b) patch["due_date"] = parseDate(b.dueDate);
    if ("notes" in b) patch["notes"] = str(b.notes);
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const { data: saved, error } = await db.from("vendor_obligations").update(patch)
    .eq("id", p.id).select("*").single();
  if (error) throw new Error(`obligation update failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "UPDATE_OBLIGATION", MODULE, "VendorObligation", p.id,
    `Updated obligation: ${saved.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toObligationDto(saved as unknown as Row), "Obligation updated"), 200);
}

async function handleChangeObligationStatus(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const b = (body ?? {}) as Record<string, unknown>;
  const statusRaw = b.status;
  if (statusRaw == null) {
    return businessRule("A target status is required.");
  }
  let status: string;
  try {
    status = parseObligationStatus(statusRaw, "");
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const o = await loadObligation(p.id);
  if (!o) return resourceNotFound("VendorObligation", p.id);

  const { data: saved, error } = await db.from("vendor_obligations").update({
    status,
    updated_at: naiveIso(),
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).eq("id", p.id).select("*").single();
  if (error) throw new Error(`obligation status change failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "CHANGE_OBLIGATION_STATUS", MODULE, "VendorObligation", p.id,
    `Set obligation '${saved.title}' status=${status}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toObligationDto(saved as unknown as Row), "Obligation status updated"), 200);
}

async function handleDeleteObligation(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const o = await loadObligation(p.id);
  if (!o) return resourceNotFound("VendorObligation", p.id);

  const { error } = await db.from("vendor_obligations").delete().eq("id", p.id);
  if (error) throw new Error(`obligation delete failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "DELETE_OBLIGATION", MODULE, "VendorObligation", p.id,
    `Deleted obligation: ${o.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok("Obligation deleted"), 200);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

async function handleListDocuments(ctx: AuthContext | null, req: Request) {
  const url = new URL(req.url);
  const rawStatus = url.searchParams.get("status");
  if (rawStatus != null && !DOCUMENT_STATUSES.includes(rawStatus)) return generic500();

  let query = db.from("documents").select("*, categories(name)");
  if (rawStatus != null) query = query.eq("status", rawStatus);
  const { data, error } = await query;
  if (error) throw new Error(`documents query failed: ${error.message}`);

  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  const ids = rows.map((d) => String(d.id ?? ""));
  const grantsByDoc = new Map<string, Array<Record<string, unknown>>>();
  if (ids.length > 0) {
    const { data: grantsData, error: grantsError } = await db.from("document_grants")
      .select("document_id, grantee_type, grantee_key, access_level, is_deleted")
      .in("document_id", ids);
    if (grantsError) throw new Error(`document grants query failed: ${grantsError.message}`);
    for (const g of (grantsData as unknown as Record<string, unknown>[]) ?? []) {
      const docId = String(g.document_id ?? "");
      if (!grantsByDoc.has(docId)) grantsByDoc.set(docId, []);
      grantsByDoc.get(docId)!.push(g);
    }
  }

  const userEmail = ctx ? ctx.email : "";
  const userRoles = ctx ? ctx.roles : [];
  const userDept = ctx ? str(ctx.user.row.department) : null;
  const visible = rows.filter((d) => canViewDocument(userEmail, userRoles, userDept, d, grantsByDoc.get(String(d.id ?? "")) ?? []));
  const result = (visible as unknown as Row[]).map(toDocumentDto);
  return jsonResponse(ok(result, "Documents retrieved"), 200);
}

async function handleApproveDocument(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const d = await loadDocument(p.id);
  if (!d) return resourceNotFound("Document", p.id);
  if (d.status !== "PENDING_REVIEW") {
    return businessRule("Only documents pending review can be approved.");
  }

  const { data: saved, error } = await db.from("documents").update({
    status: "APPROVED",
    updated_at: naiveIso(),
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).eq("id", p.id).select("*").single();
  if (error) throw new Error(`document approve failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "APPROVE_DOCUMENT", MODULE, "Document", p.id,
    `Approved document: ${d.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toDocumentDto(saved as unknown as Row), "Document approved"), 200);
}

// ---------------------------------------------------------------------------
// Legal cases (read-only)
// ---------------------------------------------------------------------------

async function handleLegalCases(ctx: AuthContext | null) {
  const { data, error } = await db.from("legal_cases").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(`legal cases query failed: ${error.message}`);
  const result = ((data as unknown as Row[]) ?? []).map(toCaseDto);
  return jsonResponse(ok(result, "Legal cases retrieved"), 200);
}

// ---------------------------------------------------------------------------
// Procurement notices
// ---------------------------------------------------------------------------

async function handleNotices(ctx: AuthContext | null) {
  await generateNotices();
  const { data, error } = await db.from("procurement_notices").select("*")
    .in("status", ["OPEN", "ACKNOWLEDGED"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`notices query failed: ${error.message}`);
  const result = ((data as unknown as Row[]) ?? []).map(toNoticeDto);
  return jsonResponse(ok(result, "Notices retrieved"), 200);
}

async function handleAcknowledgeNotice(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const n = await loadNotice(p.id);
  if (!n) return resourceNotFound("ProcurementNotice", p.id);

  const now = naiveIso();
  const { data: saved, error } = await db.from("procurement_notices").update({
    status: "ACKNOWLEDGED",
    acknowledged_by: ctx ? ctx.email : null,
    acknowledged_at: now,
    updated_at: now,
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).eq("id", p.id).select("*").single();
  if (error) throw new Error(`notice acknowledge failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "ACKNOWLEDGE_NOTICE", MODULE, "ProcurementNotice", p.id,
    `Acknowledged notice: ${n.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toNoticeDto(saved as unknown as Row), "Notice acknowledged"), 200);
}

async function handleDismissNotice(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const n = await loadNotice(p.id);
  if (!n) return resourceNotFound("ProcurementNotice", p.id);

  const now = naiveIso();
  const { data: saved, error } = await db.from("procurement_notices").update({
    status: "DISMISSED",
    updated_at: now,
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).eq("id", p.id).select("*").single();
  if (error) throw new Error(`notice dismiss failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "DISMISS_NOTICE", MODULE, "ProcurementNotice", p.id,
    `Dismissed notice: ${n.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toNoticeDto(saved as unknown as Row), "Notice dismissed"), 200);
}

// ---------------------------------------------------------------------------
// Audit logs (read-only)
// ---------------------------------------------------------------------------

async function handleAuditLogs(ctx: AuthContext | null) {
  const { data, error } = await db
    .from("audit_logs")
    .select("*")
    .gte("created_at", naiveIso(new Date(Date.now() - 30 * 86400000)))
    .order("created_at", { ascending: false });
  if (error) throw new Error(`audit logs query failed: ${error.message}`);
  const result = ((data as unknown as Row[]) ?? []).map(toAuditDto);
  return jsonResponse(ok(result, "Audit logs retrieved"), 200);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes = [
  { method: "GET", path: "/procurement/dashboard/summary", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleDashboard },
  { method: "GET", path: "/procurement/contracts", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleListContracts },
  { method: "GET", path: "/procurement/contracts/:id", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleGetContract },
  { method: "POST", path: "/procurement/contracts", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleCreateContract },
  { method: "PUT", path: "/procurement/contracts/:id", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleUpdateContract },
  { method: "POST", path: "/procurement/contracts/:id/submit-review", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleSubmitReview },
  { method: "POST", path: "/procurement/contracts/:id/approve", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleApproveContract },
  { method: "POST", path: "/procurement/contracts/:id/activate", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleActivateContract },
  { method: "POST", path: "/procurement/contracts/:id/renew", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleRenewContract },
  { method: "POST", path: "/procurement/contracts/:id/terminate", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleTerminateContract },
  { method: "POST", path: "/procurement/contracts/:id/clauses", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleAddClause },
  { method: "PUT", path: "/procurement/clauses/:id", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleUpdateClause },
  { method: "DELETE", path: "/procurement/clauses/:id", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleDeleteClause },
  { method: "GET", path: "/procurement/vendors", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleListVendors },
  { method: "GET", path: "/procurement/vendors/:id", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleGetVendor },
  { method: "POST", path: "/procurement/vendors", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleCreateVendor },
  { method: "PUT", path: "/procurement/vendors/:id", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleUpdateVendor },
  { method: "POST", path: "/procurement/vendors/:id/status", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleChangeVendorStatus },
  { method: "POST", path: "/procurement/vendors/:id/performance", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleRecordVendorPerformance },
  { method: "POST", path: "/procurement/vendors/:id/obligations", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleAddObligation },
  { method: "PUT", path: "/procurement/obligations/:id", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleUpdateObligation },
  { method: "POST", path: "/procurement/obligations/:id/status", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleChangeObligationStatus },
  { method: "DELETE", path: "/procurement/obligations/:id", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleDeleteObligation },
  { method: "GET", path: "/procurement/documents", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleListDocuments },
  { method: "POST", path: "/procurement/documents/:id/approve", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleApproveDocument },
  { method: "GET", path: "/procurement/legal-cases", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleLegalCases },
  { method: "GET", path: "/procurement/notices", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleNotices },
  { method: "POST", path: "/procurement/notices/:id/acknowledge", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleAcknowledgeNotice },
  { method: "POST", path: "/procurement/notices/:id/dismiss", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleDismissNotice },
  { method: "GET", path: "/procurement/audit-logs", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleAuditLogs },
] as const;

Deno.serve(createHandler(routes as never, { name: "procurement" }));