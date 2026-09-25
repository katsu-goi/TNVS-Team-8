import { createHandler, AuthContext } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { fail, ok } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import {
  DocumentExtractionError,
  extractDocumentContent,
  validateDocumentUpload,
  MAX_EXTRACTABLE_FILE_BYTES,
  SUPPORTED_DOCUMENT_EXTENSIONS,
} from "../_shared/document-content.ts";
import { classifyDocumentContent, DocumentAiError } from "../_shared/document-ai.ts";

const db = adminDb();

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function titleCase(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (character) => character.toUpperCase());
}

function firstMetadata(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return "";
}

function buildSuggestedTitle(analysis: { detectedDocumentType: string; predictedCategoryName: string; metadataSuggestions: Record<string, string | string[]> }): string {
  const metadata = analysis.metadataSuggestions ?? {};
  const type = titleCase(analysis.detectedDocumentType || analysis.predictedCategoryName || "Facility Document");
  const date = firstMetadata(metadata.documentDate);
  const department = firstMetadata(metadata.department);
  const location = firstMetadata(metadata.location) || firstMetadata(metadata.hub);
  const suffix = [date, department || location].filter(Boolean).slice(0, 2);
  return `${type}${suffix.length ? ` - ${suffix.join(" - ")}` : ""}`.slice(0, 180);
}

async function handleSuggestTitle(_ctx: AuthContext | null, req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonResponse(fail("No file was supplied.", "INVALID_UPLOAD"), 400);
  if (file.size <= 0) return jsonResponse(fail("The selected file is empty.", "INVALID_UPLOAD"), 400);
  if (file.size > MAX_EXTRACTABLE_FILE_BYTES) return jsonResponse(fail("Files larger than 20MB cannot be processed synchronously.", "INVALID_UPLOAD"), 400);
  const extension = extensionOf(file.name);
  if (!SUPPORTED_DOCUMENT_EXTENSIONS.includes(extension as typeof SUPPORTED_DOCUMENT_EXTENSIONS[number])) {
    return jsonResponse(fail(`File type '.${extension}' is not supported.`, "INVALID_UPLOAD"), 400);
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    validateDocumentUpload(extension, file.type, bytes);
    const extraction = await extractDocumentContent(extension, bytes);
    const { result: analysis } = await classifyDocumentContent(db, extraction.text, extraction.method);
    return jsonResponse(ok({
      suggestedTitle: buildSuggestedTitle(analysis),
      summary: analysis.summary,
      detectedDocumentType: analysis.detectedDocumentType,
      confidence: analysis.confidence,
      extractionMethod: extraction.method,
    }, "AI document title suggested"), 200);
  } catch (error) {
    if (error instanceof DocumentExtractionError || error instanceof DocumentAiError) {
      return jsonResponse(fail(error.message, error.code), 422);
    }
    throw error;
  }
}

const routes = [
  { method: "POST", path: "/suggest", guard: { kind: "auth" }, handler: handleSuggestTitle },
] as const;

Deno.serve(createHandler(routes as never, { name: "document-title-suggest" }));
