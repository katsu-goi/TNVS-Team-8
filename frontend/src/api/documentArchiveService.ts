import { apiClient } from './client';
import { documentService } from './documentService';

export type ArchiveAccess = {
  metadata: boolean;
  view: boolean;
  download: boolean;
  print: boolean;
  share: boolean;
  requestAccess: boolean;
  editMetadata: boolean;
  classify: boolean;
  archive: boolean;
  restore: boolean;
  manageRetention: boolean;
};

export type ArchiveDepartment = {
  id: string;
  name: string;
  status: string;
  authorizedDocumentCount: number;
  activeDocumentCount: number;
  archivedDocumentCount: number;
  restrictedDocumentCount: number;
  lastUpdatedAt: string | null;
};

export type ArchiveDocument = {
  id: string;
  title: string;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  documentType: string | null;
  documentNumber: string | null;
  department: { id: string | null; name: string | null; status: string | null };
  ownerEmail: string | null;
  classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED' | 'HIGHLY_RESTRICTED';
  archiveStatus: string;
  retentionStatus: string | null;
  retentionPolicy: { id: string; name: string; periodDays: number | null; actionOnExpiry: string | null } | null;
  retentionStartDate: string | null;
  retentionReviewDate: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  version: number | null;
  uploadedAt: string | null;
  updatedAt: string | null;
  aiClassificationStatus: 'HUMAN_CONFIRMED' | 'AI_SUGGESTED' | 'UNAVAILABLE';
  ocrStatus: 'AVAILABLE' | 'UNAVAILABLE';
  viewerKind: 'PDF' | 'IMAGE' | 'TEXT' | 'UNSUPPORTED';
  tags: Array<{ id: string; name: string }>;
  access: ArchiveAccess;
  ocrText?: string | null;
  aiSummary?: string | null;
};

