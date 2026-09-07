import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import { naiveIso } from "../_shared/auth-users.ts";
import { writeAudit } from "../_shared/lockout.ts";
import { resolveClientIp } from "../_shared/ip.ts";

const db = adminDb();

const MODULE = "COMPLIANCE";
const BUCKET = "documents";
const EXPIRY_WINDOW_DAYS = 30;

const COMPLIANCE_ROLES = ["COMPLIANCE_OFFICER"];
const HOLD_ROLES = ["COMPLIANCE_OFFICER", "LEGAL_COUNSEL"];

const DOCUMENT_STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "ARCHIVED", "DELETED"];
const CONTRACT_STATUSES = ["DRAFT", "UNDER_REVIEW", "APPROVED", "ACTIVE", "EXPIRED", "TERMINATED", "RENEWED"];
const DISPOSAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"];
const POLICY_ACTIONS = ["ARCHIVE", "PERMANENT_DELETE", "REVIEW", "TRANSFER"];
const ALERT_STATUSES = ["OPEN", "ACKNOWLEDGED", "DISMISSED"];

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

function isUuid(s: string | undefined): s is string {
  return s != null && UUID_RE.test(s);
}

function isValidStorageObjectPath(filePath: string): boolean {
  const path = filePath.trim();
  return path !== "" && !path.startsWith("/") && !path.startsWith("\\")
    && !/^[A-Za-z]:[\\/]/.test(path) && !path.includes("\\")
    && path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function isMissingStorageObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: unknown; statusCode?: unknown; message?: unknown; error?: unknown };
  const status = Number(value.statusCode ?? value.status);
  const message = String(value.message ?? value.error ?? "").toLowerCase();
  return status === 404 || message.includes("not found") || message.includes("object not found");
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

function intVal(o: unknown, fallback: number): number {
  if (o === null || o === undefined) return fallback;
  const n = Number(String(o));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseAction(o: unknown): string {
  if (o === null || o === undefined) return "REVIEW";
  const up = String(o).toUpperCase();
  if (!POLICY_ACTIONS.includes(up)) throw new Error(`Invalid actionOnExpiry: ${o}`);
  return up;
}

function parseTriggerBasis(o: unknown): string {
  const value = String(o ?? "FINAL_APPROVAL").toUpperCase();
  if (!["CREATION", "FINAL_APPROVAL", "CONTRACT_EXPIRATION", "FISCAL_YEAR_END"].includes(value)) {
    throw new Error(`Invalid triggerBasis: ${o}`);
  }
  return value;
}

function parseAlertWindows(o: unknown): number[] {
  if (o == null) return [90, 30, 7];
  if (!Array.isArray(o)) throw new Error("alertWindowsDays must be an array.");
  const values = [...new Set(o.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 3650))];
  if (values.length === 0) throw new Error("alertWindowsDays must contain at least one valid day window.");
  return values.sort((a, b) => b - a);
}

// ---------------------------------------------------------------------------
// DTO mappers (lazy-safe: only scalar fields; mirror ComplianceController)
// ---------------------------------------------------------------------------

type DocumentRow = Record<string, unknown> & { id: string };

function toDocumentDto(d: DocumentRow) {
  return {
    id: d.id,
    title: d.title ?? null,
    fileName: d.file_name ?? null,
    fileType: d.file_type ?? null,
    fileSize: num(d.file_size),
    status: d.status ?? null,
    classificationLevel: d.classification_level ?? null,
    aiSummary: d.ai_summary ?? null,
    aiPredictedCategory: d.ai_predicted_category ?? null,
    confidenceScore: num(d.confidence_score),
    aiDetectedDocumentType: d.ai_detected_document_type ?? null,
    aiClassificationReason: d.ai_classification_reason ?? null,
    aiProviderName: d.ai_provider_name ?? null,
    aiModel: d.ai_model ?? null,
    aiProcessedAt: d.ai_processed_at ?? null,
    aiExtractionMethod: d.ai_extraction_method ?? null,
    aiReviewRequired: d.ai_review_required === true,
    classificationReviewStatus: d.classification_review_status ?? null,
    finalClassification: d.final_classification ?? null,
    classificationReviewedBy: d.classification_reviewed_by ?? null,
    classificationReviewedAt: d.classification_reviewed_at ?? null,
    retentionPolicyId: d.retention_policy_id ?? null,
    retentionPolicyVersion: num(d.retention_policy_version),
    retentionAssignedAt: d.retention_assigned_at ?? null,
    retentionAssignmentSource: d.retention_assignment_source ?? null,
    retentionCalculationBasis: d.retention_calculation_basis ?? null,
    retentionTriggerAt: dateStr(str(d.retention_trigger_at)),
    retentionExpiresAt: dateStr(str(d.retention_expires_at)),
    retentionStatus: d.retention_status ?? "UNASSIGNED",
    physicalDispositionStatus: d.physical_disposition_status ?? "NOT_REQUESTED",
    versionNumber: num(d.version_number),
    createdAt: createdAtUtc(d.created_at),
  };
}

