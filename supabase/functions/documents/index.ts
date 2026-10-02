import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse, corsHeaders } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import { naiveIso } from "../_shared/auth-users.ts";
import { writeAudit } from "../_shared/lockout.ts";
import { resolveClientIp } from "../_shared/ip.ts";
import {
  DocumentExtractionError,
  extractDocumentContent,
  validateDocumentUpload,
  MAX_EXTRACTABLE_FILE_BYTES,
  SUPPORTED_DOCUMENT_EXTENSIONS,
} from "../_shared/document-content.ts";
import {
  classifyDocumentContent,
  DocumentAiError,
  getDocumentBusinessCategories,
} from "../_shared/document-ai.ts";
import {
  detectDocumentDuplicates,
  DOCUMENT_DUPLICATE_DETECTOR_VERSION,
  extractDuplicateMetadata,
  fileSha256,
  normalizeIdentifier,
  normalizeOcrText,
  normalizedOcrSha256,
  type DuplicateCandidate,
  type DuplicateDetectionResult,
} from "../_shared/document-duplicates.ts";
import { AiCircuitOpenError, circuitRetryHeaders } from "../_shared/ai-circuit-breaker.ts";
import {
  accessRequestApproverRole,
  canApproveDocumentAccess,
  canDownloadDocumentContent,
  canKnowDocument,
  canManageArchive,
  canViewDocumentContent,
  documentAccessFlags,
  normalizeDocumentClassification,
  type DocumentAccessContext,
} from "../_shared/document-access.ts";

const db = adminDb();

const MODULE = "DOCUMENTS";
const BUCKET = "documents";
const MAX_FILE_SIZE_BYTES = MAX_EXTRACTABLE_FILE_BYTES;
const MAX_AUTO_TAGS = 3;

const DOCUMENT_STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "ARCHIVED", "DELETED"];
const CLASSIFICATION_LEVELS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED", "SECRET"];
const ALLOWED_EXTENSIONS = [...SUPPORTED_DOCUMENT_EXTENSIONS];

