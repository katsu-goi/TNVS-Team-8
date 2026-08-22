import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse, corsHeaders } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import { naiveIso } from "../_shared/auth-users.ts";
import { writeAudit } from "../_shared/lockout.ts";
import { resolveClientIp } from "../_shared/ip.ts";

const db = adminDb();

const MODULE = "DOCUMENTS";
const BUCKET = "documents";
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const OCR_SAMPLE_BYTES = 256 * 1024;
const MAX_AUTO_TAGS = 3;

const DOCUMENT_STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "ARCHIVED", "DELETED"];
const CLASSIFICATION_LEVELS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "SECRET"];
const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "doc", "docx", "xls", "xlsx", "txt"];

const CONTRACT_KEYWORDS = [
  "contract", "procurement", "vendor", "supplier", "sla",
  "lease", "purchase", "agreement", "obligation", "dpa",
];

const CATEGORY_TAGS: Record<string, string[]> = {
  LEGAL_CONTRACT: ["legal", "contract", "ai-classified"],
  FINANCIAL_INVOICE: ["finance", "invoice", "ai-classified"],
  FACILITIES_DOCUMENT: ["facilities", "maintenance", "ai-classified"],
  SECURITY_VISITOR: ["security", "visitor", "ai-classified"],
  OPERATIONAL_RECORD: ["operations", "record", "ai-classified"],
  GENERAL_CORRESPONDENCE: ["general", "correspondence", "ai-classified"],
};

const LOW_SIGNAL_CATEGORIES = new Set(["GENERAL_CORRESPONDENCE", "OPERATIONAL_RECORD"]);

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

// ---------------------------------------------------------------------------
// AI helpers (mirror OcrService / DocumentClassificationAiService)
// ---------------------------------------------------------------------------

function ocrText(fileName: string | null): string {
  return `Simulated OCR Extracted Text from ${fileName} using Tesseract/Apache Tika engine.`;
}

function classify(content: string | null): string {
  if (content == null || content.trim() === "") return "GENERAL_CORRESPONDENCE";
  const lower = content.toLowerCase();
  if (lower.includes("contract") || lower.includes("agreement") || lower.includes("clause")) return "LEGAL_CONTRACT";
  if (lower.includes("invoice") || lower.includes("payment") || lower.includes("receipt")) return "FINANCIAL_INVOICE";
  if (lower.includes("facility") || lower.includes("room") || lower.includes("maintenance")) return "FACILITIES_DOCUMENT";
  if (lower.includes("visitor") || lower.includes("security") || lower.includes("badge")) return "SECURITY_VISITOR";
  return "OPERATIONAL_RECORD";
}

function summarize(content: string | null): string {
  if (content == null || content.trim() === "") return "No content available for AI summarization.";
  const length = Math.min(content.length, 250);
  return `AI Summary: ${content.substring(0, length)}...`;
}

