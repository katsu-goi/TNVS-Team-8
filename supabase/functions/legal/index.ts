import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import { naiveIso } from "../_shared/auth-users.ts";
import { writeAudit } from "../_shared/lockout.ts";
import { resolveClientIp } from "../_shared/ip.ts";

const db = adminDb();

const MODULE = "LEGAL";
const EXPIRY_WINDOW_DAYS = 30;
const RENEWAL_WINDOW_DAYS = 30;

const LEGAL_ROLES = ["LEGAL_OFFICER"];

const CONTRACT_TYPES = ["LEASE", "VENDOR_SERVICE", "MAINTENANCE_SLA", "PROCUREMENT", "EMPLOYMENT", "NON_DISCLOSURE", "PARTNERSHIP"];
const CONTRACT_STATUSES = ["DRAFT", "UNDER_REVIEW", "APPROVED", "ACTIVE", "EXPIRED", "TERMINATED", "RENEWED"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const CASE_TYPES = ["LITIGATION", "CONTRACT_DISPUTE", "REGULATORY", "EMPLOYMENT", "INTELLECTUAL_PROPERTY", "COMPLIANCE_INVESTIGATION", "OTHER"];
const CASE_STATUSES = ["OPEN", "IN_PROGRESS", "PENDING_HEARING", "SETTLED", "CLOSED", "APPEALED"];
const CASE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const NOTICE_TYPES = ["CONTRACT_PENDING_REVIEW", "CONTRACT_EXPIRING", "CONTRACT_EXPIRED", "CONTRACT_RENEWAL_DUE", "HIGH_RISK_CLAUSE", "CASE_HEARING_DUE", "CASE_HIGH_PRIORITY"];
const NOTICE_STATUSES = ["OPEN", "ACKNOWLEDGED", "DISMISSED"];
const NOTICE_SEVERITIES = ["INFO", "WARNING", "CRITICAL"];
const DOCUMENT_STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "ARCHIVED", "DELETED"];

const CLOSED_CASE_STATUSES = new Set(["SETTLED", "CLOSED"]);

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

/** documents/contracts/legal_cases.created_at are timestamptz; Spring emits naive UTC LocalDateTime. */
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