export type ArchiveFilters = {
  departmentId?: string;
  search?: string;
  classification?: string;
  documentType?: string;
  archiveStatus?: string;
  retentionStatus?: string;
  owner?: string;
  aiStatus?: string;
  ocrStatus?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type DocumentAccessRequest = {
  id: string;
  documentId: string;
  documentTitle: string | null;
  classification: string;
  department: string | null;
  requesterEmail: string;
  requestedActions: string[];
  reason: string;
  routedApproverRole: string;
  status: string;
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type ArchiveViewerFile = {
  blob: Blob;
  expiresAt: string;
  contentType: string;
  fileName: string | null;
};

export class DocumentViewerError extends Error {
  constructor(
    public readonly code: 'ACCESS_DENIED' | 'FILE_NOT_FOUND' | 'SIGNED_URL_EXPIRED' | 'INVALID_DOCUMENT_RESPONSE' | 'VIEWER_UNAVAILABLE',
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'DocumentViewerError';
  }
}

type SignedViewerUrl = {
  signedUrl: string;
  expiresAt: string;
  contentType: string | null;
  fileName: string | null;
};

async function requestViewerUrl(documentId: string, signal?: AbortSignal): Promise<SignedViewerUrl> {
  const { data } = await apiClient.get(`/documents/${documentId}/signed-url`, { signal });
  return data?.data;
}

async function readBlobPrefix(blob: Blob, byteLength: number): Promise<Uint8Array> {
  const prefix = blob.slice(0, byteLength);
  if (typeof prefix.arrayBuffer === 'function') {
    return new Uint8Array(await prefix.arrayBuffer());
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Unable to inspect the document file.'));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(prefix);
  });
}

async function fetchSignedViewerFile(
  documentId: string,
  viewerKind: 'PDF' | 'IMAGE',
  signal?: AbortSignal,
  refreshed = false,
): Promise<ArchiveViewerFile> {
  const source = await requestViewerUrl(documentId, signal);
  let response: Response;
  try {
    response = await fetch(source.signedUrl, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new DocumentViewerError('VIEWER_UNAVAILABLE', 'Unable to load the document. Try again.');
  }

  if (!response.ok) {
    if ([400, 401, 403].includes(response.status) && !refreshed) {
      return fetchSignedViewerFile(documentId, viewerKind, signal, true);
    }
    if ([400, 401, 403].includes(response.status)) {
      throw new DocumentViewerError('SIGNED_URL_EXPIRED', 'The secure document link expired. Try again.', response.status);
    }
    if (response.status === 404) {
      throw new DocumentViewerError(
        'FILE_NOT_FOUND',
        viewerKind === 'PDF' ? 'The PDF file could not be found.' : 'The document file could not be found.',
        404,
      );
    }
    throw new DocumentViewerError('VIEWER_UNAVAILABLE', 'Unable to load the document. Try again.', response.status);
  }

  const responseType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (responseType === 'application/json' || responseType === 'text/html') {
    throw new DocumentViewerError('INVALID_DOCUMENT_RESPONSE', 'The server did not return a valid document file.', response.status);
  }

  const received = await response.blob();
  if (viewerKind === 'PDF') {
    const signature = await readBlobPrefix(received, 5);
    const isPdf = signature.length === 5
      && signature[0] === 0x25
      && signature[1] === 0x50
      && signature[2] === 0x44
      && signature[3] === 0x46
      && signature[4] === 0x2d;
    if (!isPdf) {
      throw new DocumentViewerError('INVALID_DOCUMENT_RESPONSE', 'The server did not return a valid PDF file.', response.status);
    }
    return {
      blob: new Blob([received], { type: 'application/pdf' }),
      expiresAt: source.expiresAt,
      contentType: 'application/pdf',
      fileName: source.fileName,
    };
  }

  const declaredType = (source.contentType || '').split(';', 1)[0].trim().toLowerCase();
  const imageType = responseType.startsWith('image/') ? responseType : declaredType.startsWith('image/') ? declaredType : '';
  if (!imageType) {
    throw new DocumentViewerError('INVALID_DOCUMENT_RESPONSE', 'The server did not return a valid image file.', response.status);
  }
  return {
    blob: new Blob([received], { type: imageType }),
    expiresAt: source.expiresAt,
    contentType: imageType,
    fileName: source.fileName,
  };
}

export const documentArchiveService = {
  async getDepartments(): Promise<ArchiveDepartment[]> {
    const { data } = await apiClient.get('/documents/archive/departments');
    return data?.data ?? [];
  },

  async getDocuments(filters: ArchiveFilters = {}): Promise<{ documents: ArchiveDocument[]; total: number }> {
    const { data } = await apiClient.get('/documents/archive', { params: filters });
    return data?.data ?? { documents: [], total: 0 };
  },

  async getDocument(documentId: string, signal?: AbortSignal): Promise<ArchiveDocument> {
    const { data } = await apiClient.get(`/documents/${documentId}`, { signal });
    return data?.data as ArchiveDocument;
  },

  getViewerUrl(documentId: string, signal?: AbortSignal): Promise<SignedViewerUrl> {
    return requestViewerUrl(documentId, signal);
  },

  getViewerFile(documentId: string, viewerKind: 'PDF' | 'IMAGE', signal?: AbortSignal): Promise<ArchiveViewerFile> {
    return fetchSignedViewerFile(documentId, viewerKind, signal);
  },

  downloadDocument: documentService.downloadDocument,

  async archiveDocument(documentId: string): Promise<void> {
    await apiClient.post(`/documents/${documentId}/archive`);
  },

  async restoreDocument(documentId: string): Promise<void> {
    await apiClient.post(`/documents/${documentId}/restore`);
  },

  async requestAccess(documentId: string, reason: string, actions: string[] = ['VIEW']): Promise<void> {
    await apiClient.post(`/documents/${documentId}/access-requests`, { reason, actions });
  },

  async getAccessRequests(scope: 'mine' | 'approvals'): Promise<DocumentAccessRequest[]> {
    const { data } = await apiClient.get('/documents/access-requests', { params: { scope } });
    return data?.data ?? [];
  },

  async decideAccessRequest(requestId: string, decision: 'APPROVE' | 'DENY', reason: string): Promise<void> {
    await apiClient.post(`/documents/access-requests/${requestId}/decision`, { decision, reason });
  },
};