function estimateConfidence(predictedCategory: string | null, text: string | null): number {
  let score = 0.55;
  if (predictedCategory != null && !LOW_SIGNAL_CATEGORIES.has(predictedCategory)) score += 0.25;
  if (text != null && text.length >= 120) score += 0.10;
  if (text != null && text.trim() !== "") {
    const categoryTags = predictedCategory != null ? (CATEGORY_TAGS[predictedCategory] ?? []) : [];
    const hits = categoryTags
      .filter((tag: string) => text.toLowerCase().includes(tag)).length;
    score += Math.min(hits, 2) * 0.04;
  }
  score = Math.max(0.05, Math.min(0.99, score));
  return Math.round(score * 100) / 100;
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
  const status = str(b.status) ?? "APPROVED";
  if (!DOCUMENT_STATUSES.includes(status)) {
    return jsonResponse(
      fail(`Status must be one of ${DOCUMENT_STATUSES.join(", ")}`, "VALIDATION_ERROR"),
      400,
    );
  }

  const userEmail = ctx ? ctx.email : null;
  const userDept = ctx ? str(ctx.user.row.department) : null;
  const fileName = str(b.fileName);

  const extractedText = ocrText(fileName);
  const predictedCategory = classify(extractedText);

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
    ocr_extracted_text: extractedText,
    ai_summary: summarize(extractedText),
    ai_predicted_category: predictedCategory,
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
  return jsonResponse(ok(docDto, "Document uploaded & processed by AI"), 200);
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
    errors.push(`File exceeds the 100MB limit (received ${Math.floor(file.size / (1024 * 1024))}MB).`);
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

  let resolvedCategoryId: string | null = null;
  if (categoryIdParam && isUuid(categoryIdParam)) {
    const { data: cat } = await db.from("categories").select("id").eq("id", categoryIdParam).maybeSingle();
    if (cat) resolvedCategoryId = String(cat.id);
  }
  let resolvedFolderId: string | null = null;
  if (folderIdParam && isUuid(folderIdParam)) {
    const { data: fol } = await db.from("folders").select("id").eq("id", folderIdParam).maybeSingle();
    if (fol) resolvedFolderId = String(fol.id);
  }

  const extractedText = ocrText(uploadFile.name);
  const predictedCategory = classify(extractedText);
  const confidence = estimateConfidence(predictedCategory, extractedText);

  const now = naiveIso();
  const { data: saved, error: insError } = await db.from("documents").insert({
    title: resolveTitle(titleParam, uploadFile.name),
    file_name: uploadFile.name,
    file_type: uploadFile.type,
    file_size: uploadFile.size,
    file_path: storedName,
    owner_email: userEmail,
    department: userDept,
    category_id: resolvedCategoryId,
    folder_id: resolvedFolderId,
    classification_level: classificationLevel,
    status: "PENDING_REVIEW",
    ocr_extracted_text: extractedText,
    ai_summary: summarize(extractedText),
    ai_predicted_category: predictedCategory,
    confidence_score: confidence,
    version_number: 1,
    created_by: userEmail,
    updated_by: userEmail,
    updated_at: now,
    is_deleted: false,
  }).select("*").single();
  if (insError) throw new Error(`document upload insert failed: ${insError.message}`);

  const row = (saved as unknown as Record<string, unknown>) ?? {};
  const docId = String(row.id);

  const tagNames = CATEGORY_TAGS[predictedCategory] ?? ["ai-classified"];
  const tagIds: string[] = [];
  for (const name of tagNames.slice(0, MAX_AUTO_TAGS)) {
    let existing = (
      await db.from("tags").select("id").eq("name", name).eq("is_deleted", false).maybeSingle()
    ).data as { id: any } | null;
    if (!existing) {
      const { data: inserted, error: tagError } = await db.from("tags").insert({ name, is_deleted: false }).select("id").single();
      if (inserted) {
        existing = inserted as { id: any };
      } else if (String(tagError?.message ?? "").toLowerCase().includes("unique")) {
        const { data: retry } = await db.from("tags").select("id").eq("name", name).eq("is_deleted", false).maybeSingle();
        existing = retry as { id: any } | null;
      } else {
        throw new Error(`tag insert failed: ${tagError?.message}`);
      }
    }
    if (existing && existing.id) tagIds.push(String(existing.id));
  }
  if (tagIds.length > 0) {
    const { error: linkError } = await db.from("document_tags").insert(
      tagIds.map((tid) => ({ document_id: docId, tag_id: tid })),
    );
    if (linkError) throw new Error(`document tags link failed: ${linkError.message}`);
  }

  await writeAudit(ctx?.user ?? null, "UPLOAD_DOCUMENT", MODULE, "Document", docId,
    `Uploaded document: ${str(row.title)} (${str(row.file_name)}, ${row.file_size} bytes)`
      + ` - AI category: ${predictedCategory}, confidence: ${confidence}`,
    ctx ? resolveClientIp(req).ip : null, "INFO");

  const tags = await loadTags(docId);
  const docDto = toDocumentDto({ ...row, tags });
  return jsonResponse(ok(docDto, "Document uploaded, stored and processed by AI"), 200);
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

  await ensureBucket();
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(filePath, 300);
  if (error || !data) {
    return jsonResponse(fail("Failed to generate signed download URL.", "SIGNED_URL_FAILED"), 500);
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
  { method: "POST", path: "/documents", guard: { kind: "auth" }, handler: handleCreateDocument },
  { method: "POST", path: "/documents/upload", guard: { kind: "auth" }, handler: handleUploadDocument },
  { method: "GET", path: "/documents/:id/download", guard: { kind: "auth" }, handler: handleDownloadDocument },
  { method: "GET", path: "/documents/:id/signed-url", guard: { kind: "auth" }, handler: handleGetSignedUrl },
] as const;

Deno.serve(createHandler(routes as never, { name: "documents" }));