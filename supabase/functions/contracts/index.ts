import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import { naiveIso } from "../_shared/auth-users.ts";
import { writeAudit } from "../_shared/lockout.ts";
import { resolveClientIp } from "../_shared/ip.ts";
import { extractDocumentContent, DocumentExtractionError, SUPPORTED_DOCUMENT_EXTENSIONS } from "../_shared/document-content.ts";
import { analyzeContractContent, ContractAiError } from "../_shared/contract-ai.ts";

const db = adminDb();
const BUCKET = "documents";
const CONTRACT_ROLES = ["CONTRACT_OFFICER", "LEGAL_OFFICER", "LEGAL_COUNSEL"];
const REVIEW_ROLES = ["LEGAL_OFFICER", "LEGAL_COUNSEL"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown> & { id: string };

function str(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function dateStr(value: unknown): string | null {
  return value == null ? null : String(value).slice(0, 10);
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

function isSafeStoragePath(path: string): boolean {
  return path !== "" && !path.startsWith("/") && !path.startsWith("\\") && !path.includes("\\")
    && path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function contractDto(row: Row) {
  return {
    id: row.id,
    contractNumber: row.contract_number ?? null,
    title: row.title ?? null,
    type: row.type ?? null,
    counterParty: row.counter_party ?? null,
    contractValue: num(row.contract_value),
    vendorId: row.vendor_id ?? null,
    startDate: dateStr(row.start_date),
    endDate: dateStr(row.end_date),
    renewalNoticeDate: dateStr(row.renewal_notice_date),
    status: row.status ?? null,
    aiAssessedRiskLevel: row.ai_assessed_risk_level ?? null,
    aiRiskSummary: row.ai_risk_summary ?? null,
    aiAnalysisReviewStatus: row.ai_analysis_review_status ?? "NOT_ANALYZED",
    associatedDocumentId: row.document_id ?? null,
    createdBy: row.created_by ?? null,
    approvedBy: row.approved_by ?? null,
    approvedAt: row.approved_at ?? null,
    activatedBy: row.activated_by ?? null,
    activatedAt: row.activated_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

function analysisDto(row: Row) {
  const data = row.analysis_data && typeof row.analysis_data === "object" ? row.analysis_data as Record<string, unknown> : {};
  return {
    id: row.id,
    contractId: row.contract_id,
    sourceDocumentId: row.source_document_id,
    contentSha256: row.content_sha256,
    extractionMethod: row.extraction_method,
    extractedCharacterCount: num(row.extracted_character_count),
    providerName: row.provider_name,
    model: row.model,
    analyzedAt: row.analyzed_at,
    ...data,
    overallRisk: row.overall_risk,
    confidence: num(row.confidence),
    confidenceMethod: row.confidence_method,
    groundedEvidence: row.grounded_evidence ?? [],
    missingTerms: row.missing_terms ?? [],
    reviewRequired: row.review_required,
    reviewStatus: row.review_status,
    finalData: row.final_data ?? null,
    reviewerEmail: row.reviewer_email ?? null,
    reviewedAt: row.reviewed_at ?? null,
    reviewNotes: row.review_notes ?? null,
    version: num(row.version),
    disclaimer: "AI-assisted contract review requiring authorized human review. This is not legal advice.",
  };
}

function errorResponse(error: unknown): Response {
  if (error instanceof ContractAiError || error instanceof DocumentExtractionError) {
    const status = ["CONTRACT_FILE_NOT_FOUND", "FILE_NOT_FOUND"].includes(error.code) ? 404
      : error.code === "AI_RESPONSE_INVALID" || error.code === "AI_PROVIDER_REQUEST_FAILED" ? 502 : 422;
    return jsonResponse(fail(error.message, error.code), status);
  }
  throw error;
}

async function loadContract(id: string): Promise<Row | null> {
  const { data, error } = await db.from("contracts").select("*").eq("id", id).eq("is_deleted", false).maybeSingle();
  if (error) throw new Error(`contract lookup failed: ${error.message}`);
  return data as Row | null;
}

async function handleListContracts() {
  const { data, error } = await db.from("contracts").select("*").eq("is_deleted", false).order("created_at", { ascending: false });
  if (error) throw new Error(`contracts query failed: ${error.message}`);
  return jsonResponse(ok(((data ?? []) as Row[]).map(contractDto), "Contracts retrieved"), 200);
}

async function handleCreateContract(ctx: AuthContext | null, req: Request, body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>;
  const title = str(input.title)?.trim() ?? "";
  if (!title) return jsonResponse(fail("Contract title is required.", "VALIDATION_ERROR"), 400);
  const contractNumber = str(input.contractNumber)?.trim() || `CTR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const suppliedDocumentId = str(input.documentId) ?? undefined;
  const { data, error } = await db.from("contracts").insert({
    contract_number: contractNumber,
    title,
    type: str(input.type) ?? "VENDOR_SERVICE",
    counter_party: str(input.counterParty),
    contract_value: num(input.contractValue),
    vendor_id: str(input.vendorId),
    start_date: dateStr(input.startDate),
    end_date: dateStr(input.endDate),
    renewal_notice_date: dateStr(input.renewalNoticeDate),
    document_id: isUuid(suppliedDocumentId) ? suppliedDocumentId : null,
    status: "DRAFT",
    ai_assessed_risk_level: null,
    ai_risk_summary: null,
    ai_analysis_review_status: "NOT_ANALYZED",
    created_by: ctx?.email ?? "SYSTEM",
    updated_by: ctx?.email ?? "SYSTEM",
    updated_at: naiveIso(),
  }).select("*").single();
  if (error) throw new Error(`contract insert failed: ${error.message}`);
  const row = data as Row;
  await writeAudit(ctx?.user ?? null, "CREATE_CONTRACT", "CONTRACTS", "Contract", row.id,
    `Created draft contract: ${title}`, ctx ? resolveClientIp(req).ip : null, "INFO");
  return jsonResponse(ok(contractDto(row), "Draft contract created; attach a source document for AI analysis"), 200);
}

async function loadSourceDocument(documentId: string): Promise<{ bytes: Uint8Array; extension: string }> {
  const { data, error } = await db.from("documents").select("*").eq("id", documentId).eq("is_deleted", false).maybeSingle();
  if (error) throw new Error(`source document lookup failed: ${error.message}`);
  if (!data) throw new ContractAiError("CONTRACT_FILE_NOT_FOUND", "The contract source document does not exist.");
  const row = data as Row;
  const extension = extensionOf(str(row.file_name) ?? "");
  if (!(SUPPORTED_DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new DocumentExtractionError("UNSUPPORTED_CONTENT_FORMAT", "Contract analysis supports TXT, DOCX, and machine-readable PDF files.");
  }
  const path = str(row.file_path)?.trim() ?? "";
  if (!isSafeStoragePath(path)) {
    throw new ContractAiError("CONTRACT_FILE_NOT_FOUND", "The contract does not reference a valid private Storage object.");
  }
  const { data: blob, error: downloadError } = await db.storage.from(BUCKET).download(path);
  if (downloadError || !blob) throw new ContractAiError("FILE_NOT_FOUND", "The stored contract file is unavailable.");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), extension };
}

async function handleAnalyzeContract(ctx: AuthContext | null, req: Request, body: unknown, params: RouteParams) {
  if (!isUuid(params.id)) return jsonResponse(fail("Invalid contract identifier.", "VALIDATION_ERROR"), 400);
  const contract = await loadContract(params.id);
  if (!contract) return jsonResponse(fail("Contract not found.", "RESOURCE_NOT_FOUND"), 404);
  const input = (body ?? {}) as Record<string, unknown>;
  const documentId = str(input.documentId)?.trim() || str(contract.document_id)?.trim() || "";
  if (!isUuid(documentId)) {
    return jsonResponse(fail("Attach a valid source document before Contract AI analysis.", "CONTRACT_FILE_NOT_FOUND"), 404);
  }

  try {
    const source = await loadSourceDocument(documentId);
    const extraction = await extractDocumentContent(source.extension, source.bytes);
    const analysis = await analyzeContractContent(db, extraction.text, extraction.method);
    const versionResult = await db.from("contract_ai_analyses").select("version")
      .eq("contract_id", params.id).order("version", { ascending: false }).limit(1).maybeSingle();
    if (versionResult.error) throw new Error(`analysis version lookup failed: ${versionResult.error.message}`);
    const version = Number(versionResult.data?.version ?? 0) + 1;
    const { data: saved, error } = await db.from("contract_ai_analyses").insert({
      contract_id: params.id,
      source_document_id: documentId,
      content_sha256: extraction.contentSha256,
      extraction_method: extraction.method,
      extracted_character_count: analysis.inputCharacterCount,
      provider_id: analysis.providerId,
      provider_name: analysis.providerName,
      model: analysis.model,
      analyzed_at: analysis.analyzedAt,
      analysis_data: analysis.analysisData,
      overall_risk: analysis.overallRisk,
      confidence: analysis.confidence,
      confidence_method: analysis.confidenceMethod,
      grounded_evidence: analysis.groundedEvidence,
      missing_terms: analysis.missingTerms,
      review_required: true,
      review_status: "PENDING",
      version,
    }).select("*").single();
    if (error) throw new Error(`contract analysis persistence failed: ${error.message}`);
    const analysisRow = saved as Row;
    const updateResult = await db.from("contracts").update({
      document_id: documentId,
      ai_analysis_review_status: "PENDING",
      updated_at: naiveIso(),
      updated_by: ctx?.email ?? "SYSTEM",
    }).eq("id", params.id);
    if (updateResult.error) {
      await db.from("contract_ai_analyses").delete().eq("id", analysisRow.id);
      throw new Error(`contract source linkage failed: ${updateResult.error.message}`);
    }
    await writeAudit(ctx?.user ?? null, "ANALYZE_CONTRACT_CONTENT", "CONTRACTS", "Contract", params.id,
      `Generated grounded Contract AI analysis version ${version} (provider=${analysis.providerName}, model=${analysis.model}, risk=${analysis.overallRisk}, confidence=${analysis.confidence})`,
      ctx ? resolveClientIp(req).ip : null, "INFO");
    return jsonResponse(ok(analysisDto(analysisRow), "Contract content analyzed; authorized human review is required"), 200);
  } catch (error) {
    return errorResponse(error);
  }
}

async function handleGetLatestAnalysis(_ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  if (!isUuid(params.id)) return jsonResponse(fail("Invalid contract identifier.", "VALIDATION_ERROR"), 400);
  const contract = await loadContract(params.id);
  if (!contract) return jsonResponse(fail("Contract not found.", "RESOURCE_NOT_FOUND"), 404);
  const { data, error } = await db.from("contract_ai_analyses").select("*")
    .eq("contract_id", params.id).order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`contract analysis lookup failed: ${error.message}`);
  if (!data) return jsonResponse(fail("No Contract AI analysis exists for this contract.", "CONTRACT_AI_ANALYSIS_NOT_FOUND"), 404);
  return jsonResponse(ok(analysisDto(data as Row), "Latest Contract AI analysis retrieved"), 200);
}

function validCorrection(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const serialized = JSON.stringify(value);
  const data = value as Record<string, unknown>;
  return serialized.length <= 80_000 && typeof data.summary === "string"
    && ["LOW", "MEDIUM", "HIGH"].includes(String(data.overallRisk ?? ""))
    && Array.isArray(data.parties) && Array.isArray(data.dates)
    && Array.isArray(data.obligations) && Array.isArray(data.clauses) && Array.isArray(data.risks);
}

async function handleReviewAnalysis(ctx: AuthContext | null, req: Request, body: unknown, params: RouteParams) {
  if (!isUuid(params.id)) return jsonResponse(fail("Invalid contract identifier.", "VALIDATION_ERROR"), 400);
  const contract = await loadContract(params.id);
  if (!contract) return jsonResponse(fail("Contract not found.", "RESOURCE_NOT_FOUND"), 404);
  if (contract.status !== "UNDER_REVIEW") {
    return jsonResponse(fail("Contract AI review is available only after the Contract Officer submits the contract for review.", "BUSINESS_RULE_VIOLATION"), 422);
  }
  if (str(contract.created_by)?.toLowerCase() === ctx?.email.toLowerCase()) {
    return jsonResponse(fail("The contract creator cannot review their own Contract AI analysis.", "SEPARATION_OF_DUTIES_VIOLATION"), 403);
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const decision = str(input.decision)?.trim().toUpperCase() ?? "";
  if (!["APPROVE", "CORRECT", "REJECT"].includes(decision)) {
    return jsonResponse(fail("Decision must be APPROVE, CORRECT, or REJECT.", "VALIDATION_ERROR"), 400);
  }
  const { data: latest, error } = await db.from("contract_ai_analyses").select("*")
    .eq("contract_id", params.id).order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`contract analysis lookup failed: ${error.message}`);
  if (!latest) return jsonResponse(fail("No Contract AI analysis exists for this contract.", "CONTRACT_AI_ANALYSIS_NOT_FOUND"), 404);
  const finalData = decision === "CORRECT" ? input.correctedData : null;
  if (decision === "CORRECT" && !validCorrection(finalData)) {
    return jsonResponse(fail("Corrected data must contain the complete validated analysis structure.", "VALIDATION_ERROR"), 400);
  }
  const { data: result, error: reviewError } = await db.rpc("review_contract_ai_analysis", {
    p_analysis_id: String(latest.id), p_decision: decision, p_final_data: finalData,
    p_reviewer_email: ctx?.email ?? "", p_notes: str(input.notes),
  });
  if (reviewError) {
    const message = reviewError.message.includes("ALREADY_REVIEWED") ? "This Contract AI analysis has already been reviewed." : "The Contract AI review could not be recorded.";
    return jsonResponse(fail(message, "CONTRACT_AI_REVIEW_FAILED"), 422);
  }
  await writeAudit(ctx?.user ?? null, `${decision}_CONTRACT_AI_ANALYSIS`, "CONTRACTS", "Contract", params.id,
    `${decision} Contract AI analysis version ${latest.version}`, ctx ? resolveClientIp(req).ip : null, "INFO");
  return jsonResponse(ok(result, "Contract AI review recorded"), 200);
}

async function handleListObligations(_ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  if (!isUuid(params.id)) return jsonResponse(fail("Invalid contract identifier.", "VALIDATION_ERROR"), 400);
  const { data, error } = await db.from("contract_obligations").select("*")
    .eq("contract_id", params.id).order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`contract obligations lookup failed: ${error.message}`);
  return jsonResponse(ok(data ?? [], "Reviewed contract obligations retrieved"), 200);
}

async function handleDeleteContract(ctx: AuthContext | null, req: Request, _body: unknown, params: RouteParams) {
  if (!isUuid(params.id)) return jsonResponse(fail("Invalid contract identifier.", "VALIDATION_ERROR"), 400);
  const contract = await loadContract(params.id);
  if (!contract) return jsonResponse(fail("Contract not found.", "RESOURCE_NOT_FOUND"), 404);
  if (str(contract.created_by)?.toLowerCase() !== ctx?.email.toLowerCase()) {
    return jsonResponse(fail("Only the contract creator can delete this draft or terminated contract.", "ACCESS_DENIED"), 403);
  }
  if (!["DRAFT", "TERMINATED"].includes(String(contract.status))) {
    return jsonResponse(fail("Only draft or terminated contracts can be deleted.", "BUSINESS_RULE_VIOLATION"), 422);
  }
  const documentId = str(contract.document_id);
  let source: Row | null = null;
  if (documentId) {
    const sourceResult = await db.from("documents").select("*").eq("id", documentId).maybeSingle();
    if (sourceResult.error) throw new Error(`source document cleanup lookup failed: ${sourceResult.error.message}`);
    source = sourceResult.data as Row | null;
  }
  await writeAudit(ctx?.user ?? null, "DELETE_CONTRACT", "CONTRACTS", "Contract", params.id,
    `Deleted draft or terminated contract: ${str(contract.title)}`, ctx ? resolveClientIp(req).ip : null, "INFO");
  const { error } = await db.from("contracts").delete().eq("id", params.id);
  if (error) throw new Error(`contract deletion failed: ${error.message}`);

  let sourceDocumentDeleted = false;
  if (documentId && source && str(source.created_by)?.toLowerCase() === ctx?.email.toLowerCase()) {
    const links = await db.from("contracts").select("id", { count: "exact", head: true }).eq("document_id", documentId);
    if (links.error) throw new Error(`source document reference check failed: ${links.error.message}`);
    if ((links.count ?? 0) === 0) {
      const path = str(source.file_path)?.trim() ?? "";
      const archiveLinks = await db.from("records_archives").select("id", { count: "exact", head: true }).eq("document_id", documentId);
      if (archiveLinks.error) throw new Error(`source archive reference check failed: ${archiveLinks.error.message}`);
      if ((archiveLinks.count ?? 0) > 0) {
        return jsonResponse(ok({ contractDeleted: true, sourceDocumentDeleted: false }, "Contract deleted; retained source document remains under records custody"), 200);
      }
      const tagDelete = await db.from("document_tags").delete().eq("document_id", documentId);
      if (tagDelete.error) throw new Error(`source document tag cleanup failed: ${tagDelete.error.message}`);
      const classificationDelete = await db.from("document_ai_classifications").delete().eq("document_id", documentId);
      if (classificationDelete.error) throw new Error(`source document AI cleanup failed: ${classificationDelete.error.message}`);
      const documentDelete = await db.from("documents").delete().eq("id", documentId);
      if (documentDelete.error) throw new Error(`source document deletion failed: ${documentDelete.error.message}`);
      if (isSafeStoragePath(path)) {
        const removal = await db.storage.from(BUCKET).remove([path]);
        if (removal.error && !String(removal.error.message ?? "").toLowerCase().includes("not found")) {
          throw new Error(`source document storage cleanup failed: ${removal.error.message}`);
        }
      }
      sourceDocumentDeleted = true;
    }
  }
  return jsonResponse(ok({ contractDeleted: true, sourceDocumentDeleted }, "Contract and eligible private source data deleted"), 200);
}

const routes = [
  { method: "GET", path: "/contracts", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleListContracts },
  { method: "POST", path: "/contracts", guard: { kind: "roles", roles: ["CONTRACT_OFFICER"] }, handler: handleCreateContract },
  { method: "POST", path: "/contracts/:id/analyze", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleAnalyzeContract },
  { method: "GET", path: "/contracts/:id/analysis", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleGetLatestAnalysis },
  { method: "POST", path: "/contracts/:id/analysis-review", guard: { kind: "roles", roles: REVIEW_ROLES }, handler: handleReviewAnalysis },
  { method: "GET", path: "/contracts/:id/obligations", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleListObligations },
  { method: "DELETE", path: "/contracts/:id", guard: { kind: "roles", roles: ["CONTRACT_OFFICER"] }, handler: handleDeleteContract },
] as const;

Deno.serve(createHandler(routes as never, { name: "contracts" }));
