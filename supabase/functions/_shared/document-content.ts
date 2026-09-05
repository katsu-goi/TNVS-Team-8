import { strFromU8, unzipSync } from "npm:fflate@0.8.3";
import { getDocumentProxy } from "npm:unpdf@1.8.1";

export const SUPPORTED_DOCUMENT_EXTENSIONS = ["pdf", "docx", "txt"] as const;
export const MAX_EXTRACTABLE_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_EXTRACTED_CHARACTERS = 100_000;
const MAX_PDF_PAGES = 75;
const MAX_DOCX_XML_BYTES = 8 * 1024 * 1024;

export type ExtractionResult = {
  text: string;
  method: "TXT_UTF8" | "PDF_EMBEDDED_TEXT" | "DOCX_XML";
  pageCount: number | null;
  truncated: boolean;
  contentSha256: string;
};

export class DocumentExtractionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DocumentExtractionError";
  }
}

function normalizeText(value: string): { text: string; truncated: boolean } {
  const normalized = value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const truncated = normalized.length > MAX_EXTRACTED_CHARACTERS;
  return {
    text: truncated ? normalized.slice(0, MAX_EXTRACTED_CHARACTERS) : normalized,
    truncated,
  };
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

function extractDocxText(bytes: Uint8Array): string {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => file.name === "word/document.xml" && file.originalSize <= MAX_DOCX_XML_BYTES,
    });
  } catch {
    throw new DocumentExtractionError("INVALID_DOCX", "The DOCX archive could not be read safely.");
  }
  const documentXml = entries["word/document.xml"];
  if (!documentXml) {
    throw new DocumentExtractionError("INVALID_DOCX", "The DOCX file does not contain a readable Word document body.");
  }
  const xml = strFromU8(documentXml);
  const text = xml
    .replace(/<w:tab\b[^>]*\/>/gi, "\t")
    .replace(/<w:br\b[^>]*\/>/gi, "\n")
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeXmlEntities(text);
}

async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pageCount: number }> {
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new DocumentExtractionError("INVALID_PDF", "The uploaded file does not have a valid PDF signature.");
  }
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(bytes.slice(), {
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
    });
  } catch {
    throw new DocumentExtractionError("INVALID_PDF", "The PDF could not be parsed.");
  }
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new DocumentExtractionError(
        "PDF_PAGE_LIMIT_EXCEEDED",
        `PDFs are limited to ${MAX_PDF_PAGES} pages for synchronous content processing.`,
      );
    }
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const parts: string[] = [];
      for (const item of content.items as Array<{ str?: unknown; hasEOL?: unknown }>) {
        if (typeof item.str === "string" && item.str !== "") parts.push(item.str);
        parts.push(item.hasEOL === true ? "\n" : " ");
      }
      pages.push(parts.join(""));
    }
    return { text: pages.join("\n\n"), pageCount: pdf.numPages };
  } finally {
    const destroy = (pdf as { destroy?: () => Promise<unknown> }).destroy;
    if (typeof destroy === "function") await destroy.call(pdf).catch(() => undefined);
  }
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function extractDocumentContent(
  extension: string,
  bytes: Uint8Array,
): Promise<ExtractionResult> {
  if (bytes.byteLength > MAX_EXTRACTABLE_FILE_BYTES) {
    throw new DocumentExtractionError(
      "EXTRACTION_SIZE_LIMIT_EXCEEDED",
      "Files larger than 20MB cannot be processed synchronously.",
    );
  }

  let rawText: string;
  let method: ExtractionResult["method"];
  let pageCount: number | null = null;
  switch (extension.toLowerCase()) {
    case "txt":
      try {
        rawText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new DocumentExtractionError("INVALID_TEXT_ENCODING", "TXT files must contain valid UTF-8 text.");
      }
      method = "TXT_UTF8";
      break;
    case "docx":
      rawText = extractDocxText(bytes);
      method = "DOCX_XML";
      break;
    case "pdf": {
      const result = await extractPdfText(bytes);
      rawText = result.text;
      pageCount = result.pageCount;
      method = "PDF_EMBEDDED_TEXT";
      break;
    }
    default:
      throw new DocumentExtractionError(
        "UNSUPPORTED_CONTENT_FORMAT",
        `Content extraction supports: ${SUPPORTED_DOCUMENT_EXTENSIONS.join(", ")}.`,
      );
  }

  const normalized = normalizeText(rawText);
  if (normalized.text.length < 20) {
    const code = extension.toLowerCase() === "pdf" ? "OCR_REQUIRED" : "INSUFFICIENT_DOCUMENT_TEXT";
    const message = extension.toLowerCase() === "pdf"
      ? "The PDF has insufficient embedded text and requires an OCR-capable ingestion service."
      : "The document does not contain enough extractable text for classification.";
    throw new DocumentExtractionError(code, message);
  }

  return {
    text: normalized.text,
    method,
    pageCount,
    truncated: normalized.truncated,
    contentSha256: await sha256(normalized.text),
  };
}
