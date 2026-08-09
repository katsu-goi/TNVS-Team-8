/**
 * Types for the document upload pipeline (POST /v1/documents/upload).
 * Mirrors the backend Document entity plus its AI enrichment fields.
 */

export type DocumentStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'ARCHIVED'
  | 'DELETED';

export type ClassificationLevel =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'CONFIDENTIAL'
  | 'RESTRICTED'
  | 'SECRET';

export interface DocumentTag {
  id: string;
  name: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  fileName: string;
  fileType?: string | null;
  fileSize?: number | null;
  filePath?: string | null;
  status: DocumentStatus;
  classificationLevel: ClassificationLevel;
  versionNumber?: number | null;

  /** AI pipeline output */
  ocrExtractedText?: string | null;
  aiSummary?: string | null;
  aiPredictedCategory?: string | null;
  /** 0.00 - 1.00 */
  confidenceScore?: number | null;

  tags?: DocumentTag[];
  category?: { id: string; name: string } | null;
  folder?: { id: string; name: string; path?: string } | null;

  createdAt?: string | null;
  createdBy?: string | null;
}

/** Optional metadata accepted alongside the file. */
export interface DocumentUploadOptions {
  title?: string;
  categoryId?: string;
  folderId?: string;
  classificationLevel?: ClassificationLevel;
}

/** File types the backend accepts. */
export const ALLOWED_UPLOAD_EXTENSIONS = [
  'pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx', 'txt',
] as const;

/** Ready-to-use value for an <input type="file"> accept attribute. */
export const UPLOAD_ACCEPT_ATTRIBUTE = ALLOWED_UPLOAD_EXTENSIONS
  .map((ext) => `.${ext}`)
  .join(',');

export const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;