function decimalVal(o: unknown): string | null {
  if (o === null || o === undefined) return null;
  const n = Number(String(o));
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric value: ${o}`);
  return String(o);
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
const parseCaseType = (o: unknown) => parseEnum(o, CASE_TYPES, "case type", "OTHER");
const parseCaseStatus = (o: unknown, fallback: string) => parseEnum(o, CASE_STATUSES, "case status", fallback);
const parseCasePriority = (o: unknown, fallback: string) => parseEnum(o, CASE_PRIORITIES, "case priority", fallback);

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// DTO mappers (lazy-safe: only scalar fields; mirror LegalOfficerController)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> & { id: string };

function toContractDto(c: Row) {
  return {
    id: c.id,
    contractNumber: c.contract_number ?? null,
    title: c.title ?? null,
    type: c.type ?? null,
    counterParty: c.counter_party ?? null,
    contractValue: num(c.contract_value),
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

function toCaseDto(c: Row) {
  return {
    id: c.id,
    caseNumber: c.case_number ?? null,
    title: c.title ?? null,
    description: c.description ?? null,
    courtName: c.court_name ?? null,
    judgeName: c.judge_name ?? null,
    opposingParty: c.opposing_party ?? null,
    caseType: c.case_type ?? null,
    status: c.status ?? null,
    priority: c.priority ?? null,
    leadLawyerName: c.lead_lawyer_name ?? null,
    filingDate: dateStr(str(c.filing_date)),
    expectedResolutionDate: dateStr(str(c.expected_resolution_date)),
    closedDate: dateStr(str(c.closed_date)),
    resolutionNotes: c.resolution_notes ?? null,
    createdAt: createdAtUtc(c.created_at),
  };
}

/** LegalCaseController /v1/legal-cases GET-all shape: adds leadLawyerId. */
function toCaseFlatDto(c: Row) {
  return {
    id: c.id,
    caseNumber: c.case_number ?? null,
    title: c.title ?? null,
    description: c.description ?? null,
    courtName: c.court_name ?? null,
    judgeName: c.judge_name ?? null,
    opposingParty: c.opposing_party ?? null,
    caseType: c.case_type ?? null,
    status: c.status ?? null,
    priority: c.priority ?? null,
    leadLawyerId: c.lead_lawyer_id ?? null,
    leadLawyerName: c.lead_lawyer_name ?? null,
    filingDate: dateStr(str(c.filing_date)),
    expectedResolutionDate: dateStr(str(c.expected_resolution_date)),
    closedDate: dateStr(str(c.closed_date)),
    resolutionNotes: c.resolution_notes ?? null,
    createdAt: createdAtUtc(c.created_at),
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

function toPolicyDto(p: Row) {
  return {
    id: p.id,
    name: p.name ?? null,
    description: p.description ?? null,
    retentionPeriodDays: num(p.retention_period_days),
    actionOnExpiry: p.action_on_expiry ?? null,
    active: p.active ?? null,
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

async function loadLegalWorkflowByContract(contractId: string): Promise<Row | null> {
  const { data, error } = await db.from("legal_contract_workflows").select("*").eq("contract_id", contractId).maybeSingle();
  if (error) throw new Error(`legal workflow lookup failed: ${error.message}`);
  return (data as unknown as Row) ?? null;
}

async function loadClause(id: string): Promise<Row | null> {
  const { data, error } = await db.from("contract_clauses").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`clause lookup failed: ${error.message}`);
  return (data as unknown as Row) ?? null;
}

async function loadCase(id: string): Promise<Row | null> {
  const { data, error } = await db.from("legal_cases").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`legal case lookup failed: ${error.message}`);
  return (data as unknown as Row) ?? null;
}

async function loadDocument(id: string): Promise<Row | null> {
  const { data, error } = await db.from("documents").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`document lookup failed: ${error.message}`);
  return (data as unknown as Row) ?? null;
}

async function loadNotice(id: string): Promise<Row | null> {
  const { data, error } = await db.from("legal_notices").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`notice lookup failed: ${error.message}`);
  return (data as unknown as Row) ?? null;
}

async function loadCaseLawyerNames(cases: Row[]): Promise<Map<string, string>> {
  const ids = [...new Set(cases.map((c) => c.lead_lawyer_id).filter((v): v is string => v != null))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await db.from("users").select("id, first_name, last_name").in("id", ids);
  if (error) throw new Error(`lawyer lookup failed: ${error.message}`);
  for (const u of (data as unknown as Array<Record<string, unknown>>) ?? []) {
    map.set(String(u.id), `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim());
  }
  return map;
}

// ---------------------------------------------------------------------------
// Notices (mirrors LegalService.generateNotices + upsertNotice)
// ---------------------------------------------------------------------------