function toContractDto(c: Record<string, unknown> & { id: string }) {
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
  };
}

function toPolicyDto(p: Record<string, unknown> & { id: string }) {
  return {
    id: p.id,
    name: p.name ?? null,
    description: p.description ?? null,
    retentionPeriodDays: num(p.retention_period_days),
    actionOnExpiry: p.action_on_expiry ?? null,
    policyVersion: num(p.policy_version),
    classificationName: p.classification_name ?? null,
    applicableDepartment: p.applicable_department ?? null,
    triggerBasis: p.trigger_basis ?? null,
    alertWindowsDays: p.alert_windows_days ?? [],
    effectiveFrom: dateStr(str(p.effective_from)),
    effectiveTo: dateStr(str(p.effective_to)),
    active: p.active ?? null,
  };
}

function toAuditDto(a: Record<string, unknown> & { id: string }) {
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

function toDisposalDto(r: Record<string, unknown> & { id: string }) {
  return {
    id: r.id,
    documentId: r.document_id ?? null,
    documentTitle: r.document_title ?? null,
    reason: r.reason ?? null,
    status: r.status ?? null,
    decisionNotes: r.decision_notes ?? null,
    decidedBy: r.decided_by ?? null,
    decidedAt: r.decided_at ?? null,
    policyAction: r.policy_action ?? null,
    physicalDispositionStatus: r.physical_disposition_status ?? null,
    physicalDisposedAt: r.physical_disposed_at ?? null,
    completedAt: r.completed_at ?? null,
    createdAt: r.created_at ?? null,
  };
}

function toAlertDto(a: Record<string, unknown> & { id: string }) {
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
    deadlineDate: dateStr(str(a.deadline_date)),
    alertWindowDays: num(a.alert_window_days),
  };
}

/** documents.created_at is timestamptz; Spring emits a naive UTC LocalDateTime. */
function createdAtUtc(v: unknown): string | null {
  if (!v) return null;
  return toUtcIso(String(v)).replace("Z", "");
}

async function loadDocument(id: string): Promise<DocumentRow | null> {
  const { data, error } = await db.from("documents").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`document lookup failed: ${error.message}`);
  return (data as unknown as DocumentRow) ?? null;
}

