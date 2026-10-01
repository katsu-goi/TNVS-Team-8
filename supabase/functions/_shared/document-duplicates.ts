export const DOCUMENT_DUPLICATE_DETECTOR_VERSION = "hirna-document-duplicate-v1";
export const MIN_MEANINGFUL_OCR_CHARACTERS = 80;
export const MAX_DUPLICATE_MATCHES = 5;

export type DuplicateConfidence = "EXACT" | "HIGH_CONFIDENCE" | "POSSIBLE_DUPLICATE" | "NO_DUPLICATE" | "UNAVAILABLE";
export type DuplicateMatchType =
  | "EXACT_FILE_DUPLICATE"
  | "EXACT_OCR_DUPLICATE"
  | "POSSIBLE_DUPLICATE_DOCUMENT_NUMBER"
  | "NEAR_DUPLICATE"
  | "POSSIBLE_NEW_VERSION"
  | "POSSIBLE_RELATED_DOCUMENT";

export type DuplicateDocumentSignal = {
  fileSha256?: string | null;
  ocrNormalizedSha256?: string | null;
  ocrText?: string | null;
  title?: string | null;
  documentNumber?: string | null;
  documentType?: string | null;
  classificationLevel?: string | null;
  effectiveDate?: string | null;
  versionNumber?: string | number | null;
};

export type DuplicateCandidate = DuplicateDocumentSignal & {
  id: string;
  fileName?: string | null;
  status?: string | null;
  ownerEmail?: string | null;
  department?: string | null;
  createdAt?: string | null;
  documentLocation?: string | null;
};

export type DuplicateMatch = {
  documentId: string;
  title: string;
  fileName: string | null;
  status: string | null;
  ownerEmail: string | null;
  department: string | null;
  uploadedAt: string | null;
  documentLocation: string | null;
  documentNumber: string | null;
  documentType: string | null;
  classificationLevel: string | null;
  effectiveDate: string | null;
  versionNumber: string | number | null;
  matchType: DuplicateMatchType;
  confidence: Exclude<DuplicateConfidence, "NO_DUPLICATE" | "UNAVAILABLE">;
  textSimilarityPercent: number | null;
  reasons: string[];
  ocrExcerpt: string | null;
};

export type DuplicateDetectionResult = {
  confidence: DuplicateConfidence;
  status: DuplicateConfidence;
  checkedAt: string;
  detectorVersion: string;
  contentCheck: "COMPLETE" | "NOT_RUN_OCR_UNAVAILABLE" | "NOT_RUN_INSUFFICIENT_TEXT";
  message: string;
  matches: DuplicateMatch[];
};

const GENERIC_TOKENS = new Set([
  "hirna", "facilities", "department", "approved", "approval", "date", "signature", "signed",
  "document", "page", "form", "office", "management", "administrative", "name", "address",
  "the", "and", "for", "with", "from", "this", "that", "are", "was", "were", "has", "have",
]);