async function upsertNotice(
  dedupKey: string, type: string, severity: string, title: string,
  message: string, entityType: string, entityId: string,
) {
  const existing = await db.from("legal_notices").select("id").eq("dedup_key", dedupKey).maybeSingle();
  if (existing.error) throw new Error(`notice dedup check failed: ${existing.error.message}`);
  if (existing.data) return; // Preserve existing state (acknowledged/dismissed).

  const now = naiveIso();
  const { error } = await db.from("legal_notices").insert({
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
  const cutoff = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const renewalEnd = new Date(Date.now() + RENEWAL_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  const urRes = await db.from("contracts").select("*").eq("status", "UNDER_REVIEW");
  if (urRes.error) throw new Error(`pending review contracts query failed: ${urRes.error.message}`);
  for (const c of (urRes.data as unknown as Row[]) ?? []) {
    await upsertNotice(`CONTRACT_PENDING_REVIEW:${c.id}`, "CONTRACT_PENDING_REVIEW", "INFO",
      `Contract pending review: ${c.title}`,
      `${c.contract_number} with ${c.counter_party} awaits your review.`,
      "Contract", String(c.id));
  }

  const expiringRes = await db.from("contracts").select("*")
    .eq("status", "ACTIVE").lte("end_date", cutoff);
  if (expiringRes.error) throw new Error(`expiring contracts query failed: ${expiringRes.error.message}`);
  for (const c of (expiringRes.data as unknown as Row[]) ?? []) {
    const end = dateStr(str(c.end_date));
    await upsertNotice(`CONTRACT_EXPIRING:${c.id}`, "CONTRACT_EXPIRING", "WARNING",
      `Contract expiring soon: ${c.title}`,
      `${c.contract_number} with ${c.counter_party} ends ${end}.`,
      "Contract", String(c.id));
  }

  const expiredRes = await db.from("contracts").select("*").eq("status", "EXPIRED");
  if (expiredRes.error) throw new Error(`expired contracts query failed: ${expiredRes.error.message}`);
  for (const c of (expiredRes.data as unknown as Row[]) ?? []) {
    const end = dateStr(str(c.end_date));
    await upsertNotice(`CONTRACT_EXPIRED:${c.id}`, "CONTRACT_EXPIRED", "CRITICAL",
      `Contract expired: ${c.title}`,
      `${c.contract_number} with ${c.counter_party} expired on ${end}.`,
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

  const clausesRes = await db.from("contract_clauses").select("*");
  if (clausesRes.error) throw new Error(`clauses query failed: ${clausesRes.error.message}`);
  for (const cl of (clausesRes.data as unknown as Row[]) ?? []) {
    if (cl.risk_level !== "HIGH" && cl.risk_level !== "CRITICAL") continue;
    const contractTitle = cl.contract_title ?? "a contract";
    await upsertNotice(`HIGH_RISK_CLAUSE:${cl.id}`, "HIGH_RISK_CLAUSE",
      cl.risk_level === "CRITICAL" ? "CRITICAL" : "WARNING",
      `${cl.risk_level}-risk clause: ${cl.clause_type}`,
      `Clause '${cl.clause_type}' on ${contractTitle} is flagged ${cl.risk_level}.`,
      "ContractClause", String(cl.id));
  }

  const hearingRes = await db.from("legal_cases").select("*").eq("status", "PENDING_HEARING");
  if (hearingRes.error) throw new Error(`hearing cases query failed: ${hearingRes.error.message}`);
  for (const c of (hearingRes.data as unknown as Row[]) ?? []) {
    await upsertNotice(`CASE_HEARING_DUE:${c.id}`, "CASE_HEARING_DUE", "WARNING",
      `Case awaiting hearing: ${c.title}`,
      `${c.case_number} is pending hearing${c.court_name != null ? ` at ${c.court_name}` : ""}.`,
      "LegalCase", String(c.id));
  }

  const criticalRes = await db.from("legal_cases").select("*").eq("priority", "CRITICAL");
  if (criticalRes.error) throw new Error(`critical cases query failed: ${criticalRes.error.message}`);
  for (const c of (criticalRes.data as unknown as Row[]) ?? []) {
    if (CLOSED_CASE_STATUSES.has(String(c.status))) continue;
    await upsertNotice(`CASE_HIGH_PRIORITY:${c.id}`, "CASE_HIGH_PRIORITY", "CRITICAL",
      `Critical-priority case: ${c.title}`,
      `${c.case_number} is flagged CRITICAL and remains open.`,
      "LegalCase", String(c.id));
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function handleDashboard(ctx: AuthContext | null, req: Request) {
  await generateNotices();

  const [contractsRes, casesRes, auditRes, docsRes, noticesRes] = await Promise.all([
    db.from("contracts").select("*"),
    db.from("legal_cases").select("*"),
    db.from("audit_logs").select("id").gte("created_at", naiveIso(new Date(Date.now() - 7 * 86400000))),
    db.from("documents").select("id").eq("status", "PENDING_REVIEW"),
    db.from("legal_notices").select("id").eq("status", "OPEN"),
  ]);
  for (const r of [contractsRes, casesRes, auditRes, docsRes, noticesRes]) {
    if (r.error) throw new Error(`dashboard query failed: ${r.error.message}`);
  }

  const contracts = (contractsRes.data as unknown as Row[]) ?? [];
  const cases = (casesRes.data as unknown as Row[]) ?? [];
  const lawyerNames = await loadCaseLawyerNames(cases);

  const cutoff = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const expiring = contracts
    .filter((c) => c.status === "ACTIVE" && c.end_date != null && dateStr(str(c.end_date))! <= cutoff);

  const countByStatus = (list: Array<Record<string, unknown>>, status: string) =>
    list.filter((x) => x.status === status).length;

  const openCases = cases.filter((c) => !CLOSED_CASE_STATUSES.has(String(c.status))).length;
  const highPriorityCases = cases.filter(
    (c) => (c.priority === "HIGH" || c.priority === "CRITICAL") && !CLOSED_CASE_STATUSES.has(String(c.status)),
  ).length;

  const contractsByStatus: Record<string, number> = {};
  for (const c of contracts) {
    if (c.status != null) contractsByStatus[String(c.status)] = (contractsByStatus[String(c.status)] ?? 0) + 1;
  }
  const casesByStatus: Record<string, number> = {};
  for (const c of cases) {
    if (c.status != null) casesByStatus[String(c.status)] = (casesByStatus[String(c.status)] ?? 0) + 1;
  }

  const expiringSoon = [...expiring]
    .sort((a, b) => {
      const ea = dbMs(str(a.end_date)) ?? Number.MAX_SAFE_INTEGER;
      const eb = dbMs(str(b.end_date)) ?? Number.MAX_SAFE_INTEGER;
      return ea - eb;
    })
    .map(toContractDto);

  const pendingReviews = contracts
    .filter((c) => c.status === "UNDER_REVIEW")
    .map(toContractDto);

  const recentCases = [...cases]
    .sort((a, b) => {
      const ta = dbMs(str(a.created_at));
      const tb = dbMs(str(b.created_at));
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1; // nulls last
      if (tb == null) return -1;
      return tb - ta; // reverse order
    })
    .slice(0, 5)
    .map((c) => ({ ...toCaseDto(c), leadLawyerName: lawyerNames.get(String(c.lead_lawyer_id)) ?? null }));

  const summary = {
    pendingContractReviews: countByStatus(contracts, "UNDER_REVIEW"),
    activeContracts: countByStatus(contracts, "ACTIVE"),
    totalContracts: contracts.length,
    expiringContracts: expiring.length,
    totalCases: cases.length,
    openCases,
    highPriorityCases,
    documentReviewQueue: (docsRes.data ?? []).length,
    openNotices: (noticesRes.data ?? []).length,
    recentAuditEvents: (auditRes.data ?? []).length,
    contractsByStatus,
    casesByStatus,
    expiringSoon,
    pendingReviews,
    recentCases,
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
  const statusFilter = rawStatus != null ? rawStatus : null;

  let data;
  let error;
  if (statusFilter != null) {
    ({ data, error } = await db.from("contracts").select("*").eq("status", statusFilter));
  } else {
    ({ data, error } = await db.from("contracts").select("*"));
  }
  if (error) throw new Error(`contracts query failed: ${error.message}`);
  const contracts = (data as unknown as Row[]) ?? [];
  const contractIds = contracts.map((contract) => contract.id);
  const workflowResult = contractIds.length
    ? await db.from("legal_contract_workflows").select("id, contract_id, state, locked, counsel_comments, submitted_at, reviewed_at").in("contract_id", contractIds)
    : { data: [], error: null };
  if (workflowResult.error) throw new Error(`legal workflow lookup failed: ${workflowResult.error.message}`);
  const workflows = new Map((workflowResult.data ?? []).map((workflow) => [String(workflow.contract_id), workflow]));
  const result = contracts.map((contract) => {
    const workflow = workflows.get(contract.id);
    return {
      ...toContractDto(contract),
      workflowId: workflow?.id ?? null,
      workflowState: workflow?.state ?? "DRAFT",
      workflowLocked: Boolean(workflow?.locked),
      counselComments: workflow?.counsel_comments ?? null,
      submittedAt: workflow?.submitted_at ?? null,
      reviewedAt: workflow?.reviewed_at ?? null,
    };
  });
  return jsonResponse(ok(result, "Contracts retrieved"), 200);
}

async function handleGetContract(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const c = await loadContract(p.id);
  if (!c) return businessRule(`Contract not found: ${p.id}`);
  const clausesRes = await db.from("contract_clauses").select("*").eq("contract_id", p.id);
  if (clausesRes.error) throw new Error(`clauses query failed: ${clausesRes.error.message}`);
  const dto = toContractDto(c) as Record<string, unknown>;
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
  try {
    type = parseType(b.type);
    risk = parseRisk(b.aiAssessedRiskLevel);
    startDate = parseDate(b.startDate);
    endDate = parseDate(b.endDate);
    renewal = parseDate(b.renewalNoticeDate);
    value = decimalVal(b.contractValue);
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

  const { error: workflowError } = await db.from("legal_contract_workflows").upsert({
    contract_id: (saved as unknown as { id: string }).id,
    state: "DRAFT",
    created_at: now,
    updated_at: now,
  }, { onConflict: "contract_id" });
  if (workflowError) throw new Error(`legal workflow creation failed: ${workflowError.message}`);

  return jsonResponse(ok(toContractDto(saved as unknown as Row), "Contract created"), 200);
}

async function handleUpdateContract(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const c = await loadContract(p.id);
  if (!c) return resourceNotFound("Contract", p.id);
  const workflow = await loadLegalWorkflowByContract(p.id);
  if (workflow?.locked) {
    return businessRule("This contract is locked while Legal Counsel reviews or has approved it.");
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const patch: Record<string, unknown> = { updated_at: naiveIso(), updated_by: ctx ? ctx.email : "SYSTEM" };
  try {
    if ("title" in b && str(b.title) != null) patch["title"] = str(b.title);
    if ("type" in b) patch["type"] = parseType(b.type);
    if ("counterParty" in b) patch["counter_party"] = str(b.counterParty);
    if ("contractValue" in b) patch["contract_value"] = decimalVal(b.contractValue);
    if ("startDate" in b) patch["start_date"] = parseDate(b.startDate);
    if ("endDate" in b) patch["end_date"] = parseDate(b.endDate);
    if ("renewalNoticeDate" in b) patch["renewal_notice_date"] = parseDate(b.renewalNoticeDate);
    if ("aiAssessedRiskLevel" in b) patch["ai_assessed_risk_level"] = parseRisk(b.aiAssessedRiskLevel);
    if ("aiRiskSummary" in b) patch["ai_risk_summary"] = str(b.aiRiskSummary);
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const { data: saved, error } = await db.from("contracts").update(patch)
    .eq("id", p.id).select("*").single();
  if (error) throw new Error(`contract update failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "UPDATE_CONTRACT", MODULE, "Contract", p.id,
    `Updated contract: ${saved.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toContractDto(saved as unknown as Row), "Contract updated"), 200);
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

  return jsonResponse(ok(toContractDto(saved as unknown as Row), message), 200);
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

  return jsonResponse(ok(toContractDto(saved as unknown as Row), "Contract renewed"), 200);
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
    risk = parseRisk(b.riskLevel);
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
    if ("riskLevel" in b) patch["risk_level"] = parseRisk(b.riskLevel);
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
// Legal cases
// ---------------------------------------------------------------------------

async function handleListCases(ctx: AuthContext | null, req: Request) {
  const url = new URL(req.url);
  const rawStatus = url.searchParams.get("status");
  if (rawStatus != null && !CASE_STATUSES.includes(rawStatus)) return generic500();
  const statusFilter = rawStatus != null ? rawStatus : null;

  let data;
  let error;
  if (statusFilter != null) {
    ({ data, error } = await db.from("legal_cases").select("*")
      .eq("status", statusFilter).order("created_at", { ascending: false }));
  } else {
    ({ data, error } = await db.from("legal_cases").select("*").order("created_at", { ascending: false }));
  }
  if (error) throw new Error(`legal cases query failed: ${error.message}`);
  const rows = (data as unknown as Row[]) ?? [];
  const lawyerNames = await loadCaseLawyerNames(rows);
  const result = rows.map((c) => ({ ...toCaseDto(c), leadLawyerName: lawyerNames.get(String(c.lead_lawyer_id)) ?? null }));
  return jsonResponse(ok(result, "Legal cases retrieved"), 200);
}

async function handleGetCase(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const c = await loadCase(p.id);
  if (!c) return businessRule(`Legal case not found: ${p.id}`);
  const lawyerNames = await loadCaseLawyerNames([c]);
  const dto = { ...toCaseDto(c), leadLawyerName: lawyerNames.get(String(c.lead_lawyer_id)) ?? null };
  return jsonResponse(ok(dto, "Legal case retrieved"), 200);
}

async function handleCreateCase(ctx: AuthContext | null, req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = str(b.title)?.trim();
  if (!title || title === "") {
    return businessRule("Case title is required.");
  }
  let number = str(b.caseNumber)?.trim();
  if (!number || number === "") {
    number = "CASE-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  }
  const caseNumber = number;
  const dup = await db.from("legal_cases").select("id").eq("case_number", caseNumber).maybeSingle();
  if (dup.error) throw new Error(`case number check failed: ${dup.error.message}`);
  if (dup.data) {
    return businessRule(`A case with number '${caseNumber}' already exists.`);
  }

  let caseType: string;
  let status: string;
  let priority: string;
  let filingDate: string | null;
  let expectedResolutionDate: string | null;
  try {
    caseType = parseCaseType(b.caseType);
    status = parseCaseStatus(b.status, "OPEN");
    priority = parseCasePriority(b.priority, "MEDIUM");
    filingDate = parseDate(b.filingDate);
    expectedResolutionDate = parseDate(b.expectedResolutionDate);
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const now = naiveIso();
  const { data: saved, error } = await db.from("legal_cases").insert({
    case_number: caseNumber,
    title,
    description: str(b.description),
    court_name: str(b.courtName),
    judge_name: str(b.judgeName),
    opposing_party: str(b.opposingParty),
    case_type: caseType,
    status,
    priority,
    filing_date: filingDate,
    expected_resolution_date: expectedResolutionDate,
    updated_at: now,
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).select("*").single();
  if (error) throw new Error(`legal case insert failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "CREATE_CASE", MODULE, "LegalCase",
    (saved as unknown as { id: string }).id, `Created legal case: ${title}`,
    ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toCaseDto(saved as unknown as Row), "Legal case created"), 200);
}

async function handleUpdateCase(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const c = await loadCase(p.id);
  if (!c) return resourceNotFound("LegalCase", p.id);
  const b = (body ?? {}) as Record<string, unknown>;

  const patch: Record<string, unknown> = { updated_at: naiveIso(), updated_by: ctx ? ctx.email : "SYSTEM" };
  try {
    if ("title" in b && str(b.title) != null) patch["title"] = str(b.title);
    if ("description" in b) patch["description"] = str(b.description);
    if ("courtName" in b) patch["court_name"] = str(b.courtName);
    if ("judgeName" in b) patch["judge_name"] = str(b.judgeName);
    if ("opposingParty" in b) patch["opposing_party"] = str(b.opposingParty);
    if ("caseType" in b) patch["case_type"] = parseCaseType(b.caseType);
    if ("priority" in b) patch["priority"] = parseCasePriority(b.priority, String(c.priority ?? "MEDIUM"));
    if ("filingDate" in b) patch["filing_date"] = parseDate(b.filingDate);
    if ("expectedResolutionDate" in b) patch["expected_resolution_date"] = parseDate(b.expectedResolutionDate);
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const { data: saved, error } = await db.from("legal_cases").update(patch)
    .eq("id", p.id).select("*").single();
  if (error) throw new Error(`legal case update failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "UPDATE_CASE", MODULE, "LegalCase", p.id,
    `Updated legal case: ${saved.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toCaseDto(saved as unknown as Row), "Legal case updated"), 200);
}

async function handleChangeCaseStatus(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const c = await loadCase(p.id);
  if (!c) return resourceNotFound("LegalCase", p.id);
  const b = (body ?? {}) as Record<string, unknown>;

  const statusRaw = b.status;
  if (statusRaw == null) {
    return businessRule("A target status is required.");
  }
  let status: string;
  try {
    status = parseCaseStatus(statusRaw, "");
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const patch: Record<string, unknown> = {
    status,
    updated_at: naiveIso(),
    updated_by: ctx ? ctx.email : "SYSTEM",
  };
  const notes = str(b.notes);
  if (notes != null && notes.trim() !== "") patch["resolution_notes"] = notes;
  if (CLOSED_CASE_STATUSES.has(status)) {
    patch["closed_date"] = todayStr();
  }

  const { data: saved, error } = await db.from("legal_cases").update(patch)
    .eq("id", p.id).select("*").single();
  if (error) throw new Error(`legal case status change failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "CHANGE_CASE_STATUS", MODULE, "LegalCase", p.id,
    `Set case '${saved.title}' status=${status}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toCaseDto(saved as unknown as Row), "Case status updated"), 200);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

async function handleListDocuments(ctx: AuthContext | null, req: Request) {
  const url = new URL(req.url);
  const rawStatus = url.searchParams.get("status");
  if (rawStatus != null && !DOCUMENT_STATUSES.includes(rawStatus)) return generic500();
  const statusFilter = rawStatus != null ? rawStatus : null;

  let data;
  let error;
  if (statusFilter != null) {
    ({ data, error } = await db.from("documents").select("*").eq("status", statusFilter));
  } else {
    ({ data, error } = await db.from("documents").select("*"));
  }
  if (error) throw new Error(`documents query failed: ${error.message}`);

  // DocumentAccessPolicy: LEGAL_OFFICER canView() always returns true, so no
  // filtering is needed (route guard already restricts to that role).
  const result = ((data as unknown as Row[]) ?? []).map(toDocumentDto);
  return jsonResponse(ok(result, "Documents retrieved"), 200);
}

async function handleApproveDocument(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const doc = await loadDocument(p.id);
  if (!doc) return resourceNotFound("Document", p.id);
  if (doc.status !== "PENDING_REVIEW") {
    return businessRule("Only documents pending review can be approved.");
  }

  const now = naiveIso();
  const { data: saved, error } = await db.from("documents")
    .update({ status: "APPROVED", updated_at: now, updated_by: ctx ? ctx.email : "SYSTEM" })
    .eq("id", p.id).select("*").single();
  if (error) throw new Error(`document approve failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "APPROVE_DOCUMENT", MODULE, "Document", p.id,
    `Approved document: ${doc.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toDocumentDto(saved as unknown as Row), "Document approved"), 200);
}

// ---------------------------------------------------------------------------
// Retention policies (read-only)
// ---------------------------------------------------------------------------

async function handleRetentionPolicies(ctx: AuthContext | null) {
  const { data, error } = await db.from("retention_policies").select("*");
  if (error) throw new Error(`retention policies query failed: ${error.message}`);
  const result = ((data as unknown as Row[]) ?? []).map(toPolicyDto);
  return jsonResponse(ok(result, "Retention policies retrieved"), 200);
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

async function handleNotices(ctx: AuthContext | null) {
  await generateNotices();
  const { data, error } = await db.from("legal_notices").select("*")
    .in("status", ["OPEN", "ACKNOWLEDGED"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`notices query failed: ${error.message}`);
  const result = ((data as unknown as Row[]) ?? []).map(toNoticeDto);
  return jsonResponse(ok(result, "Notices retrieved"), 200);
}

async function handleAcknowledgeNotice(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const notice = await loadNotice(p.id);
  if (!notice) return resourceNotFound("LegalNotice", p.id);
  const a = notice as Row;

  const now = naiveIso();
  const { data: saved, error } = await db.from("legal_notices").update({
    status: "ACKNOWLEDGED",
    acknowledged_by: ctx ? ctx.email : null,
    acknowledged_at: now,
    updated_at: now,
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).eq("id", p.id).select("*").single();
  if (error) throw new Error(`notice acknowledge failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "ACKNOWLEDGE_NOTICE", MODULE, "LegalNotice", p.id,
    `Acknowledged notice: ${a.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toNoticeDto(saved as unknown as Row), "Notice acknowledged"), 200);
}

async function handleDismissNotice(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const notice = await loadNotice(p.id);
  if (!notice) return resourceNotFound("LegalNotice", p.id);
  const a = notice as Row;

  const now = naiveIso();
  const { data: saved, error } = await db.from("legal_notices").update({
    status: "DISMISSED",
    updated_at: now,
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).eq("id", p.id).select("*").single();
  if (error) throw new Error(`notice dismiss failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "DISMISS_NOTICE", MODULE, "LegalNotice", p.id,
    `Dismissed notice: ${a.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

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
// /v1/legal-cases (LegalCaseController: LEGAL_OFFICER only)
// ---------------------------------------------------------------------------

async function handleLegalCasesList(ctx: AuthContext | null) {
  const { data, error } = await db.from("legal_cases").select("*");
  if (error) throw new Error(`legal cases query failed: ${error.message}`);
  const rows = (data as unknown as Row[]) ?? [];
  const lawyerNames = await loadCaseLawyerNames(rows);
  const result = rows.map((c) => ({ ...toCaseFlatDto(c), leadLawyerName: lawyerNames.get(String(c.lead_lawyer_id)) ?? null }));
  return jsonResponse(ok(result, "Legal cases retrieved"), 200);
}

async function handleLegalCasesCreate(ctx: AuthContext | null, req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const insert: Record<string, unknown> = {
    case_number: str(b.caseNumber),
    title: str(b.title),
    description: str(b.description),
    court_name: str(b.courtName),
    judge_name: str(b.judgeName),
    opposing_party: str(b.opposingParty),
    case_type: str(b.caseType) ?? "OTHER",
    status: str(b.status) ?? "OPEN",
    priority: str(b.priority) ?? "MEDIUM",
    filing_date: parseDate(b.filingDate),
    expected_resolution_date: parseDate(b.expectedResolutionDate),
    updated_at: naiveIso(),
    updated_by: ctx ? ctx.email : "SYSTEM",
  };
  const { data: saved, error } = await db.from("legal_cases").insert(insert).select("*").single();
  if (error) throw new Error(`legal case insert failed: ${error.message}`);

  const rows = [saved as unknown as Row];
  const lawyerNames = await loadCaseLawyerNames(rows);
  const dto = { ...toCaseFlatDto(saved as unknown as Row), leadLawyerName: lawyerNames.get(String((saved as unknown as Row).lead_lawyer_id)) ?? null };
  return jsonResponse(ok(dto, "Legal case created"), 200);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes = [
  { method: "GET", path: "/legal/dashboard/summary", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleDashboard },
  { method: "GET", path: "/legal/contracts", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleListContracts },
  { method: "GET", path: "/legal/contracts/:id", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleGetContract },
  { method: "POST", path: "/legal/contracts", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleCreateContract },
  { method: "PUT", path: "/legal/contracts/:id", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleUpdateContract },
  { method: "POST", path: "/legal/contracts/:id/clauses", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleAddClause },
  { method: "PUT", path: "/legal/clauses/:id", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleUpdateClause },
  { method: "DELETE", path: "/legal/clauses/:id", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleDeleteClause },
  { method: "GET", path: "/legal/cases", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleListCases },
  { method: "GET", path: "/legal/cases/:id", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleGetCase },
  { method: "POST", path: "/legal/cases", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleCreateCase },
  { method: "PUT", path: "/legal/cases/:id", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleUpdateCase },
  { method: "POST", path: "/legal/cases/:id/status", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleChangeCaseStatus },
  { method: "GET", path: "/legal/documents", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleListDocuments },
  { method: "POST", path: "/legal/documents/:id/approve", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleApproveDocument },
  { method: "GET", path: "/legal/retention-policies", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleRetentionPolicies },
  { method: "GET", path: "/legal/notices", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleNotices },
  { method: "POST", path: "/legal/notices/:id/acknowledge", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleAcknowledgeNotice },
  { method: "POST", path: "/legal/notices/:id/dismiss", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleDismissNotice },
  { method: "GET", path: "/legal/audit-logs", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleAuditLogs },
  { method: "GET", path: "/legal-cases", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleLegalCasesList },
  { method: "POST", path: "/legal-cases", guard: { kind: "assignedRoles", roles: LEGAL_ROLES }, handler: handleLegalCasesCreate },
] as const;

Deno.serve(createHandler(routes as never, { name: "legal" }));