async function loadContract(id: string) {
  const { data, error } = await db.from("contracts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`contract lookup failed: ${error.message}`);
  return data;
}

async function loadDisposal(id: string) {
  const { data, error } = await db.from("disposal_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`disposal lookup failed: ${error.message}`);
  return data;
}

async function loadAlert(id: string) {
  const { data, error } = await db.from("compliance_alerts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`alert lookup failed: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function handleDashboard(ctx: AuthContext | null, _req: Request) {
  const [docsRes, contractsRes, polsRes, auditRes, disposalsRes, alertsRes, holdsRes, obligationsRes, runRes] = await Promise.all([
    db.from("documents").select("*"),
    db.from("contracts").select("*"),
    db.from("retention_policies").select("*").eq("active", true),
    db.from("audit_logs").select("id").gte("created_at", naiveIso(new Date(Date.now() - 7 * 86400000))),
    db.from("disposal_requests").select("id").eq("status", "PENDING"),
    db.from("compliance_alerts").select("id").eq("status", "OPEN"),
    db.from("document_legal_holds").select("id").eq("status", "ACTIVE"),
    db.from("contract_obligations").select("id, status, due_date").in("status", ["PENDING", "IN_PROGRESS", "OVERDUE"]),
    db.from("lifecycle_automation_runs").select("*").eq("job_name", "phase4-lifecycle-daily")
      .order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [docsRes, contractsRes, polsRes, auditRes, disposalsRes, alertsRes, holdsRes, obligationsRes, runRes]) {
    if (r.error) throw new Error(`dashboard query failed: ${r.error.message}`);
  }

  const documents = (docsRes.data as unknown as DocumentRow[]) ?? [];
  const contracts = (contractsRes.data as unknown as Array<Record<string, unknown> & { id: string }>) ?? [];

  const countByStatus = (list: Array<Record<string, unknown>>, status: string) =>
    list.filter((x) => x.status === status).length;

  const pendingReview = countByStatus(documents, "PENDING_REVIEW");
  const approvedDocuments = countByStatus(documents, "APPROVED");
  const archivedDocuments = countByStatus(documents, "ARCHIVED");
  const activeContracts = countByStatus(contracts, "ACTIVE");
  const retentionPolicyRequired = documents.filter((d) => d.retention_status === "RETENTION_POLICY_REQUIRED").length;
  const retentionExpiring = documents.filter((d) => d.retention_status === "EXPIRING").length;
  const retentionExpired = documents.filter((d) => d.retention_status === "ELIGIBLE_FOR_DISPOSAL").length;
  const obligations = (obligationsRes.data as Array<Record<string, unknown>>) ?? [];
  const overdueObligations = obligations.filter((o) => o.status === "OVERDUE").length;

  const cutoff = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const expiring = contracts
    .filter((c) => c.status === "ACTIVE" && c.end_date != null && dateStr(str(c.end_date))! <= cutoff);

  const documentsByStatus: Record<string, number> = {};
  for (const d of documents) {
    if (d.status != null) documentsByStatus[String(d.status)] = (documentsByStatus[String(d.status)] ?? 0) + 1;
  }
  const contractsByStatus: Record<string, number> = {};
  for (const c of contracts) {
    if (c.status != null) contractsByStatus[String(c.status)] = (contractsByStatus[String(c.status)] ?? 0) + 1;
  }

  const expiringSoon = [...expiring]
    .sort((a, b) => {
      const ea = dbMs(str(a.end_date)) ?? Number.MAX_SAFE_INTEGER;
      const eb = dbMs(str(b.end_date)) ?? Number.MAX_SAFE_INTEGER;
      return ea - eb;
    })
    .map(toContractDto);

  const recentDocuments = [...documents]
    .sort((a, b) => {
      const ta = dbMs(str(a.created_at));
      const tb = dbMs(str(b.created_at));
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1; // nulls last
      if (tb == null) return -1;
      return tb - ta; // reverse order
    })
    .slice(0, 5)
    .map(toDocumentDto);

  const summary = {
    totalDocuments: documents.length,
    pendingReview,
    approvedDocuments,
    archivedDocuments,
    totalContracts: contracts.length,
    activeContracts,
    expiringContracts: expiring.length,
    retentionPolicies: (polsRes.data ?? []).length,
    recentAuditEvents: (auditRes.data ?? []).length,
    pendingDisposals: (disposalsRes.data ?? []).length,
    openAlerts: (alertsRes.data ?? []).length,
    retentionPolicyRequired,
    retentionExpiring,
    retentionExpired,
    activeLegalHolds: (holdsRes.data ?? []).length,
    overdueObligations,
    automationHealth: runRes.data ? {
      jobName: runRes.data.job_name,
      status: runRes.data.status,
      lastStartedAt: runRes.data.started_at,
      lastCompletedAt: runRes.data.completed_at,
      processedCount: runRes.data.processed_count,
      generatedAlerts: runRes.data.generated_alerts,
      generatedNotifications: runRes.data.generated_notifications,
      errorSummary: runRes.data.error_summary,
    } : null,
    documentsByStatus,
    contractsByStatus,
    expiringSoon,
    recentDocuments,
  };

  return jsonResponse(ok(summary), 200);
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

async function handleDocuments(ctx: AuthContext | null, req: Request) {
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

  // DocumentAccessPolicy: for COMPLIANCE_OFFICER canView() always returns true,
  // so the full list is returned (route guard already restricts to that role).
  const docs = (data as unknown as DocumentRow[]) ?? [];
  const result = docs.map(toDocumentDto);
  return jsonResponse(ok(result, "Documents retrieved"), 200);
}

async function handleContracts(ctx: AuthContext | null, req: Request) {
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

  const result = ((data as unknown as Array<Record<string, unknown> & { id: string }>) ?? []).map(toContractDto);
  return jsonResponse(ok(result, "Contracts retrieved"), 200);
}

async function handleRetentionPolicies(ctx: AuthContext | null) {
  const { data, error } = await db.from("retention_policies").select("*");
  if (error) throw new Error(`retention policies query failed: ${error.message}`);
  const result = ((data as unknown as Array<Record<string, unknown> & { id: string }>) ?? []).map(toPolicyDto);
  return jsonResponse(ok(result, "Retention policies retrieved"), 200);
}

async function handleAuditLogs(ctx: AuthContext | null) {
  const { data, error } = await db
    .from("audit_logs")
    .select("*")
    .gte("created_at", naiveIso(new Date(Date.now() - 30 * 86400000)))
    .order("created_at", { ascending: false });
  if (error) throw new Error(`audit logs query failed: ${error.message}`);
  const result = ((data as unknown as Array<Record<string, unknown> & { id: string }>) ?? []).map(toAuditDto);
  return jsonResponse(ok(result, "Audit logs retrieved"), 200);
}

// ---------------------------------------------------------------------------
// Document management (write)
// ---------------------------------------------------------------------------

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
    .eq("id", p.id)
    .select("*")
    .single();
  if (error) throw new Error(`document approve failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "APPROVE_DOCUMENT", MODULE, "Document", p.id,
    `Approved document: ${doc.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toDocumentDto(saved as unknown as DocumentRow), "Document approved"), 200);
}

async function handleArchiveDocument(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const doc = await loadDocument(p.id);
  if (!doc) return resourceNotFound("Document", p.id);
  if (doc.status === "ARCHIVED" || doc.status === "DELETED") {
    return businessRule("Document is already archived or disposed.");
  }

  const now = naiveIso();
  const { data: saved, error } = await db.from("documents")
    .update({ status: "ARCHIVED", updated_at: now, updated_by: ctx ? ctx.email : "SYSTEM" })
    .eq("id", p.id)
    .select("*")
    .single();
  if (error) throw new Error(`document archive failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "ARCHIVE_DOCUMENT", MODULE, "Document", p.id,
    `Archived document: ${doc.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toDocumentDto(saved as unknown as DocumentRow), "Document archived"), 200);
}

async function handleRequestDisposal(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const b = (body ?? {}) as Record<string, unknown>;
  const reason = str(b.reason);

  const doc = await loadDocument(p.id);
  if (!doc) return resourceNotFound("Document", p.id);
  if (doc.retention_status !== "ELIGIBLE_FOR_DISPOSAL") {
    return businessRule("The document is not eligible for disposition under its assigned retention policy.");
  }
  const hold = await db.from("document_legal_holds").select("id")
    .eq("document_id", p.id).eq("status", "ACTIVE").maybeSingle();
  if (hold.error) throw new Error(`legal hold check failed: ${hold.error.message}`);
  if (hold.data) return businessRule("An active legal hold blocks disposal.");

  const policy = doc.retention_policy_id
    ? await db.from("retention_policies").select("name, action_on_expiry").eq("id", String(doc.retention_policy_id)).maybeSingle()
    : { data: null, error: null };
  if (policy.error) throw new Error(`retention policy lookup failed: ${policy.error.message}`);
  if (!policy.data) return businessRule("A valid assigned retention policy is required before disposal.");

  const pendingRes = await db.from("disposal_requests")
    .select("id").eq("document_id", p.id).eq("status", "PENDING");
  if (pendingRes.error) throw new Error(`pending disposal check failed: ${pendingRes.error.message}`);
  if ((pendingRes.data ?? []).length > 0) {
    return businessRule("A disposal request is already pending for this document.");
  }

  const now = naiveIso();
  const { data: saved, error } = await db.from("disposal_requests").insert({
    document_id: p.id,
    document_title: doc.title,
    reason,
    status: "PENDING",
    retention_policy_name: policy.data.name,
    policy_action: policy.data.action_on_expiry,
    physical_disposition_status: policy.data.action_on_expiry === "PERMANENT_DELETE" ? "PENDING" : "RETAINED",
    created_at: now,
    updated_at: now,
    created_by: ctx ? ctx.email : "SYSTEM",
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).select("*").single();
  if (error) throw new Error(`disposal request insert failed: ${error.message}`);
  const disposalId = (saved as unknown as { id: string }).id;
  const alert = await db.rpc("phase4_emit_alert", {
    p_dedup_key: `DISPOSAL_PENDING:${disposalId}`,
    p_type: "DISPOSAL_PENDING", p_severity: "WARNING",
    p_title: "Disposal review required",
    p_message: "An eligible retained record has an authorized disposal request awaiting decision.",
    p_entity_type: "DisposalRequest", p_entity_id: disposalId,
    p_deadline: null, p_window: null, p_roles: ["COMPLIANCE_OFFICER"],
  });
  if (alert.error) throw new Error(`disposal alert generation failed: ${alert.error.message}`);

  await writeAudit(ctx?.user ?? null, "REQUEST_DISPOSAL", MODULE, "DisposalRequest",
    disposalId, `Requested disposal of document: ${doc.title}`,
    ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toDisposalDto(saved as unknown as Record<string, unknown> & { id: string }),
    "Disposal requested"), 200);
}

// ---------------------------------------------------------------------------
// Retention schedule management (write)
// ---------------------------------------------------------------------------

async function handleCreateRetentionPolicy(ctx: AuthContext | null, req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = str(b.name)?.trim();
  if (!name || name === "") {
    return businessRule("Policy name is required.");
  }

  const dup = await db.from("retention_policies").select("id").eq("name", name).maybeSingle();
  if (dup.error) throw new Error(`retention policy name check failed: ${dup.error.message}`);
  if (dup.data) {
    return businessRule("A retention policy with that name already exists.");
  }

  let action: string;
  let triggerBasis: string;
  let alertWindowsDays: number[];
  try {
    action = parseAction(b.actionOnExpiry);
    triggerBasis = parseTriggerBasis(b.triggerBasis);
    alertWindowsDays = parseAlertWindows(b.alertWindowsDays);
  } catch (e) {
    return businessRule((e as Error).message);
  }

  const now = naiveIso();
  const { data: saved, error } = await db.from("retention_policies").insert({
    name,
    description: str(b.description),
    retention_period_days: intVal(b.retentionPeriodDays, 365),
    action_on_expiry: action,
    classification_name: str(b.classificationName)?.trim() || null,
    applicable_department: str(b.applicableDepartment)?.trim() || null,
    trigger_basis: triggerBasis,
    alert_windows_days: alertWindowsDays,
    effective_from: dateStr(str(b.effectiveFrom)) ?? new Date().toISOString().slice(0, 10),
    effective_to: dateStr(str(b.effectiveTo)),
    active: b.active == null ? true : Boolean(b.active),
    created_at: now,
    updated_at: now,
    created_by: ctx ? ctx.email : "SYSTEM",
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).select("*").single();
  if (error) throw new Error(`retention policy insert failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "CREATE_RETENTION_POLICY", MODULE, "RetentionPolicy",
    (saved as unknown as { id: string }).id, `Created retention policy: ${name}`,
    ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toPolicyDto(saved as unknown as Record<string, unknown> & { id: string }),
    "Retention policy created"), 200);
}

async function handleUpdateRetentionPolicy(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const b = (body ?? {}) as Record<string, unknown>;

  const existing = await db.from("retention_policies").select("*").eq("id", p.id).maybeSingle();
  if (existing.error) throw new Error(`retention policy lookup failed: ${existing.error.message}`);
  if (!existing.data) return resourceNotFound("RetentionPolicy", p.id);
  const policy = existing.data as Record<string, unknown> & { id: string };

  const patch: Record<string, unknown> = { updated_at: naiveIso(), updated_by: ctx ? ctx.email : "SYSTEM" };
  if ("name" in b && str(b.name) != null) patch["name"] = str(b.name);
  if ("description" in b) patch["description"] = str(b.description);
  if ("retentionPeriodDays" in b) patch["retention_period_days"] = intVal(b.retentionPeriodDays, intVal(policy.retention_period_days, 365));
  if ("actionOnExpiry" in b) {
    try {
      patch["action_on_expiry"] = parseAction(b.actionOnExpiry);
    } catch (e) {
      return businessRule((e as Error).message);
    }
  }
  if ("classificationName" in b) patch["classification_name"] = str(b.classificationName)?.trim() || null;
  if ("applicableDepartment" in b) patch["applicable_department"] = str(b.applicableDepartment)?.trim() || null;
  if ("triggerBasis" in b) {
    try { patch["trigger_basis"] = parseTriggerBasis(b.triggerBasis); }
    catch (e) { return businessRule((e as Error).message); }
  }
  if ("alertWindowsDays" in b) {
    try { patch["alert_windows_days"] = parseAlertWindows(b.alertWindowsDays); }
    catch (e) { return businessRule((e as Error).message); }
  }
  if ("effectiveFrom" in b) patch["effective_from"] = dateStr(str(b.effectiveFrom));
  if ("effectiveTo" in b) patch["effective_to"] = dateStr(str(b.effectiveTo));
  if ("active" in b) patch["active"] = Boolean(b.active);

  const { data: saved, error } = await db.from("retention_policies").update(patch)
    .eq("id", p.id).select("*").single();
  if (error) throw new Error(`retention policy update failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "UPDATE_RETENTION_POLICY", MODULE, "RetentionPolicy", p.id,
    `Updated retention policy: ${saved.name}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toPolicyDto(saved as unknown as Record<string, unknown> & { id: string }),
    "Retention policy updated"), 200);
}

async function handleToggleRetentionPolicy(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const existing = await db.from("retention_policies").select("*").eq("id", p.id).maybeSingle();
  if (existing.error) throw new Error(`retention policy lookup failed: ${existing.error.message}`);
  if (!existing.data) return resourceNotFound("RetentionPolicy", p.id);
  const policy = existing.data as Record<string, unknown> & { id: string };

  const nextActive = !Boolean(policy.active);
  const { data: saved, error } = await db.from("retention_policies")
    .update({ active: nextActive, updated_at: naiveIso(), updated_by: ctx ? ctx.email : "SYSTEM" })
    .eq("id", p.id).select("*").single();
  if (error) throw new Error(`retention policy toggle failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "TOGGLE_RETENTION_POLICY", MODULE, "RetentionPolicy", p.id,
    `Set retention policy '${saved.name}' active=${saved.active}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toPolicyDto(saved as unknown as Record<string, unknown> & { id: string }),
    "Retention policy updated"), 200);
}

// ---------------------------------------------------------------------------
// Disposal approvals
// ---------------------------------------------------------------------------

async function handleDisposals(ctx: AuthContext | null, req: Request) {
  const url = new URL(req.url);
  const rawStatus = url.searchParams.get("status");
  if (rawStatus != null && !DISPOSAL_STATUSES.includes(rawStatus)) return generic500();
  const statusFilter = rawStatus != null ? rawStatus : null;

  let query = db.from("disposal_requests").select("*");
  if (statusFilter != null) query = query.eq("status", statusFilter);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`disposals query failed: ${error.message}`);

  const result = ((data as unknown as Array<Record<string, unknown> & { id: string }>) ?? []).map(toDisposalDto);
  return jsonResponse(ok(result, "Disposal requests retrieved"), 200);
}

async function handleDecideDisposal(
  ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams, approve: boolean,
) {
  if (!isUuid(p.id)) return generic500();
  const b = (body ?? {}) as Record<string, unknown>;
  const notes = str(b.notes);

  const existing = await loadDisposal(p.id);
  if (!existing) return resourceNotFound("DisposalRequest", p.id);
  const reqRow = existing as Record<string, unknown> & { id: string };
  if (reqRow.status !== "PENDING") {
    return businessRule("This disposal request has already been decided.");
  }

  const doc = await loadDocument(String(reqRow.document_id));
  if (approve && !doc) return resourceNotFound("Document", String(reqRow.document_id));
  if (approve && doc) {
    const hold = await db.from("document_legal_holds").select("id")
      .eq("document_id", doc.id).eq("status", "ACTIVE").maybeSingle();
    if (hold.error) throw new Error(`legal hold check failed: ${hold.error.message}`);
    if (hold.data) return businessRule("An active legal hold blocks disposal approval.");
    if (doc.retention_status !== "ELIGIBLE_FOR_DISPOSAL") {
      return businessRule("The document is no longer eligible for disposal.");
    }
  }

  const now = naiveIso();
  let physicalStatus = str(reqRow.physical_disposition_status) ?? "NOT_REQUESTED";
  if (approve && doc && reqRow.policy_action === "PERMANENT_DELETE") {
    const filePath = str(doc.file_path)?.trim() ?? "";
    if (filePath && !isValidStorageObjectPath(filePath)) {
      return businessRule("The document has an invalid private Storage object path.");
    }
    if (filePath) {
      const removal = await db.storage.from(BUCKET).remove([filePath]);
      if (removal.error && !isMissingStorageObjectError(removal.error)) {
        await db.from("disposal_requests").update({
          physical_disposition_status: "FAILED", updated_at: now, updated_by: ctx?.email ?? "SYSTEM",
        }).eq("id", p.id);
        return jsonResponse(fail("Private Storage deletion failed; disposal was not marked complete.", "STORAGE_DISPOSAL_FAILED"), 503);
      }
      const verification = await db.storage.from(BUCKET).download(filePath);
      if (!verification.error || !isMissingStorageObjectError(verification.error)) {
        await db.from("disposal_requests").update({
          physical_disposition_status: "FAILED", updated_at: now, updated_by: ctx?.email ?? "SYSTEM",
        }).eq("id", p.id);
        return jsonResponse(fail("Private Storage deletion could not be verified; disposal was not marked complete.", "STORAGE_DISPOSAL_FAILED"), 503);
      }
    }
    physicalStatus = "DELETED";
  } else if (approve) {
    physicalStatus = "RETAINED";
  }
  const { data: saved, error } = await db.from("disposal_requests").update({
    status: approve ? "APPROVED" : "REJECTED",
    decision_notes: notes,
    decided_by: ctx ? ctx.email : null,
    decided_at: now,
    updated_at: now,
    updated_by: ctx ? ctx.email : "SYSTEM",
    physical_disposition_status: physicalStatus,
    physical_disposed_at: approve && physicalStatus === "DELETED" ? new Date().toISOString() : null,
    completed_at: approve ? new Date().toISOString() : null,
  }).eq("id", p.id).select("*").single();
  if (error) throw new Error(`disposal decision failed: ${error.message}`);

  if (approve && doc) {
      const delNow = naiveIso();
      const permanentDelete = reqRow.policy_action === "PERMANENT_DELETE";
      const docUpdate = await db.from("documents").update({
        status: permanentDelete ? "DELETED" : "ARCHIVED",
        is_deleted: permanentDelete,
        deleted_at: permanentDelete ? delNow : null,
        deleted_by: permanentDelete ? (ctx ? ctx.email : "system") : null,
        retention_status: "DISPOSED",
        disposition_at: new Date().toISOString(),
        disposition_by: ctx ? ctx.email : "SYSTEM",
        physical_disposition_status: physicalStatus,
        physical_disposed_at: physicalStatus === "DELETED" ? new Date().toISOString() : null,
        updated_at: delNow,
        updated_by: ctx ? ctx.email : "SYSTEM",
      }).eq("id", doc.id);
      if (docUpdate.error) throw new Error(`document disposition failed: ${docUpdate.error.message}`);
  }

  // Close the linked "disposal pending" alert regardless of decision.
  const alertRes = await db.from("compliance_alerts")
    .select("id").eq("dedup_key", `DISPOSAL_PENDING:${p.id}`).maybeSingle();
  if (!alertRes.error && alertRes.data) {
    await db.from("compliance_alerts")
      .update({ status: "DISMISSED", updated_at: naiveIso(), updated_by: ctx ? ctx.email : "SYSTEM" })
      .eq("id", (alertRes.data as { id: string }).id);
  }

  await writeAudit(ctx?.user ?? null, approve ? "APPROVE_DISPOSAL" : "REJECT_DISPOSAL", MODULE,
    "DisposalRequest", p.id, `${approve ? "Approved" : "Rejected"} disposal of: ${reqRow.document_title}`,
    ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(
    ok(toDisposalDto(saved as unknown as Record<string, unknown> & { id: string }),
      approve ? "Disposal approved" : "Disposal rejected"),
    200,
  );
}

// ---------------------------------------------------------------------------
// Legal holds and automation health
// ---------------------------------------------------------------------------

async function handleListLegalHolds() {
  const { data, error } = await db.from("document_legal_holds").select("*")
    .order("started_at", { ascending: false });
  if (error) throw new Error(`legal holds query failed: ${error.message}`);
  return jsonResponse(ok(data ?? [], "Legal holds retrieved"), 200);
}

async function handlePlaceLegalHold(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const doc = await loadDocument(p.id);
  if (!doc) return resourceNotFound("Document", p.id);
  const reason = str((body as Record<string, unknown> | null)?.reason)?.trim() ?? "";
  if (!reason) return businessRule("A legal hold reason is required.");
  const existing = await db.from("document_legal_holds").select("id")
    .eq("document_id", p.id).eq("status", "ACTIVE").maybeSingle();
  if (existing.error) throw new Error(`legal hold check failed: ${existing.error.message}`);
  if (existing.data) return businessRule("The document already has an active legal hold.");

  const { data: hold, error } = await db.from("document_legal_holds").insert({
    document_id: p.id, reason, status: "ACTIVE", issued_by: ctx?.userId,
    issued_by_email: ctx?.email, started_at: new Date().toISOString(),
  }).select("*").single();
  if (error) throw new Error(`legal hold creation failed: ${error.message}`);
  const update = await db.from("documents").update({
    retention_status: "LEGAL_HOLD", updated_at: naiveIso(), updated_by: ctx?.email,
  }).eq("id", p.id);
  if (update.error) throw new Error(`document legal hold update failed: ${update.error.message}`);
  const alert = await db.rpc("phase4_emit_alert", {
    p_dedup_key: `LEGAL_HOLD_PLACED:${hold.id}`, p_type: "LEGAL_HOLD_PLACED", p_severity: "WARNING",
    p_title: "Legal hold placed", p_message: "A retained record is protected from disposal by an active legal hold.",
    p_entity_type: "Document", p_entity_id: p.id, p_deadline: null, p_window: null,
    p_roles: ["COMPLIANCE_OFFICER", "LEGAL_OFFICER", "LEGAL_COUNSEL"],
  });
  if (alert.error) throw new Error(`legal hold alert failed: ${alert.error.message}`);
  await writeAudit(ctx?.user ?? null, "PLACE_LEGAL_HOLD", MODULE, "DocumentLegalHold", hold.id,
    `Placed legal hold on document ${p.id}`, ctx ? resolveClientIp(req).ip : null, "WARNING");
  return jsonResponse(ok(hold, "Legal hold placed"), 200);
}

async function handleReleaseLegalHold(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const reason = str((body as Record<string, unknown> | null)?.reason)?.trim() || null;
  const existing = await db.from("document_legal_holds").select("*")
    .eq("document_id", p.id).eq("status", "ACTIVE").maybeSingle();
  if (existing.error) throw new Error(`legal hold lookup failed: ${existing.error.message}`);
  if (!existing.data) return businessRule("The document does not have an active legal hold.");
  const now = new Date();
  const { data: hold, error } = await db.from("document_legal_holds").update({
    status: "RELEASED", released_at: now.toISOString(), released_by: ctx?.userId,
    released_by_email: ctx?.email, release_reason: reason, updated_at: now.toISOString(),
  }).eq("id", existing.data.id).eq("status", "ACTIVE").select("*").single();
  if (error) throw new Error(`legal hold release failed: ${error.message}`);
  const doc = await loadDocument(p.id);
  const expiry = dateStr(str(doc?.retention_expires_at));
  const philippinesToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const nextStatus = expiry && expiry <= philippinesToday ? "ELIGIBLE_FOR_DISPOSAL" : "SCHEDULED";
  const update = await db.from("documents").update({
    retention_status: nextStatus, updated_at: naiveIso(), updated_by: ctx?.email,
  }).eq("id", p.id);
  if (update.error) throw new Error(`document hold release update failed: ${update.error.message}`);
  const alert = await db.rpc("phase4_emit_alert", {
    p_dedup_key: `LEGAL_HOLD_RELEASED:${hold.id}`, p_type: "LEGAL_HOLD_RELEASED", p_severity: "INFO",
    p_title: "Legal hold released", p_message: "An authorized reviewer released a legal hold; normal retention rules apply again.",
    p_entity_type: "Document", p_entity_id: p.id, p_deadline: expiry, p_window: null,
    p_roles: ["COMPLIANCE_OFFICER", "LEGAL_OFFICER", "LEGAL_COUNSEL"],
  });
  if (alert.error) throw new Error(`legal hold release alert failed: ${alert.error.message}`);
  await writeAudit(ctx?.user ?? null, "RELEASE_LEGAL_HOLD", MODULE, "DocumentLegalHold", hold.id,
    `Released legal hold on document ${p.id}`, ctx ? resolveClientIp(req).ip : null, "WARNING");
  return jsonResponse(ok(hold, "Legal hold released"), 200);
}

async function handleAutomationHealth() {
  const { data, error } = await db.from("lifecycle_automation_runs").select("*")
    .order("started_at", { ascending: false }).limit(20);
  if (error) throw new Error(`automation health query failed: ${error.message}`);
  return jsonResponse(ok(data ?? [], "Automation health retrieved"), 200);
}

// ---------------------------------------------------------------------------
// Compliance alerts
// ---------------------------------------------------------------------------

async function handleAlerts(ctx: AuthContext | null) {
  const { data, error } = await db.from("compliance_alerts").select("*")
    .in("status", ["OPEN", "ACKNOWLEDGED"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`alerts query failed: ${error.message}`);
  const result = ((data as unknown as Array<Record<string, unknown> & { id: string }>) ?? []).map(toAlertDto);
  return jsonResponse(ok(result, "Alerts retrieved"), 200);
}

async function handleAcknowledgeAlert(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const alert = await loadAlert(p.id);
  if (!alert) return resourceNotFound("ComplianceAlert", p.id);
  const a = alert as Record<string, unknown> & { id: string };

  const now = naiveIso();
  const { data: saved, error } = await db.from("compliance_alerts").update({
    status: "ACKNOWLEDGED",
    acknowledged_by: ctx ? ctx.email : null,
    acknowledged_at: now,
    updated_at: now,
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).eq("id", p.id).select("*").single();
  if (error) throw new Error(`alert acknowledge failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "ACKNOWLEDGE_ALERT", MODULE, "ComplianceAlert", p.id,
    `Acknowledged alert: ${a.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toAlertDto(saved as unknown as Record<string, unknown> & { id: string }),
    "Alert acknowledged"), 200);
}

async function handleDismissAlert(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const alert = await loadAlert(p.id);
  if (!alert) return resourceNotFound("ComplianceAlert", p.id);
  const a = alert as Record<string, unknown> & { id: string };

  const now = naiveIso();
  const { data: saved, error } = await db.from("compliance_alerts").update({
    status: "DISMISSED",
    updated_at: now,
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).eq("id", p.id).select("*").single();
  if (error) throw new Error(`alert dismiss failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "DISMISS_ALERT", MODULE, "ComplianceAlert", p.id,
    `Dismissed alert: ${a.title}`, ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(ok(toAlertDto(saved as unknown as Record<string, unknown> & { id: string }),
    "Alert dismissed"), 200);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes = [
  { method: "GET", path: "/compliance/dashboard/summary", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleDashboard },
  { method: "GET", path: "/compliance/documents", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleDocuments },
  { method: "GET", path: "/compliance/contracts", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleContracts },
  { method: "GET", path: "/compliance/retention-policies", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleRetentionPolicies },
  { method: "GET", path: "/compliance/audit-logs", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleAuditLogs },
  { method: "POST", path: "/compliance/documents/:id/approve", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleApproveDocument },
  { method: "POST", path: "/compliance/documents/:id/archive", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleArchiveDocument },
  { method: "POST", path: "/compliance/documents/:id/disposal", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleRequestDisposal },
  { method: "POST", path: "/compliance/retention-policies", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleCreateRetentionPolicy },
  { method: "PUT", path: "/compliance/retention-policies/:id", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleUpdateRetentionPolicy },
  { method: "POST", path: "/compliance/retention-policies/:id/toggle", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleToggleRetentionPolicy },
  { method: "GET", path: "/compliance/disposals", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleDisposals },
  { method: "POST", path: "/compliance/disposals/:id/approve", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: (ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) => handleDecideDisposal(ctx, req, body, p, true) },
  { method: "POST", path: "/compliance/disposals/:id/reject", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: (ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) => handleDecideDisposal(ctx, req, body, p, false) },
  { method: "GET", path: "/compliance/legal-holds", guard: { kind: "roles", roles: HOLD_ROLES }, handler: handleListLegalHolds },
  { method: "POST", path: "/compliance/documents/:id/legal-hold", guard: { kind: "roles", roles: HOLD_ROLES }, handler: handlePlaceLegalHold },
  { method: "POST", path: "/compliance/documents/:id/legal-hold/release", guard: { kind: "roles", roles: HOLD_ROLES }, handler: handleReleaseLegalHold },
  { method: "GET", path: "/compliance/automation-health", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleAutomationHealth },
  { method: "GET", path: "/compliance/alerts", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleAlerts },
  { method: "POST", path: "/compliance/alerts/:id/acknowledge", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleAcknowledgeAlert },
  { method: "POST", path: "/compliance/alerts/:id/dismiss", guard: { kind: "roles", roles: COMPLIANCE_ROLES }, handler: handleDismissAlert },
] as const;

Deno.serve(createHandler(routes as never, { name: "compliance" }));