export function normalizeOcrText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—−]/g, "-")
    .replace(/\u0000/g, "")
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/\s*([:/#%.,()_-])\s*/g, "$1")
    .trim();
}

export function normalizeIdentifier(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length >= 4 ? normalized : null;
}

function words(value: string): string[] {
  return normalizeOcrText(value).match(/[\p{L}\p{N}][\p{L}\p{N}._/#%-]*/gu) ?? [];
}

export function isMeaningfulOcrText(value: string | null | undefined): boolean {
  const normalized = normalizeOcrText(value ?? "");
  if (normalized.length < MIN_MEANINGFUL_OCR_CHARACTERS) return false;
  const tokens = words(normalized);
  const meaningful = new Set(tokens.filter((token) => token.length >= 3 && !GENERIC_TOKENS.has(token)));
  const replacementCharacters = (normalized.match(/�/g) ?? []).length;
  const alphaNumericCharacters = (normalized.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return meaningful.size >= 8
    && replacementCharacters / Math.max(1, normalized.length) <= 0.02
    && alphaNumericCharacters / Math.max(1, normalized.length) >= 0.45;
}

function shingles(value: string): Set<string> {
  const tokens = words(value);
  const result = new Set<string>();
  if (tokens.length < 3) return result;
  for (let index = 0; index <= tokens.length - 3; index++) {
    result.add(`${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`);
    if (result.size >= 4_000) break;
  }
  return result;
}

function jaccard(left: Set<string>, right: Set<string>): number | null {
  if (left.size === 0 || right.size === 0) return null;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection++;
  return intersection / (left.size + right.size - intersection);
}

export function ocrTextSimilarity(left: string | null | undefined, right: string | null | undefined): number | null {
  if (!isMeaningfulOcrText(left) || !isMeaningfulOcrText(right)) return null;
  return jaccard(shingles(left ?? ""), shingles(right ?? ""));
}

export function titleSimilarity(left: string | null | undefined, right: string | null | undefined): number {
  const leftTokens = new Set(words(left ?? "").filter((token) => !GENERIC_TOKENS.has(token)));
  const rightTokens = new Set(words(right ?? "").filter((token) => !GENERIC_TOKENS.has(token)));
  return jaccard(leftTokens, rightTokens) ?? 0;
}

async function sha256Hex(input: BufferSource): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fileSha256(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  return sha256Hex(copy.buffer);
}

export async function normalizedOcrSha256(value: string): Promise<string | null> {
  const normalized = normalizeOcrText(value);
  if (!isMeaningfulOcrText(normalized)) return null;
  return sha256Hex(new TextEncoder().encode(normalized).buffer);
}

function cleanMetadataValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const cleaned = String(value).trim().slice(0, 240);
  return cleaned || null;
}

function metadataValue(metadata: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  for (const key of keys) {
    const value = cleanMetadataValue(metadata?.[key]);
    if (value) return value;
  }
  return null;
}

export function extractDuplicateMetadata(
  metadata: Record<string, unknown> | null | undefined,
  ocrText: string | null | undefined,
): { documentNumber: string | null; effectiveDate: string | null; versionNumber: string | null } {
  const text = normalizeOcrText(ocrText ?? "");
  const numberFromMetadata = metadataValue(metadata, ["documentNumber", "document_number", "referenceNumber", "contractNumber"]);
  const numberMatch = text.match(/\b(?:document|reference|contract|memo|policy|agreement)\s*(?:no\.?|number|#)\s*[:#-]?\s*([a-z0-9][a-z0-9./_-]{3,})/i);
  const effectiveDate = metadataValue(metadata, ["effectiveDate", "effective_date"]);
  const versionFromMetadata = metadataValue(metadata, ["versionNumber", "version_number", "revision"]);
  const versionMatch = text.match(/\b(?:version|revision|rev\.?)(?:\s*(?:no\.?|number))?\s*[:#-]?\s*([a-z0-9][a-z0-9.-]{0,15})/i);
  return {
    documentNumber: numberFromMetadata ?? numberMatch?.[1] ?? null,
    effectiveDate,
    versionNumber: versionFromMetadata ?? versionMatch?.[1] ?? null,
  };
}

function sameValue(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = String(left ?? "").trim().toLowerCase();
  const b = String(right ?? "").trim().toLowerCase();
  return a !== "" && a === b;
}

function excerpt(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 600) : null;
}

function confidenceRank(value: DuplicateMatch["confidence"]): number {
  if (value === "EXACT") return 3;
  if (value === "HIGH_CONFIDENCE") return 2;
  return 1;
}

function classifyCandidate(source: DuplicateDocumentSignal, candidate: DuplicateCandidate): DuplicateMatch | null {
  const sameFile = !!source.fileSha256 && source.fileSha256 === candidate.fileSha256;
  const bothOcrMeaningful = isMeaningfulOcrText(source.ocrText) && isMeaningfulOcrText(candidate.ocrText);
  const sameOcr = bothOcrMeaningful && (
    (!!source.ocrNormalizedSha256 && source.ocrNormalizedSha256 === candidate.ocrNormalizedSha256)
    || normalizeOcrText(source.ocrText ?? "") === normalizeOcrText(candidate.ocrText ?? "")
  );
  const sourceNumber = normalizeIdentifier(source.documentNumber);
  const candidateNumber = normalizeIdentifier(candidate.documentNumber);
  const sameDocumentNumber = !!sourceNumber && sourceNumber === candidateNumber;
  const sourceVersion = source.versionNumber == null ? null : String(source.versionNumber).normalize("NFKC").trim().toLowerCase();
  const candidateVersion = candidate.versionNumber == null ? null : String(candidate.versionNumber).normalize("NFKC").trim().toLowerCase();
  const differentVersion = !!sourceVersion && !!candidateVersion && sourceVersion !== candidateVersion;
  const differentEffectiveDate = !!source.effectiveDate && !!candidate.effectiveDate
    && source.effectiveDate !== candidate.effectiveDate;
  const sameType = sameValue(source.documentType, candidate.documentType);
  const sameClassification = sameValue(source.classificationLevel, candidate.classificationLevel);
  const textSimilarity = ocrTextSimilarity(source.ocrText, candidate.ocrText);
  const titleScore = titleSimilarity(source.title, candidate.title);
  const reasons: string[] = [];
  let matchType: DuplicateMatchType;
  let confidence: Exclude<DuplicateConfidence, "NO_DUPLICATE" | "UNAVAILABLE">;

  if (sameFile) {
    matchType = "EXACT_FILE_DUPLICATE";
    confidence = "EXACT";
    reasons.push("Identical SHA-256 file hash");
  } else if ((differentVersion || differentEffectiveDate)
      && (sameDocumentNumber || titleScore >= 0.65 || (textSimilarity ?? 0) >= 0.6)) {
    matchType = "POSSIBLE_NEW_VERSION";
    confidence = "POSSIBLE_DUPLICATE";
    reasons.push(differentVersion ? "A different explicit version was detected" : "The effective date differs");
  } else if (sameOcr) {
    matchType = "EXACT_OCR_DUPLICATE";
    confidence = "EXACT";
    reasons.push("Identical normalized OCR content hash");
  } else if ((textSimilarity ?? 0) >= 0.92 || (sameDocumentNumber && (textSimilarity ?? 0) >= 0.72)) {
    matchType = "NEAR_DUPLICATE";
    confidence = "HIGH_CONFIDENCE";
    reasons.push("Substantially similar meaningful OCR content");
  } else if (sameDocumentNumber) {
    matchType = "POSSIBLE_DUPLICATE_DOCUMENT_NUMBER";
    confidence = "POSSIBLE_DUPLICATE";
    reasons.push("The same authoritative document number was detected");
  } else if (((textSimilarity ?? 0) >= 0.78 && (titleScore >= 0.45 || sameType || sameClassification))
      || (titleScore >= 0.82 && (sameType || sameClassification))) {
    matchType = "POSSIBLE_RELATED_DOCUMENT";
    confidence = "POSSIBLE_DUPLICATE";
    reasons.push((textSimilarity ?? 0) >= 0.78 ? "Similar meaningful OCR content" : "Highly similar document title");
  } else {
    return null;
  }

  if (sameDocumentNumber && !reasons.some((reason) => reason.includes("document number"))) reasons.push("Same document number");
  if (sameType) reasons.push("Same detected document type");
  if (sameClassification) reasons.push("Same document classification");
  if (titleScore >= 0.65) reasons.push("Similar document title");
  if (textSimilarity != null && !reasons.some((reason) => reason.includes("OCR content"))) {
    reasons.push(`${Math.round(textSimilarity * 100)}% meaningful OCR-text similarity`);
  }

  return {
    documentId: candidate.id,
    title: candidate.title?.trim() || "Untitled document",
    fileName: candidate.fileName ?? null,
    status: candidate.status ?? null,
    ownerEmail: candidate.ownerEmail ?? null,
    department: candidate.department ?? null,
    uploadedAt: candidate.createdAt ?? null,
    documentLocation: candidate.documentLocation ?? null,
    documentNumber: candidate.documentNumber ?? null,
    documentType: candidate.documentType ?? null,
    classificationLevel: candidate.classificationLevel ?? null,
    effectiveDate: candidate.effectiveDate ?? null,
    versionNumber: candidate.versionNumber ?? null,
    matchType,
    confidence,
    textSimilarityPercent: textSimilarity == null ? null : Math.round(textSimilarity * 100),
    reasons: Array.from(new Set(reasons)),
    ocrExcerpt: excerpt(candidate.ocrText),
  };
}

export function detectDocumentDuplicates(
  source: DuplicateDocumentSignal,
  candidates: DuplicateCandidate[],
  options: { ocrUnavailable?: boolean } = {},
): DuplicateDetectionResult {
  const matches = candidates
    .map((candidate) => classifyCandidate(source, candidate))
    .filter((match): match is DuplicateMatch => match != null)
    .sort((left, right) => confidenceRank(right.confidence) - confidenceRank(left.confidence)
      || (right.textSimilarityPercent ?? -1) - (left.textSimilarityPercent ?? -1)
      || left.title.localeCompare(right.title))
    .slice(0, MAX_DUPLICATE_MATCHES);
  const confidence: DuplicateConfidence = matches[0]?.confidence ?? "NO_DUPLICATE";
  const meaningful = isMeaningfulOcrText(source.ocrText);
  const contentCheck = options.ocrUnavailable
    ? "NOT_RUN_OCR_UNAVAILABLE"
    : meaningful ? "COMPLETE" : "NOT_RUN_INSUFFICIENT_TEXT";
  const message = confidence === "EXACT"
    ? "An identical file or normalized OCR document already exists in your authorized repository."
    : confidence === "HIGH_CONFIDENCE"
      ? "A high-confidence duplicate candidate requires review."
      : confidence === "POSSIBLE_DUPLICATE"
        ? "One or more possible duplicate or related-version candidates require review."
        : contentCheck === "COMPLETE"
          ? "No existing authorized document matched this upload."
          : "Content-based duplicate detection was not run because meaningful OCR text was unavailable.";
  return {
    confidence,
    status: confidence,
    checkedAt: new Date().toISOString(),
    detectorVersion: DOCUMENT_DUPLICATE_DETECTOR_VERSION,
    contentCheck,
    message,
    matches,
  };
}