const REVIEW_ROLES = [
  "RECORDS_OFFICER", "DEPARTMENT_HEAD", "COMPLIANCE_MANAGER", "COMPLIANCE_OFFICER",
  "DATA_PROTECTION_OFFICER", "LEGAL_COUNSEL", "LEGAL_OFFICER", "CONTRACT_OFFICER",
  "SECURITY_OFFICER", "INFOSEC_OFFICER",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Interprets a naive LocalDateTime as UTC (matches Spring's naive persistence). */
function toUtcIso(s: string): string {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s).toISOString();
  const naive = s.includes("T") ? s : `${s}T00:00:00`;
  return naive + "Z";
}

/** timestamptz columns are emitted by Spring as naive UTC (no Z). */
function createdAtUtc(v: unknown): string | null {
  if (!v) return null;
  return toUtcIso(String(v)).replace("Z", "");
}

/** timestamp-without-timezone columns: naive, space-separated from PostgREST. */
function naiveStr(v: unknown): string | null {
  if (!v) return null;
  return String(v).replace("Z", "").replace("+00", "").replace(" ", "T").slice(0, 23);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function str(o: unknown): string | null {
  return o === null || o === undefined ? null : String(o);
}

function isUuid(s: string | undefined): s is string {
  return s != null && UUID_RE.test(s);
}

function generic500() {
  return jsonResponse(
    fail("An unexpected error occurred. Please contact system administrator.", "INTERNAL_SERVER_ERROR"),
    500,
  );
}

function extensionOf(fileName: string | null): string {
  if (fileName == null || fileName === "") return "";
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

function isSupportedDocumentExtension(
  extension: string,
): extension is (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number] {
  return SUPPORTED_DOCUMENT_EXTENSIONS.some((candidate) => candidate === extension);
}

function resolveTitle(title: string | null, originalFilename: string | null): string {
  if (title != null && title.trim() !== "") return title.trim();
  if (originalFilename == null || originalFilename === "") return "Untitled document";
  const dot = originalFilename.lastIndexOf(".");
  return dot > 0 ? originalFilename.substring(0, dot) : originalFilename;
}

function hasRole(roles: string[], role: string): boolean {
  return roles.some((r) => r.toUpperCase() === role);
}

function isOwner(userEmail: string, d: Record<string, unknown>): boolean {
  const ownerEmail = str(d.owner_email);
  if (ownerEmail != null && ownerEmail !== "" && ownerEmail.toLowerCase() === userEmail.toLowerCase()) return true;
  const createdBy = str(d.created_by);
  return createdBy != null && createdBy.toLowerCase() === userEmail.toLowerCase();
}

function accessContext(ctx: AuthContext | null): DocumentAccessContext {
  return {
    email: ctx?.email ?? "",
    departmentId: ctx?.user.row.department_id ?? null,
    departmentName: ctx?.user.row.department ?? null,
    roles: ctx?.roles ?? [],
    permissions: ctx?.permissions ?? [],
  };
}

// ---------------------------------------------------------------------------
// Storage helpers (Supabase Storage mirrors the local-FS store)
// ---------------------------------------------------------------------------

async function ensureBucket() {
  const { data, error } = await db.storage.getBucket(BUCKET);
  if (!data) {
    const { error: createError } = await db.storage.createBucket(BUCKET, { public: false });
    if (createError) throw new Error(`storage bucket create failed: ${createError.message}`);
  }
  return error == null || Number((error as { statusCode?: unknown }).statusCode) === 404 ? true : false;
}

function isValidStorageObjectPath(filePath: string): boolean {
  const path = filePath.trim();
  if (path === "" || path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(path)) {
    return false;
  }
  if (path.includes("\\")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function isMissingStorageObjectError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const value = error as { status?: unknown; statusCode?: unknown; message?: unknown; error?: unknown };
  const status = Number(value.statusCode ?? value.status);
  const message = String(value.message ?? value.error ?? "").toLowerCase();
  return status === 404 || message.includes("object not found") || message.includes("not found");
}

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

function toDocumentDto(d: Record<string, unknown>): Record<string, unknown> {
  const folder = Array.isArray(d.folders) && d.folders.length > 0
    ? (d.folders[0] as Record<string, unknown>)
    : (d.folders != null && typeof d.folders === "object" ? d.folders as Record<string, unknown> : null);
  const category = Array.isArray(d.categories) && d.categories.length > 0
    ? (d.categories[0] as Record<string, unknown>)
    : (d.categories != null && typeof d.categories === "object" ? d.categories as Record<string, unknown> : null);

  return {
    id: str(d.id),
    createdAt: createdAtUtc(d.created_at),
    updatedAt: naiveStr(d.updated_at),
    createdBy: str(d.created_by),
    updatedBy: str(d.updated_by),
    deleted: d.is_deleted === true,
    deletedAt: naiveStr(d.deleted_at),
    deletedBy: str(d.deleted_by),
    title: str(d.title),
    fileName: str(d.file_name),
    fileType: str(d.file_type),
    fileSize: num(d.file_size),
    filePath: str(d.file_path),
    supabaseStorageUrl: str(d.supabase_storage_url),
    ownerEmail: str(d.owner_email),
    department: str(d.department),
    folder: folder != null ? { id: str(folder.id), name: str(folder.name), path: str(folder.path) } : null,
    category: category != null ? { id: str(category.id), name: str(category.name), description: str(category.description) } : null,
    classificationLevel: str(d.classification_level),
    status: str(d.status),
    ocrExtractedText: str(d.ocr_extracted_text),
    aiSummary: str(d.ai_summary),
    aiPredictedCategory: str(d.ai_predicted_category),
    confidenceScore: num(d.confidence_score),
    aiDetectedDocumentType: str(d.ai_detected_document_type),
    aiMetadataSuggestions: d.ai_metadata_suggestions != null && typeof d.ai_metadata_suggestions === "object"
      ? d.ai_metadata_suggestions
      : {},
    aiClassificationReason: str(d.ai_classification_reason),
    aiProviderName: str(d.ai_provider_name),
    aiModel: str(d.ai_model),
    aiProcessedAt: str(d.ai_processed_at),
    aiExtractionMethod: str(d.ai_extraction_method),
    aiReviewRequired: d.ai_review_required === true,
    classificationReviewStatus: str(d.classification_review_status),
    finalClassification: str(d.final_classification),
    classificationReviewedBy: str(d.classification_reviewed_by),
    classificationReviewedAt: str(d.classification_reviewed_at),
    classificationReviewNotes: str(d.classification_review_notes),
    retentionPolicyId: str(d.retention_policy_id),
    retentionPolicyVersion: num(d.retention_policy_version),
    retentionAssignedAt: str(d.retention_assigned_at),
    retentionAssignmentSource: str(d.retention_assignment_source),
    retentionCalculationBasis: str(d.retention_calculation_basis),
    retentionTriggerAt: str(d.retention_trigger_at),
    retentionExpiresAt: str(d.retention_expires_at),
    retentionStatus: str(d.retention_status),
    physicalDispositionStatus: str(d.physical_disposition_status),
    tags: ((d.tags ?? []) as unknown[]).map((t: unknown) => {
      const tag = t as Record<string, unknown>;
      return { id: str(tag.id), name: str(tag.name) };
    }),
    versionNumber: num(d.version_number),
    duplicateCheckStatus: str(d.duplicate_check_status),
    duplicateCheckedAt: str(d.duplicate_checked_at),
  };
}

// ---------------------------------------------------------------------------
// Shared document loading / grants
// ---------------------------------------------------------------------------

async function loadGrants(docIds: string[]): Promise<Map<string, Array<Record<string, unknown>>>> {
  const map = new Map<string, Array<Record<string, unknown>>>();
  if (docIds.length === 0) return map;
  const { data, error } = await db.from("document_grants")
    .select("document_id, grantee_type, grantee_key, access_level, is_deleted")
    .in("document_id", docIds);
  if (error) throw new Error(`document grants query failed: ${error.message}`);
  for (const g of (data as unknown as Record<string, unknown>[]) ?? []) {
    const docId = String(g.document_id ?? "");
    if (!map.has(docId)) map.set(docId, []);
    map.get(docId)!.push(g);
  }
  return map;
}

async function loadTags(docId: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await db.from("document_tags").select("tags(id, name)").eq("document_id", docId);
  if (error) throw new Error(`document tags query failed: ${error.message}`);
  return ((data as unknown as Array<Record<string, unknown>>) ?? [])
    .map((row) => row.tags as Record<string, unknown>)
    .filter((t) => t != null && t.id != null);
}

async function loadTagsForDocs(docIds: string[]): Promise<Map<string, Array<Record<string, unknown>>>> {
  const map = new Map<string, Array<Record<string, unknown>>>();
  if (docIds.length === 0) return map;
  const { data, error } = await db.from("document_tags").select("document_id, tags(id, name)").in("document_id", docIds);
  if (error) throw new Error(`document tags query failed: ${error.message}`);
  for (const row of (data as unknown as Array<Record<string, unknown>>) ?? []) {
    const docId = String(row.document_id ?? "");
    const tag = row.tags as Record<string, unknown> | null;
    if (docId !== "" && tag != null && tag.id != null) {
      if (!map.has(docId)) map.set(docId, []);
      map.get(docId)!.push(tag);
    }
  }
  return map;
}

async function loadRetentionPolicies(policyIds: string[]): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  const ids = [...new Set(policyIds.filter((id) => isUuid(id)))];
  if (ids.length === 0) return map;
  const { data, error } = await db.from("retention_policies")
    .select("id,name,retention_period_days,action_on_expiry,active")
    .in("id", ids);
  if (error) throw new Error(`retention policy lookup failed: ${error.message}`);
  for (const row of (data as unknown as Record<string, unknown>[]) ?? []) map.set(String(row.id), row);
  return map;
}

async function loadActiveLegalHolds(docIds: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  if (docIds.length === 0) return result;
  const { data, error } = await db.from("document_legal_holds")
    .select("document_id")
    .in("document_id", docIds)
    .eq("status", "ACTIVE");
  if (error) throw new Error(`document legal-hold lookup failed: ${error.message}`);
  for (const row of data ?? []) result.add(String(row.document_id));
  return result;
}

function nested(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return value[0] && typeof value[0] === "object" ? value[0] as Record<string, unknown> : null;
  return value != null && typeof value === "object" ? value as Record<string, unknown> : null;
}

function archiveDocumentDto(
  row: Record<string, unknown>,
  flags: ReturnType<typeof documentAccessFlags>,
  policy: Record<string, unknown> | null,
  legalHold: boolean,
  tags: Array<Record<string, unknown>>,
  includeContent = false,
): Record<string, unknown> {
  const department = nested(row.departments);
  const metadata = row.ai_metadata_suggestions != null && typeof row.ai_metadata_suggestions === "object"
    ? row.ai_metadata_suggestions as Record<string, unknown>
    : {};
  const effectiveDate = str(metadata.effectiveDate ?? metadata.effective_date ?? metadata.documentDate ?? metadata.document_date);
  const expirationDate = str(metadata.expirationDate ?? metadata.expiration_date ?? metadata.expiryDate ?? metadata.expiry_date);
  const fileType = str(row.file_type) ?? "";
  const viewerKind = fileType === "application/pdf" ? "PDF"
    : fileType.startsWith("image/") ? "IMAGE"
    : fileType.startsWith("text/") || ["TXT_UTF8", "DOCX_XML"].includes(str(row.ai_extraction_method) ?? "") ? "TEXT"
    : "UNSUPPORTED";
  return {
    id: str(row.id),
    title: str(row.title),
    fileName: str(row.file_name),
    fileType,
    fileSize: num(row.file_size),
    documentType: str(row.ai_detected_document_type),
    documentNumber: str(metadata.documentNumber ?? metadata.document_number ?? metadata.referenceNumber),
    department: department ? { id: str(department.id), name: str(department.name), status: str(department.status) } : {
      id: str(row.department_id), name: str(row.department), status: null,
    },
    ownerEmail: str(row.owner_email ?? row.created_by),
    classification: normalizeDocumentClassification(row.classification_level),
    archiveStatus: str(row.status),
    retentionStatus: legalHold ? "LEGAL_HOLD" : str(row.retention_status),
    retentionPolicy: policy ? {
      id: str(policy.id), name: str(policy.name), periodDays: num(policy.retention_period_days), actionOnExpiry: str(policy.action_on_expiry),
    } : null,
    retentionStartDate: str(row.retention_trigger_at ?? row.retention_assigned_at),
    retentionReviewDate: str(row.retention_expires_at),
    effectiveDate,
    expirationDate,
    version: num(row.version_number),
    uploadedAt: createdAtUtc(row.created_at),
    updatedAt: naiveStr(row.updated_at) ?? createdAtUtc(row.created_at),
    aiClassificationStatus: row.classification_review_status === "APPROVED" || row.classification_review_status === "CORRECTED"
      ? "HUMAN_CONFIRMED" : row.ai_processed_at ? "AI_SUGGESTED" : "UNAVAILABLE",
    ocrStatus: str(row.ocr_extracted_text)?.trim() ? "AVAILABLE" : "UNAVAILABLE",
    viewerKind,
    tags: tags.map((tag) => ({ id: str(tag.id), name: str(tag.name) })),
    access: flags,
    ocrText: includeContent && flags.view && viewerKind === "TEXT" ? str(row.ocr_extracted_text) : undefined,
    aiSummary: includeContent && flags.view && viewerKind === "TEXT" ? str(row.ai_summary) : undefined,
  };
}

async function loadDocumentRow(id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from("documents").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`document query failed: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  const categoryId = str(row.category_id);
  const folderId = str(row.folder_id);
  const [categoryResult, folderResult] = await Promise.all([
    categoryId
      ? db.from("categories").select("id, name, description").eq("id", categoryId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    folderId
      ? db.from("folders").select("id, name, path").eq("id", folderId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (categoryResult.error) throw new Error(`document category query failed: ${categoryResult.error.message}`);
  if (folderResult.error) throw new Error(`document folder query failed: ${folderResult.error.message}`);
  return { ...row, categories: categoryResult.data, folders: folderResult.data };
}

function duplicateCandidateFromRow(row: Record<string, unknown>): DuplicateCandidate {
  return {
    id: String(row.id),
    title: str(row.title),
    fileName: str(row.file_name),
    status: str(row.status),
    ownerEmail: str(row.owner_email),
    department: str(row.department),
    createdAt: str(row.created_at),
    documentLocation: "Authorized document repository",
    classificationLevel: str(row.classification_level),
    versionNumber: num(row.version_number),
    ocrText: str(row.ocr_extracted_text),
    fileSha256: str(row.file_sha256),
    ocrNormalizedSha256: str(row.ocr_normalized_sha256),
    documentNumber: str(row.document_number),
    effectiveDate: str(row.effective_date),
    documentType: str(row.document_type),
  };
}

async function runDuplicateDetection(
  ctx: AuthContext | null,
  source: Record<string, unknown>,
): Promise<DuplicateDetectionResult> {
  const metadata = source.ai_metadata_suggestions != null && typeof source.ai_metadata_suggestions === "object"
    ? source.ai_metadata_suggestions as Record<string, unknown>
    : {};
  const extracted = extractDuplicateMetadata(metadata, str(source.ocr_extracted_text));
  const normalizedText = normalizeOcrText(str(source.ocr_extracted_text) ?? "");
  const { data, error } = await db.rpc("phase10_document_duplicate_candidates", {
    p_user_email: ctx?.email ?? "",
    p_user_department: str(ctx?.user.row.department),
    // Technical administrator roles are deliberately excluded: they do not
    // confer document-content visibility. Any separately assigned business
    // role, ownership, department scope, or explicit grant still applies.
    p_roles: (ctx?.roles ?? [])
      .map((role) => role.toUpperCase())
      .filter((role) => role !== "SUPER_ADMIN" && role !== "SYSTEM_ADMIN"),
    p_source_document_id: String(source.id),
    p_file_sha256: str(source.file_sha256),
    p_ocr_normalized_sha256: str(source.ocr_normalized_sha256),
    p_ocr_normalized_text: normalizedText || null,
    p_document_number: normalizeIdentifier(extracted.documentNumber),
    p_title: str(source.title),
    p_document_type: str(source.ai_detected_document_type),
    p_limit: 25,
  });
  if (error) throw new Error(`authorized duplicate candidate query failed: ${error.message}`);
  const result = detectDocumentDuplicates({
    fileSha256: str(source.file_sha256),
    ocrNormalizedSha256: str(source.ocr_normalized_sha256),
    ocrText: str(source.ocr_extracted_text),
    title: str(source.title),
    documentNumber: extracted.documentNumber,
    documentType: str(source.ai_detected_document_type),
    classificationLevel: str(source.classification_level),
    effectiveDate: extracted.effectiveDate,
    versionNumber: extracted.versionNumber ?? num(source.version_number),
  }, ((data as unknown as Record<string, unknown>[]) ?? []).map(duplicateCandidateFromRow));

  if (result.matches.length > 0) {
    const { error: matchError } = await db.from("document_duplicate_matches").upsert(
      result.matches.map((match) => ({
        source_document_id: String(source.id),
        matched_document_id: match.documentId,
        match_type: match.matchType,
        confidence: match.confidence,
        ocr_similarity: match.textSimilarityPercent == null ? null : match.textSimilarityPercent / 100,
        reasons: match.reasons,
        detector_version: DOCUMENT_DUPLICATE_DETECTOR_VERSION,
        detected_at: result.checkedAt,
      })),
      { onConflict: "source_document_id,matched_document_id" },
    );
    if (matchError) throw new Error(`duplicate match persistence failed: ${matchError.message}`);
  }
  const { error: statusError } = await db.from("documents").update({
    duplicate_check_status: result.matches.length > 0 ? "REVIEW_REQUIRED" : "NO_DUPLICATE",
    duplicate_checked_at: result.checkedAt,
  }).eq("id", String(source.id));
  if (statusError) throw new Error(`duplicate check status update failed: ${statusError.message}`);
  return result;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleListDocuments(ctx: AuthContext | null) {
  const { data, error } = await db.from("documents")
    .select("*, categories(name), folders(name, path)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`documents query failed: ${error.message}`);
  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  const ids = rows.map((r) => String(r.id ?? ""));
  const grants = await loadGrants(ids);
  const tagsByDoc = await loadTagsForDocs(ids);
  const viewer = accessContext(ctx);
  const visible = rows.filter((d) => canViewDocumentContent(viewer, d, grants.get(String(d.id ?? "")) ?? []));
  return jsonResponse(ok(visible.map((d) => toDocumentDto({ ...d, tags: tagsByDoc.get(String(d.id ?? "")) ?? [] })), "Documents retrieved"), 200);
}

async function handleSearchDocuments(ctx: AuthContext | null, req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("query");
  if (query == null) {
    return jsonResponse(
      fail("Required request parameter 'query' for method parameter type String is not present", "BAD_REQUEST"),
      400,
    );
  }
  const { data, error } = await db.from("documents").select("*, categories(name), folders(name, path)")
    .or(`title.ilike.%${query}%,ocr_extracted_text.ilike.%${query}%,ai_summary.ilike.%${query}%`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`documents search failed: ${error.message}`);
  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  const ids = rows.map((r) => String(r.id ?? ""));
  const grants = await loadGrants(ids);
  const tagsByDoc = await loadTagsForDocs(ids);
  const viewer = accessContext(ctx);
  const visible = rows.filter((d) => canViewDocumentContent(viewer, d, grants.get(String(d.id ?? "")) ?? []));
  return jsonResponse(ok(visible.map((d) => toDocumentDto({ ...d, tags: tagsByDoc.get(String(d.id ?? "")) ?? [] })), "Search results retrieved"), 200);
}

async function loadArchiveRows(): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let offset = 0;; offset += pageSize) {
    const { data, error } = await db.from("documents")
      .select("*, departments(id,name,status), categories(name), folders(name,path)")
      .eq("is_deleted", false)
      .neq("status", "DELETED")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`enterprise archive query failed: ${error.message}`);
    const page = (data as unknown as Record<string, unknown>[]) ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function archiveDependencies(rows: Record<string, unknown>[]) {
  const documentIds = rows.map((row) => String(row.id));
  const policyIds = rows.map((row) => str(row.retention_policy_id) ?? "");
  const [grants, tags, policies, legalHolds] = await Promise.all([
    loadGrants(documentIds),
    loadTagsForDocs(documentIds),
    loadRetentionPolicies(policyIds),
    loadActiveLegalHolds(documentIds),
  ]);
  return { grants, tags, policies, legalHolds };
}

async function handleArchiveDepartments(ctx: AuthContext | null) {
  const [rows, departmentsResult] = await Promise.all([
    loadArchiveRows(),
    db.from("departments").select("id,name,status,updated_at").eq("is_deleted", false).eq("status", "ACTIVE").order("name"),
  ]);
  if (departmentsResult.error) throw new Error(`department catalog query failed: ${departmentsResult.error.message}`);
  const { grants } = await archiveDependencies(rows);
  const viewer = accessContext(ctx);
  const authorized = rows.filter((row) => canKnowDocument(viewer, row, grants.get(String(row.id)) ?? []));
  const byDepartment = new Map<string, Record<string, unknown>[] >();
  for (const row of authorized) {
    const departmentId = str(row.department_id);
    if (!departmentId) continue;
    if (!byDepartment.has(departmentId)) byDepartment.set(departmentId, []);
    byDepartment.get(departmentId)!.push(row);
  }
  const isRecordsOfficer = hasRole(viewer.roles, "RECORDS_OFFICER")
    && viewer.permissions.some((permission) => permission.toUpperCase() === "DOCUMENT_VIEW_METADATA");
  const departments = ((departmentsResult.data as unknown as Record<string, unknown>[]) ?? [])
    .filter((department) => isRecordsOfficer
      || str(department.id) === str(viewer.departmentId)
      || byDepartment.has(String(department.id)))
    .map((department) => {
      const documents = byDepartment.get(String(department.id)) ?? [];
      const restricted = documents.filter((document) => ["RESTRICTED", "HIGHLY_RESTRICTED"]
        .includes(normalizeDocumentClassification(document.classification_level))).length;
      const updated = documents.map((document) => str(document.updated_at ?? document.created_at)).filter(Boolean).sort().at(-1) ?? str(department.updated_at);
      return {
        id: str(department.id),
        name: str(department.name),
        status: str(department.status),
        authorizedDocumentCount: documents.length,
        activeDocumentCount: documents.filter((document) => String(document.status).toUpperCase() !== "ARCHIVED").length,
        archivedDocumentCount: documents.filter((document) => String(document.status).toUpperCase() === "ARCHIVED").length,
        restrictedDocumentCount: restricted,
        lastUpdatedAt: updated,
      };
    });
  return jsonResponse(ok(departments, "Authorized archive departments retrieved"), 200);
}

async function handleArchiveDocuments(ctx: AuthContext | null, req: Request) {
  const url = new URL(req.url);
  const departmentId = url.searchParams.get("departmentId")?.trim() ?? "";
  if (departmentId && !isUuid(departmentId)) return jsonResponse(fail("Invalid department identifier.", "VALIDATION_ERROR"), 400);
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase().slice(0, 200);
  const classification = (url.searchParams.get("classification") ?? "").trim().toUpperCase();
  const archiveStatus = (url.searchParams.get("archiveStatus") ?? "").trim().toUpperCase();
  const documentType = (url.searchParams.get("documentType") ?? "").trim().toLowerCase();
  const retentionStatus = (url.searchParams.get("retentionStatus") ?? "").trim().toUpperCase();
  const owner = (url.searchParams.get("owner") ?? "").trim().toLowerCase();
  const aiStatus = (url.searchParams.get("aiStatus") ?? "").trim().toUpperCase();
  const ocrStatus = (url.searchParams.get("ocrStatus") ?? "").trim().toUpperCase();
  const dateFrom = url.searchParams.get("dateFrom")?.trim() ?? "";
  const dateTo = url.searchParams.get("dateTo")?.trim() ?? "";
  const rows = await loadArchiveRows();
  const dependencies = await archiveDependencies(rows);
  const viewer = accessContext(ctx);
  const filtered = rows.filter((row) => {
    const grants = dependencies.grants.get(String(row.id)) ?? [];
    if (!canKnowDocument(viewer, row, grants)) return false;
    if (departmentId && str(row.department_id) !== departmentId) return false;
    if (classification && normalizeDocumentClassification(row.classification_level) !== classification) return false;
    if (archiveStatus && String(row.status).toUpperCase() !== archiveStatus) return false;
    if (documentType && !String(row.ai_detected_document_type ?? "").toLowerCase().includes(documentType)) return false;
    const effectiveRetention = dependencies.legalHolds.has(String(row.id)) ? "LEGAL_HOLD" : String(row.retention_status ?? "").toUpperCase();
    if (retentionStatus && effectiveRetention !== retentionStatus) return false;
    if (owner && !String(row.owner_email ?? row.created_by ?? "").toLowerCase().includes(owner)) return false;
    const effectiveAiStatus = row.classification_review_status === "APPROVED" || row.classification_review_status === "CORRECTED"
      ? "HUMAN_CONFIRMED" : row.ai_processed_at ? "AI_SUGGESTED" : "UNAVAILABLE";
    if (aiStatus && effectiveAiStatus !== aiStatus) return false;
    const effectiveOcrStatus = str(row.ocr_extracted_text)?.trim() ? "AVAILABLE" : "UNAVAILABLE";
    if (ocrStatus && effectiveOcrStatus !== ocrStatus) return false;
    const createdDate = String(row.created_at ?? "").slice(0, 10);
    if (dateFrom && createdDate < dateFrom) return false;
    if (dateTo && createdDate > dateTo) return false;
    if (search) {
      const metadata = row.ai_metadata_suggestions != null && typeof row.ai_metadata_suggestions === "object"
        ? row.ai_metadata_suggestions as Record<string, unknown> : {};
      const tagText = (dependencies.tags.get(String(row.id)) ?? []).map((tag) => str(tag.name)).join(" ");
      const haystack = [row.title, row.file_name, metadata.documentNumber, metadata.document_number,
        metadata.referenceNumber, row.owner_email, row.department, row.ai_detected_document_type, tagText]
        .map((value) => String(value ?? "").toLowerCase()).join(" ");
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
  const documents = filtered.map((row) => {
    const id = String(row.id);
    const flags = documentAccessFlags(viewer, row, dependencies.grants.get(id) ?? []);
    return archiveDocumentDto(row, flags, dependencies.policies.get(str(row.retention_policy_id) ?? "") ?? null,
      dependencies.legalHolds.has(id), dependencies.tags.get(id) ?? []);
  });
  return jsonResponse(ok({ documents, total: documents.length }, "Authorized archive documents retrieved"), 200);
}

async function loadArchiveDocument(id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from("documents")
    .select("*, departments(id,name,status), categories(name), folders(name,path)")
    .eq("id", id)
    .eq("is_deleted", false)
    .neq("status", "DELETED")
    .maybeSingle();
  if (error) throw new Error(`archive document lookup failed: ${error.message}`);
  return data as unknown as Record<string, unknown> | null;
}

async function handleArchiveDocumentDetail(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return jsonResponse(fail("Invalid document identifier.", "VALIDATION_ERROR"), 400);
  const row = await loadArchiveDocument(p.id);
  if (!row) return jsonResponse(fail("Document not found.", "RESOURCE_NOT_FOUND"), 404);
  const dependencies = await archiveDependencies([row]);
  const grants = dependencies.grants.get(p.id) ?? [];
  const viewer = accessContext(ctx);
  if (!canKnowDocument(viewer, row, grants)) return jsonResponse(fail("Document not found.", "RESOURCE_NOT_FOUND"), 404);
  const flags = documentAccessFlags(viewer, row, grants);
  const document = archiveDocumentDto(row, flags,
    dependencies.policies.get(str(row.retention_policy_id) ?? "") ?? null,
    dependencies.legalHolds.has(p.id), dependencies.tags.get(p.id) ?? [], true);
  if (flags.view && document.viewerKind === "TEXT") {
    await writeAudit(ctx?.user ?? null, "VIEW_DOCUMENT", MODULE, "Document", p.id,
      `Opened text document in secure viewer: ${str(row.title)}`,
      ctx ? resolveClientIp(req).ip : null, "INFO");
  }
  return jsonResponse(ok(document, "Document archive details retrieved"), 200);
}

async function handleArchiveStatus(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams, restore: boolean) {
  if (!isUuid(p.id)) return jsonResponse(fail("Invalid document identifier.", "VALIDATION_ERROR"), 400);
  const row = await loadArchiveDocument(p.id);
  if (!row) return jsonResponse(fail("Document not found.", "RESOURCE_NOT_FOUND"), 404);
  if (!canManageArchive(accessContext(ctx), restore)) {
    return jsonResponse(fail(`${restore ? "Restore" : "Archive"} custody permission is required.`, "ACCESS_DENIED"), 403);
  }
  const current = String(row.status ?? "").toUpperCase();
  if (restore && current !== "ARCHIVED") return jsonResponse(fail("Only archived documents can be restored.", "BUSINESS_RULE_VIOLATION"), 409);
  if (!restore && current === "ARCHIVED") return jsonResponse(fail("The document is already archived.", "BUSINESS_RULE_VIOLATION"), 409);
  if (!restore && current !== "APPROVED") {
    return jsonResponse(fail("Only approved active documents can enter archive custody.", "BUSINESS_RULE_VIOLATION"), 409);
  }
  const previousStatus = String(row.pre_archive_status ?? "").toUpperCase();
  const nextStatus = restore && ["DRAFT", "PENDING_REVIEW", "APPROVED"].includes(previousStatus)
    ? previousStatus : restore ? "APPROVED" : "ARCHIVED";
  const now = naiveIso();
  const { error } = await db.from("documents").update({
    status: nextStatus,
    pre_archive_status: restore ? null : current,
    updated_at: now,
    updated_by: ctx?.email,
  }).eq("id", p.id);
  if (error) throw new Error(`document ${restore ? "restore" : "archive"} failed: ${error.message}`);
  await writeAudit(ctx?.user ?? null, restore ? "RESTORE_DOCUMENT" : "ARCHIVE_DOCUMENT", MODULE, "Document", p.id,
    `${restore ? "Restored" : "Archived"} document '${str(row.title)}'; retained content was not deleted or overwritten`,
    ctx ? resolveClientIp(req).ip : null, "INFO");
  return jsonResponse(ok({ documentId: p.id, status: nextStatus }, restore ? "Document restored" : "Document archived"), 200);
}

async function handleRequestDocumentAccess(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!ctx || !isUuid(p.id)) return jsonResponse(fail("Invalid document identifier.", "VALIDATION_ERROR"), 400);
  const row = await loadArchiveDocument(p.id);
  if (!row) return jsonResponse(fail("Document not found.", "RESOURCE_NOT_FOUND"), 404);
  const grants = (await loadGrants([p.id])).get(p.id) ?? [];
  const viewer = accessContext(ctx);
  if (!canKnowDocument(viewer, row, grants)) return jsonResponse(fail("Document not found.", "RESOURCE_NOT_FOUND"), 404);
  if (canViewDocumentContent(viewer, row, grants)) return jsonResponse(fail("You already have document-content access.", "BUSINESS_RULE_VIOLATION"), 409);
  if (!ctx.permissions.some((permission) => permission.toUpperCase() === "DOCUMENT_REQUEST_ACCESS")) {
    return jsonResponse(fail("You do not have permission to request document access.", "ACCESS_DENIED"), 403);
  }
  const value = (body ?? {}) as Record<string, unknown>;
  const reason = String(value.reason ?? "").trim().slice(0, 1000);
  if (reason.length < 10) return jsonResponse(fail("An access reason of at least 10 characters is required.", "VALIDATION_ERROR"), 400);
  const requested = Array.isArray(value.actions) ? value.actions.map((action) => String(action).toUpperCase()) : ["VIEW"];
  const actions = [...new Set(requested.filter((action) => ["VIEW", "DOWNLOAD", "PRINT", "SHARE"].includes(action)))];
  if (actions.length === 0) return jsonResponse(fail("At least one supported action is required.", "VALIDATION_ERROR"), 400);
  const { data, error } = await db.from("document_access_requests").insert({
    document_id: p.id,
    requester_id: ctx.userId,
    requester_email: ctx.email,
    requester_department_id: ctx.user.row.department_id ?? null,
    requested_actions: actions,
    reason,
    routed_approver_role: accessRequestApproverRole(row),
    status: "PENDING",
  }).select("id,status,routed_approver_role,created_at").single();
  if (error) {
    if (String(error.message ?? "").toLowerCase().includes("duplicate")) {
      return jsonResponse(fail("A pending access request already exists for this document.", "BUSINESS_RULE_VIOLATION"), 409);
    }
    throw new Error(`document access request failed: ${error.message}`);
  }
  await writeAudit(ctx.user, "REQUEST_DOCUMENT_ACCESS", MODULE, "Document", p.id,
    `Requested ${actions.join(",")} access; routed approver role=${String((data as Record<string, unknown>).routed_approver_role)}`,
    resolveClientIp(req).ip, "INFO");
  return jsonResponse(ok(data, "Document access request submitted for human approval"), 201);
}

async function handleListAccessRequests(ctx: AuthContext | null, req: Request) {
  if (!ctx) return jsonResponse(fail("Authentication required.", "UNAUTHORIZED"), 401);
  const scope = new URL(req.url).searchParams.get("scope") === "approvals" ? "approvals" : "mine";
  let query = db.from("document_access_requests").select("*").order("created_at", { ascending: false }).limit(300);
  if (scope === "mine") query = query.eq("requester_id", ctx.userId);
  else query = query.eq("status", "PENDING");
  const { data, error } = await query;
  if (error) throw new Error(`document access requests query failed: ${error.message}`);
  const requests = (data as unknown as Record<string, unknown>[]) ?? [];
  const ids = [...new Set(requests.map((request) => String(request.document_id)))];
  const { data: documentRows, error: documentError } = ids.length
    ? await db.from("documents").select("id,title,department,department_id,classification_level,owning_module,ai_detected_document_type,ai_predicted_category,final_classification,owner_email,created_by,status").in("id", ids).eq("is_deleted", false)
    : { data: [], error: null };
  if (documentError) throw new Error(`access-request document lookup failed: ${documentError.message}`);
  const documents = new Map(((documentRows as unknown as Record<string, unknown>[]) ?? []).map((document) => [String(document.id), document]));
  const result = requests.filter((request) => {
    if (scope === "mine") return true;
    const document = documents.get(String(request.document_id));
    return document ? canApproveDocumentAccess(accessContext(ctx), document) : false;
  }).map((request) => {
    const document = documents.get(String(request.document_id));
    return {
      id: str(request.id), documentId: str(request.document_id), documentTitle: str(document?.title),
      classification: normalizeDocumentClassification(document?.classification_level), department: str(document?.department),
      requesterEmail: str(request.requester_email), requestedActions: request.requested_actions,
      reason: str(request.reason), routedApproverRole: str(request.routed_approver_role), status: str(request.status),
      decisionReason: str(request.decision_reason), createdAt: str(request.created_at), decidedAt: str(request.decided_at),
    };
  });
  return jsonResponse(ok(result, "Authorized document access requests retrieved"), 200);
}

async function handleDecideAccessRequest(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  if (!ctx || !isUuid(p.id)) return jsonResponse(fail("Invalid access request identifier.", "VALIDATION_ERROR"), 400);
  const { data: requestRow, error: requestError } = await db.from("document_access_requests").select("*").eq("id", p.id).maybeSingle();
  if (requestError) throw new Error(`access request lookup failed: ${requestError.message}`);
  if (!requestRow) return jsonResponse(fail("Access request not found.", "RESOURCE_NOT_FOUND"), 404);
  if (requestRow.status !== "PENDING") return jsonResponse(fail("Only pending access requests can be decided.", "BUSINESS_RULE_VIOLATION"), 409);
  const document = await loadArchiveDocument(String(requestRow.document_id));
  if (!document) return jsonResponse(fail("Document not found.", "RESOURCE_NOT_FOUND"), 404);
  if (!canApproveDocumentAccess(accessContext(ctx), document)) {
    return jsonResponse(fail("Access request not found.", "RESOURCE_NOT_FOUND"), 404);
  }
  const value = (body ?? {}) as Record<string, unknown>;
  const decision = String(value.decision ?? "").trim().toUpperCase();
  const reason = String(value.reason ?? "").trim().slice(0, 1000);
  if (!['APPROVE', 'DENY'].includes(decision) || reason.length < 5) {
    return jsonResponse(fail("Decision must be APPROVE or DENY with a reason.", "VALIDATION_ERROR"), 400);
  }
  const status = decision === "APPROVE" ? "APPROVED" : "DENIED";
  const { data: decisionResult, error: decisionError } = await db.rpc("decide_document_access_request", {
    p_request_id: p.id,
    p_decision: decision,
    p_reason: reason,
    p_actor_id: ctx.userId,
    p_actor_email: ctx.email,
  });
  if (decisionError) {
    if (String(decisionError.message ?? "").includes("ACCESS_REQUEST_NOT_PENDING")) {
      return jsonResponse(fail("Only pending access requests can be decided.", "BUSINESS_RULE_VIOLATION"), 409);
    }
    throw new Error(`access request decision failed: ${decisionError.message}`);
  }
  await writeAudit(ctx.user, decision === "APPROVE" ? "APPROVE_DOCUMENT_ACCESS" : "DENY_DOCUMENT_ACCESS",
    MODULE, "Document", String(requestRow.document_id),
    `${status} access request ${p.id}; actions=${((requestRow.requested_actions as string[]) ?? []).join(",")}`,
    resolveClientIp(req).ip, "INFO");
  return jsonResponse(ok(decisionResult, `Document access request ${status.toLowerCase()}`), 200);
}

async function handleCreateDocument(ctx: AuthContext | null, _req: Request, body: unknown) {
  if (!ctx?.permissions.some((permission) => permission.toUpperCase() === "DOCUMENT_UPLOAD")) {
    return jsonResponse(fail("Document upload permission is required.", "ACCESS_DENIED"), 403);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const classificationLevel = str(b.classificationLevel) ?? "INTERNAL";
  if (!CLASSIFICATION_LEVELS.includes(classificationLevel)) {
    return jsonResponse(
      fail(`Classification level must be one of ${CLASSIFICATION_LEVELS.join(", ")}`, "VALIDATION_ERROR"),
      400,
    );
  }
  const status = str(b.status) ?? "DRAFT";
  if (!DOCUMENT_STATUSES.includes(status)) {
    return jsonResponse(
      fail(`Status must be one of ${DOCUMENT_STATUSES.join(", ")}`, "VALIDATION_ERROR"),
      400,
    );
  }

  const userEmail = ctx ? ctx.email : null;
  const userDept = ctx ? str(ctx.user.row.department) : null;
  const fileName = str(b.fileName);

  const categoryId = (b.category as Record<string, unknown> | null | undefined)?.id;
  const folderId = (b.folder as Record<string, unknown> | null | undefined)?.id;
  let resolvedCategoryId: string | null = null;
  if (categoryId && isUuid(String(categoryId))) {
    const { data: cat } = await db.from("categories").select("id").eq("id", String(categoryId)).maybeSingle();
    if (cat) resolvedCategoryId = String(cat.id);
  }
  let resolvedFolderId: string | null = null;
  if (folderId && isUuid(String(folderId))) {
    const { data: fol } = await db.from("folders").select("id").eq("id", String(folderId)).maybeSingle();
    if (fol) resolvedFolderId = String(fol.id);
  }

  const now = naiveIso();
  const { data: saved, error } = await db.from("documents").insert({
    title: str(b.title) ?? "Untitled document",
    file_name: fileName,
    file_type: str(b.fileType),
    file_size: num(b.fileSize),
    file_path: str(b.filePath),
    supabase_storage_url: str(b.supabaseStorageUrl),
    owner_email: userEmail,
    department: userDept,
    department_id: ctx?.user.row.department_id ?? null,
    category_id: resolvedCategoryId,
    folder_id: resolvedFolderId,
    classification_level: classificationLevel,
    status,
    ocr_extracted_text: null,
    ai_summary: null,
    ai_predicted_category: null,
    confidence_score: null,
    classification_review_status: "PENDING",
    version_number: num(b.versionNumber),
    created_by: userEmail,
    updated_by: userEmail,
    updated_at: now,
    is_deleted: false,
  }).select("*").single();
  if (error) throw new Error(`document create failed: ${error.message}`);

  const row = (saved as unknown as Record<string, unknown>) ?? {};
  const docId = String(row.id);

  const bodyTags = Array.isArray(b.tags) ? (b.tags as unknown[]) : [];
  const linkIds: string[] = [];
  for (const t of bodyTags) {
    const tid = str((t as Record<string, unknown>).id);
    if (tid && isUuid(tid)) linkIds.push(tid);
  }
  if (linkIds.length > 0) {
    const { error: linkError } = await db.from("document_tags").insert(
      linkIds.map((tid) => ({ document_id: docId, tag_id: tid })),
    );
    if (linkError) throw new Error(`document tags link failed: ${linkError.message}`);
  }

  const tags = await loadTags(docId);
  const docDto = toDocumentDto({ ...row, tags });
  return jsonResponse(ok(docDto, "Document metadata created; upload file contents to run AI classification"), 200);
}

async function handleUploadDocument(ctx: AuthContext | null, req: Request) {
  if (!ctx?.permissions.some((permission) => permission.toUpperCase() === "DOCUMENT_UPLOAD")) {
    return jsonResponse(fail("Document upload permission is required.", "ACCESS_DENIED"), 403);
  }
  const url = new URL(req.url);
  const form = await req.formData();
  const file = form.get("file");
  const titleParam = url.searchParams.get("title");
  const categoryIdParam = url.searchParams.get("categoryId");
  const folderIdParam = url.searchParams.get("folderId");
  const levelParam = url.searchParams.get("classificationLevel");

  const errors: string[] = [];
  if (!(file instanceof File)) {
    errors.push("No file was supplied. Send the file under the 'file' form field.");
  } else if (file.size <= 0) {
    errors.push("The uploaded file is empty (0 bytes).");
  } else if (file.size > MAX_FILE_SIZE_BYTES) {
    errors.push(`File exceeds the 20MB synchronous processing limit (received ${Math.floor(file.size / (1024 * 1024))}MB).`);
  }

  if (errors.length === 0 && file instanceof File) {
    const extension = extensionOf(file.name);
    if (extension === "") {
      errors.push(`The file has no extension. Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}.`);
    } else if (!isSupportedDocumentExtension(extension)) {
      errors.push(`File type '.${extension}' is not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}.`);
    }
  }
  if (errors.length > 0) {
    return jsonResponse(fail("Upload rejected", "INVALID_UPLOAD", errors), 400);
  }

  const uploadFile = file as File;
  const classificationLevel = levelParam ?? "INTERNAL";
  if (!CLASSIFICATION_LEVELS.includes(classificationLevel)) {
    return jsonResponse(fail("Upload rejected", "INVALID_UPLOAD", ["Invalid classification level."]), 400);
  }

  await ensureBucket();
  const extension = extensionOf(uploadFile.name);
  const storedName = crypto.randomUUID() + "." + extension;
  const bytes = new Uint8Array(await uploadFile.arrayBuffer());
  const uploadedFileSha256 = await fileSha256(bytes);
  let serverMime: string;
  try {
    serverMime = validateDocumentUpload(extension, uploadFile.type, bytes);
  } catch (e) {
    if (e instanceof DocumentExtractionError) {
      return jsonResponse(fail("Upload rejected", e.code, [e.message]), 400);
    }
    throw e;
  }
  const { error: upError } = await db.storage.from(BUCKET).upload(storedName, bytes, {
    contentType: serverMime,
    upsert: false,
  });
  if (upError) throw new Error(`storage upload failed: ${upError.message}`);

  const userEmail = ctx ? ctx.email : null;
  const userDept = ctx ? str(ctx.user.row.department) : null;
  let docId: string | null = null;
  try {
    let resolvedCategoryId: string | null = null;
    if (categoryIdParam && isUuid(categoryIdParam)) {
      const { data: cat } = await db.from("categories").select("id").eq("id", categoryIdParam).eq("is_deleted", false).maybeSingle();
      if (cat) resolvedCategoryId = String(cat.id);
    }
    let resolvedFolderId: string | null = null;
    if (folderIdParam && isUuid(folderIdParam)) {
      const { data: fol } = await db.from("folders").select("id").eq("id", folderIdParam).maybeSingle();
      if (fol) resolvedFolderId = String(fol.id);
    }

    const extraction = await extractDocumentContent(extension, bytes);
    let analysis: Awaited<ReturnType<typeof classifyDocumentContent>>["result"] | null = null;
    let aiProcessing: Record<string, unknown> = { status: "COMPLETED" };
    try {
      analysis = (await classifyDocumentContent(db, extraction.text, extraction.method)).result;
    } catch (aiError) {
      if (aiError instanceof AiCircuitOpenError) {
        aiProcessing = {
          status: "TEMPORARILY_UNAVAILABLE",
          errorCode: aiError.code,
          circuitState: aiError.circuitState,
          retryAfterSeconds: aiError.retryAfterSeconds,
          message: "The document was stored and duplicate-checked, but AI classification is temporarily unavailable.",
        };
      } else if (aiError instanceof DocumentAiError) {
        aiProcessing = {
          status: "UNAVAILABLE",
          errorCode: aiError.code,
          message: "The document was stored and duplicate-checked, but AI classification could not be completed.",
        };
      } else {
        throw aiError;
      }
    }
    const extractedOcrSha256 = await normalizedOcrSha256(extraction.text);
    const now = naiveIso();
    const { data: saved, error: insError } = await db.from("documents").insert({
      title: resolveTitle(titleParam, uploadFile.name),
      file_name: uploadFile.name,
      file_type: serverMime,
      file_size: uploadFile.size,
      file_path: storedName,
      owner_email: userEmail,
      department: userDept,
      department_id: ctx?.user.row.department_id ?? null,
      category_id: resolvedCategoryId,
      folder_id: resolvedFolderId,
      classification_level: classificationLevel,
      status: "PENDING_REVIEW",
      ocr_extracted_text: extraction.text,
      ai_summary: analysis?.summary ?? null,
      ai_predicted_category: analysis?.predictedCategoryName ?? null,
      confidence_score: analysis?.confidence ?? null,
      extracted_keywords: analysis?.metadataSuggestions.keywords ?? [],
      ai_detected_document_type: analysis?.detectedDocumentType ?? null,
      ai_metadata_suggestions: analysis?.metadataSuggestions ?? {},
      ai_classification_reason: analysis?.reason ?? null,
      ai_provider_name: analysis?.providerName ?? null,
      ai_model: analysis?.model ?? null,
      ai_processed_at: analysis?.processedAt ?? null,
      ai_extraction_method: extraction.method,
      file_sha256: uploadedFileSha256,
      ocr_normalized_sha256: extractedOcrSha256,
      duplicate_check_status: "NOT_CHECKED",
      ai_review_required: true,
      classification_review_status: "PENDING",
      final_classification: null,
      version_number: 1,
      created_by: userEmail,
      updated_by: userEmail,
      updated_at: now,
      is_deleted: false,
    }).select("*").single();
    if (insError) throw new Error(`document upload insert failed: ${insError.message}`);

    const row = (saved as unknown as Record<string, unknown>) ?? {};
    docId = String(row.id);
    if (analysis) {
      const { error: provenanceError } = await db.from("document_ai_classifications").insert({
        document_id: docId,
        content_sha256: extraction.contentSha256,
        extraction_method: extraction.method,
        extracted_character_count: extraction.text.length,
        provider_id: analysis.providerId,
        provider_name: analysis.providerName,
        model: analysis.model,
        processed_at: analysis.processedAt,
        predicted_category_id: analysis.predictedCategoryId,
        predicted_category_name: analysis.predictedCategoryName,
        category_scores: analysis.categoryScores,
        confidence: analysis.confidence,
        confidence_method: analysis.confidenceMethod,
        detected_document_type: analysis.detectedDocumentType,
        summary: analysis.summary,
        metadata_suggestions: analysis.metadataSuggestions,
        classification_reason: analysis.reason,
        grounded_evidence: analysis.groundedEvidence,
        review_required: analysis.reviewRequired,
        review_status: "PENDING",
      });
      if (provenanceError) throw new Error(`document AI provenance insert failed: ${provenanceError.message}`);
    }

    const tagNames = analysis ? [analysis.predictedCategoryName.toLowerCase().replace(/_/g, "-"), "ai-classified"]
      .map((name) => String(name).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 80))
      .filter((name, index, all) => name.length >= 2 && all.indexOf(name) === index)
      .slice(0, MAX_AUTO_TAGS) : [];
    const tagIds: string[] = [];
    for (const name of tagNames) {
      let existing = (
        await db.from("tags").select("id").eq("name", name).eq("is_deleted", false).maybeSingle()
      ).data as { id: any } | null;
      if (!existing) {
        const { data: inserted, error: tagError } = await db.from("tags").insert({ name, is_deleted: false }).select("id").single();
        if (inserted) existing = inserted as { id: any };
        else if (String(tagError?.message ?? "").toLowerCase().includes("unique")) {
          const { data: retry } = await db.from("tags").select("id").eq("name", name).eq("is_deleted", false).maybeSingle();
          existing = retry as { id: any } | null;
        } else throw new Error("document tag could not be saved");
      }
      if (existing?.id) tagIds.push(String(existing.id));
    }
    if (tagIds.length > 0) {
      const { error: linkError } = await db.from("document_tags").insert(
        tagIds.map((tagId) => ({ document_id: docId, tag_id: tagId })),
      );
      if (linkError) throw new Error(`document tags link failed: ${linkError.message}`);
    }

    let duplicateDetection: DuplicateDetectionResult;
    try {
      duplicateDetection = await runDuplicateDetection(ctx, row);
      row.duplicate_check_status = duplicateDetection.matches.length > 0 ? "REVIEW_REQUIRED" : "NO_DUPLICATE";
      row.duplicate_checked_at = duplicateDetection.checkedAt;
    } catch (duplicateError) {
      const checkedAt = new Date().toISOString();
      duplicateDetection = {
        confidence: "UNAVAILABLE",
        status: "UNAVAILABLE",
        checkedAt,
        detectorVersion: DOCUMENT_DUPLICATE_DETECTOR_VERSION,
        contentCheck: "NOT_RUN_OCR_UNAVAILABLE",
        message: "Duplicate detection is temporarily unavailable. The document was stored normally and no duplicate conclusion was made.",
        matches: [],
      };
      row.duplicate_check_status = "UNAVAILABLE";
      row.duplicate_checked_at = checkedAt;
      await db.from("documents").update({ duplicate_check_status: "UNAVAILABLE", duplicate_checked_at: checkedAt }).eq("id", docId);
      console.error("document duplicate detection failed", duplicateError);
    }

    await writeAudit(ctx?.user ?? null, analysis ? "UPLOAD_AND_CLASSIFY_DOCUMENT" : "UPLOAD_DOCUMENT_AI_UNAVAILABLE", MODULE, "Document", docId,
      analysis
        ? `Uploaded and content-classified document '${str(row.title)}' as ${analysis.predictedCategoryName}`
          + ` (confidence=${analysis.confidence}, reviewRequired=${analysis.reviewRequired}, provider=${analysis.providerName}, model=${analysis.model}, duplicateResult=${duplicateDetection.confidence})`
        : `Uploaded and content-extracted document '${str(row.title)}'; AI classification unavailable; duplicateResult=${duplicateDetection.confidence}`,
      ctx ? resolveClientIp(req).ip : null, "INFO");

    const tags = await loadTags(docId);
    return jsonResponse(ok(
      { ...toDocumentDto({ ...row, tags }), duplicateDetection, aiProcessing },
      analysis
        ? "Document securely stored, content-extracted, AI-classified, duplicate-checked, and queued for human review"
        : "Document securely stored, content-extracted, duplicate-checked, and queued for manual classification",
    ), 200);
  } catch (error) {
    if (docId) {
      await db.from("document_tags").delete().eq("document_id", docId);
      await db.from("document_ai_classifications").delete().eq("document_id", docId);
      await db.from("documents").delete().eq("id", docId);
    }
    await db.storage.from(BUCKET).remove([storedName]);
    if (error instanceof DocumentExtractionError) {
      let duplicateDetection: DuplicateDetectionResult = detectDocumentDuplicates(
        { fileSha256: uploadedFileSha256 }, [], { ocrUnavailable: true },
      );
      try {
        const { data: fileCandidates, error: candidateError } = await db.rpc("phase10_document_duplicate_candidates", {
          p_user_email: ctx?.email ?? "",
          p_user_department: str(ctx?.user.row.department),
          p_roles: (ctx?.roles ?? [])
            .map((role) => role.toUpperCase())
            .filter((role) => role !== "SUPER_ADMIN" && role !== "SYSTEM_ADMIN"),
          p_source_document_id: crypto.randomUUID(),
          p_file_sha256: uploadedFileSha256,
          p_ocr_normalized_sha256: null,
          p_ocr_normalized_text: null,
          p_document_number: null,
          p_title: titleParam,
          p_document_type: null,
          p_limit: 25,
        });
        if (candidateError) throw candidateError;
        duplicateDetection = detectDocumentDuplicates(
          { fileSha256: uploadedFileSha256, title: titleParam },
          ((fileCandidates as unknown as Record<string, unknown>[]) ?? []).map(duplicateCandidateFromRow),
          { ocrUnavailable: true },
        );
      } catch (candidateError) {
        console.error("file-only duplicate detection failed after OCR extraction error", candidateError);
      }
      return jsonResponse({
        ...fail(error.message, error.code),
        data: { duplicateDetection },
      }, 422);
    }
    if (error instanceof DocumentAiError) {
      const unavailable = ["AI_PROVIDER_UNAVAILABLE", "AI_PROVIDER_OFFLINE", "AI_CREDENTIAL_UNAVAILABLE", "DOCUMENT_AI_DISABLED",
        "PROVIDER_OFFLINE", "PROVIDER_DISABLED", "PROVIDER_UNREACHABLE", "CREDENTIAL_MISSING", "CREDENTIAL_DECRYPTION_FAILED"]
        .includes(error.code);
      return jsonResponse(fail(error.message, error.code), unavailable ? 503 : 422);
    }
    if (error instanceof AiCircuitOpenError) {
      return jsonResponse({
        ...fail(error.message, error.code),
        data: { circuitState: error.circuitState, retryAfterSeconds: error.retryAfterSeconds },
      }, 503, circuitRetryHeaders(error));
    }
    throw error;
  }
}

async function handleClassificationCategories() {
  try {
    const categories = await getDocumentBusinessCategories(db);
    return jsonResponse(ok(categories, "Document classification categories retrieved"), 200);
  } catch (error) {
    if (error instanceof DocumentAiError) return jsonResponse(fail(error.message, error.code), 422);
    throw error;
  }
}

async function handleClassificationReview(
  ctx: AuthContext | null,
  req: Request,
  body: unknown,
  p: RouteParams,
) {
  if (!isUuid(p.id)) return jsonResponse(fail("Invalid document identifier.", "VALIDATION_ERROR"), 400);
  const b = (body ?? {}) as Record<string, unknown>;
  const decision = String(b.decision ?? "").trim().toUpperCase();
  if (!["APPROVE", "CORRECT", "REJECT"].includes(decision)) {
    return jsonResponse(fail("Decision must be APPROVE, CORRECT, or REJECT.", "VALIDATION_ERROR"), 400);
  }
  const notes = String(b.notes ?? "").trim().slice(0, 1_000);
  const row = await loadDocumentRow(p.id);
  if (!row || row.is_deleted === true) {
    return jsonResponse(fail("Document not found.", "RESOURCE_NOT_FOUND"), 404);
  }
  const reviewGrants = (await loadGrants([p.id])).get(p.id) ?? [];
  const reviewContext = accessContext(ctx);
  if (!reviewContext.permissions.some((permission) => permission.toUpperCase() === "DOCUMENT_CLASSIFY")
    || !canViewDocumentContent(reviewContext, row, reviewGrants)) {
    return jsonResponse(fail("You do not have permission to classify this document.", "ACCESS_DENIED"), 403);
  }
  if (String(row.status ?? "") !== "PENDING_REVIEW") {
    return jsonResponse(fail("Only documents pending review can receive a classification decision.", "BUSINESS_RULE_VIOLATION"), 409);
  }

  const { data: provenance, error: provenanceLookupError } = await db.from("document_ai_classifications")
    .select("*")
    .eq("document_id", p.id)
    .order("processed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (provenanceLookupError) throw new Error(`classification provenance lookup failed: ${provenanceLookupError.message}`);
  if (!provenance) {
    return jsonResponse(fail("This document has no AI classification to review.", "AI_CLASSIFICATION_NOT_FOUND"), 409);
  }

  let requestedCategoryId: string | null = null;
  if (decision === "APPROVE") {
    if (!provenance.predicted_category_id || !provenance.predicted_category_name) {
      return jsonResponse(fail("The AI prediction does not reference an active category.", "CATEGORY_NOT_FOUND"), 409);
    }
  } else if (decision === "CORRECT") {
    requestedCategoryId = String(b.categoryId ?? "").trim();
    if (!isUuid(requestedCategoryId)) {
      return jsonResponse(fail("A valid categoryId is required when correcting a classification.", "VALIDATION_ERROR"), 400);
    }
    const { data: category, error: categoryError } = await db.from("categories")
      .select("id,name")
      .eq("id", requestedCategoryId)
      .eq("is_deleted", false)
      .maybeSingle();
    if (categoryError) throw new Error(`classification category lookup failed: ${categoryError.message}`);
    if (!category) return jsonResponse(fail("The selected category is not active.", "CATEGORY_NOT_FOUND"), 404);
  }

  const reviewer = ctx?.email ?? "SYSTEM";
  const { data: reviewResult, error: reviewError } = await db.rpc("review_document_ai_classification", {
    p_document_id: p.id,
    p_decision: decision,
    p_category_id: requestedCategoryId,
    p_reviewer_email: reviewer,
    p_notes: notes || null,
  });
  if (reviewError) throw new Error(`document classification review failed: ${reviewError.message}`);
  const reviewMetadata = (reviewResult ?? {}) as Record<string, unknown>;
  const reviewStatus = str(reviewMetadata.reviewStatus) ?? "PENDING";
  const finalCategoryName = str(reviewMetadata.finalCategoryName);

  await writeAudit(ctx?.user ?? null, `${reviewStatus}_AI_CLASSIFICATION`, MODULE, "Document", p.id,
    `${reviewStatus} AI classification for '${str(row.title)}'`
      + (finalCategoryName ? `; final category=${finalCategoryName}` : "; no final category assigned"),
    ctx ? resolveClientIp(req).ip : null, "INFO");
  const updated = await loadDocumentRow(p.id);
  if (!updated) throw new Error("document disappeared after classification review");
  const tags = await loadTags(p.id);
  return jsonResponse(ok(toDocumentDto({ ...updated, tags }), "Document classification review recorded"), 200);
}

async function handleDownloadDocument(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const row = await loadDocumentRow(p.id);
  if (!row) {
    return jsonResponse(fail(`Document not found: ${p.id}`, "RESOURCE_NOT_FOUND"), 404);
  }

  const grants = (await loadGrants([p.id])).get(p.id) ?? [];
  if (!canDownloadDocumentContent(accessContext(ctx), row, grants)) {
    return jsonResponse(fail("You do not have permission to download this document.", "ACCESS_DENIED"), 403);
  }

  const filePath = str(row.file_path);
  if (filePath == null || filePath.trim() === "") {
    return jsonResponse(
      fail(
        `Document '${str(row.title)}' has no stored file. It was created as metadata only - use POST /v1/documents/upload to attach a file.`,
        "FILE_NOT_STORED",
      ),
      404,
    );
  }
  if (!isValidStorageObjectPath(filePath)) {
    return jsonResponse(
      fail("The document references a legacy file path that is not available in Supabase Storage.", "INVALID_STORAGE_PATH"),
      404,
    );
  }

  const { data: fileData, error: downError } = await db.storage.from(BUCKET).download(filePath);
  if (downError || !fileData) {
    return jsonResponse(fail("The stored file for this document is no longer available on the file server.", "FILE_NOT_FOUND"), 404);
  }
  const buffer = await fileData.arrayBuffer();

  await writeAudit(ctx?.user ?? null, "DOWNLOAD_DOCUMENT", MODULE, "Document", p.id,
    `Downloaded document: ${str(row.title)} (${str(row.file_name)})`,
    ctx ? resolveClientIp(req).ip : null, "INFO");

  const fileType = str(row.file_type) ?? "";
  const mediaType = /^\w+\/[\w.+-]+$/.test(fileType) ? fileType : "application/octet-stream";
  const rawFileName = str(row.file_name) ?? "document";
  const safe = rawFileName.replace(/[\r\n"\\]/g, "_");
  const encoded = encodeURIComponent(rawFileName).replace(/\+/g, "%20");

  const headers = corsHeaders();
  headers.set("Content-Type", mediaType);
  headers.set("Content-Disposition", `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`);
  return new Response(buffer, { status: 200, headers });
}

async function handleDuplicateReview(
  ctx: AuthContext | null,
  req: Request,
  body: unknown,
  p: RouteParams,
) {
  if (!isUuid(p.id)) return jsonResponse(fail("Invalid document identifier.", "VALIDATION_ERROR"), 400);
  const source = await loadDocumentRow(p.id);
  if (!source || source.is_deleted === true) {
    return jsonResponse(fail("Document not found.", "RESOURCE_NOT_FOUND"), 404);
  }
  const userEmail = ctx?.email ?? "";
  const roles = ctx?.roles ?? [];
  const grants = (await loadGrants([p.id])).get(p.id) ?? [];
  const viewer = accessContext(ctx);
  const canReview = isOwner(userEmail, source)
    || (REVIEW_ROLES.some((role) => hasRole(roles, role)) && canViewDocumentContent(viewer, source, grants));
  if (!canReview) {
    return jsonResponse(fail("You do not have permission to review this duplicate result.", "ACCESS_DENIED"), 403);
  }

  const value = (body ?? {}) as Record<string, unknown>;
  const decision = String(value.decision ?? "").trim().toUpperCase();
  if (!["CONTINUE_AS_NEW", "CANCEL_REVIEW"].includes(decision)) {
    return jsonResponse(fail("Decision must be CONTINUE_AS_NEW or CANCEL_REVIEW.", "VALIDATION_ERROR"), 400);
  }
  const matchedDocumentId = str(value.matchedDocumentId);
  if (matchedDocumentId != null && !isUuid(matchedDocumentId)) {
    return jsonResponse(fail("Invalid matched document identifier.", "VALIDATION_ERROR"), 400);
  }

  let update = db.from("document_duplicate_matches").update({
    reviewer_decision: decision,
    reviewed_by: userEmail,
    reviewed_at: new Date().toISOString(),
  }).eq("source_document_id", p.id);
  if (matchedDocumentId) update = update.eq("matched_document_id", matchedDocumentId);
  const { data: reviewed, error } = await update.select("id, matched_document_id");
  if (error) throw new Error(`duplicate review failed: ${error.message}`);
  if (!reviewed || reviewed.length === 0) {
    return jsonResponse(fail("No duplicate finding was available for review.", "DUPLICATE_MATCH_NOT_FOUND"), 404);
  }

  await writeAudit(ctx?.user ?? null, "DOCUMENT_DUPLICATE_REVIEWED", MODULE, "Document", p.id,
    `Duplicate finding reviewed; decision=${decision}; matches=${reviewed.length}`,
    ctx ? resolveClientIp(req).ip : null, "INFO");
  return jsonResponse(ok({
    documentId: p.id,
    decision,
    reviewedAt: new Date().toISOString(),
    reviewedMatches: reviewed.length,
  }, "Duplicate review decision recorded; no document was deleted, overwritten, archived, or reclassified"), 200);
}

async function handleGetSignedUrl(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const row = await loadDocumentRow(p.id);
  if (!row) {
    return jsonResponse(fail(`Document not found: ${p.id}`, "RESOURCE_NOT_FOUND"), 404);
  }

  const grants = (await loadGrants([p.id])).get(p.id) ?? [];
  if (!canViewDocumentContent(accessContext(ctx), row, grants)) {
    return jsonResponse(fail("You do not have permission to view this document.", "ACCESS_DENIED"), 403);
  }

  const filePath = str(row.file_path);
  if (filePath == null || filePath.trim() === "") {
    return jsonResponse(
      fail(
        `Document '${str(row.title)}' has no stored file.`,
        "FILE_NOT_STORED",
      ),
      404,
    );
  }
  if (!isValidStorageObjectPath(filePath)) {
    return jsonResponse(
      fail("The document references a legacy file path that is not available in Supabase Storage.", "INVALID_STORAGE_PATH"),
      404,
    );
  }

  await ensureBucket();
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(filePath, 300);
  if (error || !data) {
    if (isMissingStorageObjectError(error)) {
      return jsonResponse(
        fail("The stored file for this document is no longer available.", "FILE_NOT_FOUND"),
        404,
      );
    }
    return jsonResponse(fail("The document storage service is temporarily unavailable.", "STORAGE_UNAVAILABLE"), 503);
  }

  await writeAudit(ctx?.user ?? null, "VIEW_DOCUMENT", MODULE, "Document", p.id,
    `Opened document in secure viewer: ${str(row.title)}`,
    ctx ? resolveClientIp(req).ip : null, "INFO");

  return jsonResponse(
    ok({
      signedUrl: data.signedUrl,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      contentType: str(row.file_type),
      fileName: str(row.file_name),
    }, "Signed URL generated"),
    200,
  );
}

async function handleDeleteOwnedDocument(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const row = await loadDocumentRow(p.id);
  if (!row) return jsonResponse(fail(`Document not found: ${p.id}`, "RESOURCE_NOT_FOUND"), 404);
  const owner = String(row.created_by ?? row.owner_email ?? "").toLowerCase();
  if (!ctx || owner !== ctx.email.toLowerCase()) {
    return jsonResponse(fail("Only the document owner can delete an unlinked source document.", "ACCESS_DENIED"), 403);
  }

  for (const [table, label] of [["contracts", "a contract"], ["contract_ai_analyses", "a contract analysis"], ["records_archives", "a records archive"]] as const) {
    const column = table === "contract_ai_analyses" ? "source_document_id" : "document_id";
    const linked = await db.from(table).select("id", { count: "exact", head: true }).eq(column, p.id);
    if (linked.error) throw new Error(`${table} reference check failed: ${linked.error.message}`);
    if ((linked.count ?? 0) > 0) {
      return jsonResponse(fail(`The document cannot be deleted while linked to ${label}.`, "DOCUMENT_IN_USE"), 409);
    }
  }

  const tagDelete = await db.from("document_tags").delete().eq("document_id", p.id);
  if (tagDelete.error) throw new Error(`document tag cleanup failed: ${tagDelete.error.message}`);
  const classificationDelete = await db.from("document_ai_classifications").delete().eq("document_id", p.id);
  if (classificationDelete.error) throw new Error(`document AI cleanup failed: ${classificationDelete.error.message}`);
  const documentDelete = await db.from("documents").delete().eq("id", p.id);
  if (documentDelete.error) throw new Error(`document deletion failed: ${documentDelete.error.message}`);

  const filePath = str(row.file_path)?.trim() ?? "";
  if (isValidStorageObjectPath(filePath)) {
    const removal = await db.storage.from(BUCKET).remove([filePath]);
    if (removal.error && !isMissingStorageObjectError(removal.error)) {
      throw new Error(`document storage cleanup failed: ${removal.error.message}`);
    }
  }
  await writeAudit(ctx.user, "DELETE_UNLINKED_SOURCE_DOCUMENT", MODULE, "Document", p.id,
    `Deleted unlinked source document: ${str(row.title)}`, resolveClientIp(req).ip, "INFO");
  return jsonResponse(ok({ documentDeleted: true }, "Unlinked source document deleted"), 200);
}

async function handleArchiveDocument(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  return handleArchiveStatus(ctx, req, body, p, false);
}

async function handleRestoreDocument(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  return handleArchiveStatus(ctx, req, body, p, true);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes = [
  { method: "GET", path: "/documents/search", guard: { kind: "auth" }, handler: handleSearchDocuments },
  { method: "GET", path: "/documents/classification-categories", guard: { kind: "auth" }, handler: handleClassificationCategories },
  { method: "GET", path: "/documents/archive/departments", guard: { kind: "auth" }, handler: handleArchiveDepartments },
  { method: "GET", path: "/documents/archive", guard: { kind: "auth" }, handler: handleArchiveDocuments },
  { method: "GET", path: "/documents/access-requests", guard: { kind: "auth" }, handler: handleListAccessRequests },
  { method: "POST", path: "/documents/access-requests/:id/decision", guard: { kind: "auth" }, handler: handleDecideAccessRequest },
  { method: "GET", path: "/documents", guard: { kind: "auth" }, handler: handleListDocuments },
  { method: "POST", path: "/documents", guard: { kind: "auth" }, handler: handleCreateDocument },
  { method: "POST", path: "/documents/upload", guard: { kind: "auth" }, handler: handleUploadDocument },
  { method: "GET", path: "/documents/:id", guard: { kind: "auth" }, handler: handleArchiveDocumentDetail },
  { method: "POST", path: "/documents/:id/archive", guard: { kind: "auth" }, handler: handleArchiveDocument },
  { method: "POST", path: "/documents/:id/restore", guard: { kind: "auth" }, handler: handleRestoreDocument },
  { method: "POST", path: "/documents/:id/access-requests", guard: { kind: "auth" }, handler: handleRequestDocumentAccess },
  { method: "POST", path: "/documents/:id/classification-review", guard: { kind: "roles", roles: REVIEW_ROLES }, handler: handleClassificationReview },
  { method: "POST", path: "/documents/:id/duplicate-review", guard: { kind: "auth" }, handler: handleDuplicateReview },
  { method: "GET", path: "/documents/:id/download", guard: { kind: "auth" }, handler: handleDownloadDocument },
  { method: "GET", path: "/documents/:id/signed-url", guard: { kind: "auth" }, handler: handleGetSignedUrl },
  { method: "DELETE", path: "/documents/:id", guard: { kind: "auth" }, handler: handleDeleteOwnedDocument },
] as const;

Deno.serve(createHandler(routes as never, { name: "documents" }));
