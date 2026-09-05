import { apiClient, extractErrorMessage } from './client';
import type {
  DocumentSummary,
  DocumentUploadOptions,
  DocumentBusinessCategory,
  ClassificationReviewDecision,
} from '../types/documents';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_SIZE_BYTES,
} from '../types/documents';

/** Client-side mirror of the backend validation, so obvious mistakes never leave the browser. */
export function validateUploadFile(file: File | null | undefined): string | null {
  if (!file) return 'Please choose a file to upload.';
  if (file.size <= 0) return 'The selected file is empty (0 bytes).';
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return `File exceeds the 20MB synchronous processing limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`;
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!extension || !ALLOWED_UPLOAD_EXTENSIONS.includes(extension as never)) {
    return `File type ".${extension}" is not allowed. Allowed: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}.`;
  }
  return null;
}

/** Relative API path for the authenticated download endpoint. */
export function getDownloadUrl(documentId: string): string {
  const base = apiClient.defaults.baseURL ?? '/api/v1';
  return `${base.replace(/\/$/, '')}/documents/${documentId}/download`;
}

export const documentService = {
  async getDocuments(): Promise<DocumentSummary[]> {
    const { data } = await apiClient.get('/documents');
    return data?.data ?? [];
  },

  async searchDocuments(query: string): Promise<DocumentSummary[]> {
    const { data } = await apiClient.get('/documents/search', { params: { query } });
    return data?.data ?? [];
  },

  async getClassificationCategories(): Promise<DocumentBusinessCategory[]> {
    const { data } = await apiClient.get('/documents/classification-categories');
    return data?.data ?? [];
  },

  async reviewClassification(
    documentId: string,
    decision: ClassificationReviewDecision,
    options: { categoryId?: string; notes?: string } = {},
  ): Promise<DocumentSummary> {
    const { data } = await apiClient.post(`/documents/${documentId}/classification-review`, {
      decision,
      categoryId: options.categoryId,
      notes: options.notes,
    });
    return data?.data as DocumentSummary;
  },

  /**
   * Uploads a real file and returns the persisted document, already enriched
   * with extracted content, AI category, summary, calibrated confidence and auto-tags.
   */
  async uploadDocument(
    file: File,
    options: DocumentUploadOptions = {},
    onProgress?: (percent: number) => void,
  ): Promise<DocumentSummary> {
    const formData = new FormData();
    formData.append('file', file);

    const params: Record<string, string> = {};
    if (options.title) params.title = options.title;
    if (options.categoryId) params.categoryId = options.categoryId;
    if (options.folderId) params.folderId = options.folderId;
    if (options.classificationLevel) params.classificationLevel = options.classificationLevel;

    const { data } = await apiClient.post('/documents/upload', formData, {
      params,
      // Override the client default of application/json; let the browser set
      // the multipart boundary.
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded * 100) / event.total));
        }
      },
    });

    return data?.data as DocumentSummary;
  },

  /**
   * Downloads a stored file. The endpoint is authenticated, so the request
   * goes through apiClient (Bearer token attached) and the blob is saved
   * client-side rather than linking straight to the URL.
   */
  async downloadDocument(documentId: string, fileName?: string): Promise<void> {
    const response = await apiClient.get(`/documents/${documentId}/download`, {
      responseType: 'blob',
    });

    const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
    const link = window.document.createElement('a');
    link.href = blobUrl;
    link.download = fileName || 'document';
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  },
};

export { extractErrorMessage };
