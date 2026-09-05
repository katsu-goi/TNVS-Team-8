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
  MAX_EXTRACTABLE_FILE_BYTES,
  SUPPORTED_DOCUMENT_EXTENSIONS,
} from "../_shared/document-content.ts";
import {
  classifyDocumentContent,
  DocumentAiError,
  getDocumentBusinessCategories,
} from "../_shared/document-ai.ts";

const db = adminDb();

const MODULE = "DOCUMENTS";
const BUCKET = "documents";
const MAX_FILE_SIZE_BYTES = MAX_EXTRACTABLE_FILE_BYTES;
const MAX_AUTO_TAGS = 3;

const DOCUMENT_STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "ARCHIVED", "DELETED"];
const CLASSIFICATION_LEVELS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "SECRET"];
const ALLOWED_EXTENSIONS = [...SUPPORTED_DOCUMENT_EXTENSIONS];

const CONTRACT_KEYWORDS = [
  "contract", "procurement", "vendor", "supplier", "sla",
  "lease", "purchase", "agreement", "obligation", "dpa",
];

const REVIEW_ROLES = ["SUPER_ADMIN", "COMPLIANCE_OFFICER", "LEGAL_OFFICER"];

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

function resolveTitle(title: string | null, originalFilename: string | null): string {
  if (title != null && title.trim() !== "") return title.trim();
  if (originalFilename == null || originalFilename === "") return "Untitled document";
  const dot = originalFilename.lastIndexOf(".");
  return dot > 0 ? originalFilename.substring(0, dot) : originalFilename;
}

// ---------------------------------------------------------------------------
// DocumentAccessPolicy (mirrors the Spring policy)
// ---------------------------------------------------------------------------

function normalizeDept(value: string | null): string {
  return value == null ? "" : value.trim().toLowerCase();
}

function sameDepartment(userDept: string | null, docDept: string | null): boolean {
  const ud = normalizeDept(userDept);
  const dd = normalizeDept(docDept);
  return ud !== "" && ud === dd;
}

function isContractRelated(d: Record<string, unknown>, categoryName: string | null): boolean {
  const parts = [str(d.title), str(d.ai_predicted_category), str(d.department), categoryName]
    .filter((v): v is string => v != null && v !== "");
  const text = parts.join(" ").toLowerCase();
  return CONTRACT_KEYWORDS.some((kw) => text.includes(kw));
}

function categoryNameOf(d: Record<string, unknown>): string | null {
  const cats = d.categories;
  if (Array.isArray(cats) && cats.length > 0) return str((cats[0] as Record<string, unknown>).name);
  if (cats != null && typeof cats === "object") return str((cats as Record<string, unknown>).name);
  return null;
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

function grantMatches(
  grants: Array<Record<string, unknown>>,
  userEmail: string,
  roles: string[],
  requiredLevel: string | null,
): boolean {
  const roleSet = new Set(roles.map((r) => r.toUpperCase()));
  for (const g of grants) {
    if (g.is_deleted === true) continue;
    const key = str(g.grantee_key) ?? "";
    let matches = false;
    if (g.grantee_type === "USER") matches = key.toLowerCase() === userEmail.toLowerCase();
    else if (g.grantee_type === "ROLE") matches = roleSet.has(key.toUpperCase());
    if (!matches) continue;
    const level = str(g.access_level) ?? "";
    if (requiredLevel == null) return true;
    if (level === "DOWNLOAD") return true;
    if (level === requiredLevel) return true;
  }
  return false;
}

function canViewDocument(
  userEmail: string, roles: string[], userDept: string | null,
  d: Record<string, unknown>, grants: Array<Record<string, unknown>>,
): boolean {
  if (hasRole(roles, "SUPER_ADMIN")) return true;
  if (isOwner(userEmail, d)) return true;
  if (grantMatches(grants, userEmail, roles, null)) return true;
  if (hasRole(roles, "COMPLIANCE_OFFICER") || hasRole(roles, "LEGAL_OFFICER")) return true;
  if (hasRole(roles, "CONTRACT_OFFICER")) {
    return isContractRelated(d, categoryNameOf(d)) || sameDepartment(userDept, str(d.department));
  }
  if (hasRole(roles, "EMPLOYEE")) return false;
  return sameDepartment(userDept, str(d.department));
}

function canDownloadDocument(
  userEmail: string, roles: string[], userDept: string | null,
  d: Record<string, unknown>, grants: Array<Record<string, unknown>>,
): boolean {
  if (hasRole(roles, "SUPER_ADMIN")) return true;
  if (isOwner(userEmail, d)) return true;
  if (grantMatches(grants, userEmail, roles, "DOWNLOAD")) return true;
  if (hasRole(roles, "COMPLIANCE_OFFICER") || hasRole(roles, "LEGAL_OFFICER")) return true;
  if (hasRole(roles, "CONTRACT_OFFICER")) {
    return isContractRelated(d, categoryNameOf(d)) || sameDepartment(userDept, str(d.department));
  }
  if (hasRole(roles, "EMPLOYEE")) return false;
  return sameDepartment(userDept, str(d.department));
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
    tags: ((d.tags ?? []) as unknown[]).map((t: unknown) => {
      const tag = t as Record<string, unknown>;
      return { id: str(tag.id), name: str(tag.name) };
    }),
    versionNumber: num(d.version_number),
    retentionPolicyId: str(d.retention_policy_id),
    retentionExpiresAt: naiveStr(d.retention_expires_at),
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

async function loadDocumentRow(id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from("documents").select("*, categories(name), folders(name, path)")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(`document query failed: ${error.message}`);
  return (data as unknown as Record<string, unknown>) ?? null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleListDocuments(ctx: AuthContext | null) {
  const { data, error } = await db.from("documents").select("*, categories(name), folders(name, path)");
  if (error) throw new Error(`documents query failed: ${error.message}`);
  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  const ids = rows.map((r) => String(r.id ?? ""));
  const grants = await loadGrants(ids);
  const tagsByDoc = await loadTagsForDocs(ids);
  const userEmail = ctx ? ctx.email : "";
  const userRoles = ctx ? ctx.roles : [];
  const userDept = ctx ? str(ctx.user.row.department) : null;
  const visible = rows.filter((d) => canViewDocument(userEmail, userRoles, userDept, d, grants.get(String(d.id ?? "")) ?? []));
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
    .or(`title.ilike.%${query}%,ocr_extracted_text.ilike.%${query}%,ai_summary.ilike.%${query}%`);
  if (error) throw new Error(`documents search failed: ${error.message}`);
  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  const ids = rows.map((r) => String(r.id ?? ""));
  const grants = await loadGrants(ids);
  const tagsByDoc = await loadTagsForDocs(ids);
  const userEmail = ctx ? ctx.email : "";
  const userRoles = ctx ? ctx.roles : [];
  const userDept = ctx ? str(ctx.user.row.department) : null;
  const visible = rows.filter((d) => canViewDocument(userEmail, userRoles, userDept, d, grants.get(String(d.id ?? "")) ?? []));
  return jsonResponse(ok(visible.map((d) => toDocumentDto({ ...d, tags: tagsByDoc.get(String(d.id ?? "")) ?? [] })), "Search results retrieved"), 200);
}

async function handleCreateDocument(ctx: AuthContext | null, _req: Request, body: unknown) {
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
    } else if (!ALLOWED_EXTENSIONS.includes(extension)) {
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
  const { error: upError } = await db.storage.from(BUCKET).upload(storedName, bytes, {
    contentType: uploadFile.type || "application/octet-stream",
    upsert: true,
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
    const { result: analysis } = await classifyDocumentContent(db, extraction.text, extraction.method);
    const now = naiveIso();
    const { data: saved, error: insError } = await db.from("documents").insert({
      title: resolveTitle(titleParam, uploadFile.name),
      file_name: uploadFile.name,
      file_type: uploadFile.type || `application/${extension}`,
      file_size: uploadFile.size,
      file_path: storedName,
      owner_email: userEmail,
      department: userDept,
      category_id: resolvedCategoryId,
      folder_id: resolvedFolderId,
      classification_level: classificationLevel,
      status: "PENDING_REVIEW",
      ocr_extracted_text: extraction.text,
      ai_summary: analysis.summary,
      ai_predicted_category: analysis.predictedCategoryName,
      confidence_score: analysis.confidence,
      extracted_keywords: analysis.metadataSuggestions.keywords ?? [],
      ai_detected_document_type: analysis.detectedDocumentType,
      ai_metadata_suggestions: analysis.metadataSuggestions,
      ai_classification_reason: analysis.reason,
      ai_provider_name: analysis.providerName,
      ai_model: analysis.model,
      ai_processed_at: analysis.processedAt,
      ai_extraction_method: extraction.method,
      ai_review_required: analysis.reviewRequired,
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

    const tagNames = [analysis.predictedCategoryName.toLowerCase().replace(/_/g, "-"), "ai-classified"]
      .map((name) => String(name).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 80))
      .filter((name, index, all) => name.length >= 2 && all.indexOf(name) === index)
      .slice(0, MAX_AUTO_TAGS);
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

    await writeAudit(ctx?.user ?? null, "UPLOAD_AND_CLASSIFY_DOCUMENT", MODULE, "Document", docId,
      `Uploaded and content-classified document '${str(row.title)}' as ${analysis.predictedCategoryName}`
        + ` (confidence=${analysis.confidence}, reviewRequired=${analysis.reviewRequired}, provider=${analysis.providerName}, model=${analysis.model})`,
      ctx ? resolveClientIp(req).ip : null, "INFO");

    const tags = await loadTags(docId);
    return jsonResponse(ok(toDocumentDto({ ...row, tags }), "Document securely stored, content-extracted, AI-classified, and queued for human review"), 200);
  } catch (error) {
    if (docId) {
      await db.from("document_tags").delete().eq("document_id", docId);
      await db.from("document_ai_classifications").delete().eq("document_id", docId);
      await db.from("documents").delete().eq("id", docId);
    }
    await db.storage.from(BUCKET).remove([storedName]);
    if (error instanceof DocumentExtractionError) {
      return jsonResponse(fail(error.message, error.code), 422);
    }
    if (error instanceof DocumentAiError) {
      const unavailable = ["AI_PROVIDER_UNAVAILABLE", "AI_PROVIDER_OFFLINE", "AI_CREDENTIAL_UNAVAILABLE", "DOCUMENT_AI_DISABLED"]
        .includes(error.code);
      return jsonResponse(fail(error.message, error.code), unavailable ? 503 : 422);
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

  const userEmail = ctx ? ctx.email : "";
  const userRoles = ctx ? ctx.roles : [];
  const userDept = ctx ? str(ctx.user.row.department) : null;
  const grants = (await loadGrants([p.id])).get(p.id) ?? [];
  if (!canDownloadDocument(userEmail, userRoles, userDept, row, grants)) {
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

async function handleGetSignedUrl(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const row = await loadDocumentRow(p.id);
  if (!row) {
    return jsonResponse(fail(`Document not found: ${p.id}`, "RESOURCE_NOT_FOUND"), 404);
  }

  const userEmail = ctx ? ctx.email : "";
  const userRoles = ctx ? ctx.roles : [];
  const userDept = ctx ? str(ctx.user.row.department) : null;
  const grants = (await loadGrants([p.id])).get(p.id) ?? [];
  if (!canDownloadDocument(userEmail, userRoles, userDept, row, grants)) {
    return jsonResponse(fail("You do not have permission to download this document.", "ACCESS_DENIED"), 403);
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

  return jsonResponse(
    ok({ signedUrl: data.signedUrl, expiresAt: new Date(Date.now() + 300_000).toISOString() }, "Signed URL generated"),
    200,
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes = [
  { method: "GET", path: "/documents", guard: { kind: "auth" }, handler: handleListDocuments },
  { method: "GET", path: "/documents/search", guard: { kind: "auth" }, handler: handleSearchDocuments },
  { method: "GET", path: "/documents/classification-categories", guard: { kind: "auth" }, handler: handleClassificationCategories },
  { method: "POST", path: "/documents", guard: { kind: "auth" }, handler: handleCreateDocument },
  { method: "POST", path: "/documents/upload", guard: { kind: "auth" }, handler: handleUploadDocument },
  { method: "POST", path: "/documents/:id/classification-review", guard: { kind: "roles", roles: REVIEW_ROLES }, handler: handleClassificationReview },
  { method: "GET", path: "/documents/:id/download", guard: { kind: "auth" }, handler: handleDownloadDocument },
  { method: "GET", path: "/documents/:id/signed-url", guard: { kind: "auth" }, handler: handleGetSignedUrl },
] as const;

Deno.serve(createHandler(routes as never, { name: "documents" }));
