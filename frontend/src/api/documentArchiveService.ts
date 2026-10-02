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

export const documentArchiveService = {
  async getDepartments(): Promise<ArchiveDepartment[]> {
    const { data } = await apiClient.get('/documents/archive/departments');
    return data?.data ?? [];
  },

  async getDocuments(filters: ArchiveFilters = {}): Promise<{ documents: ArchiveDocument[]; total: number }> {
    const { data } = await apiClient.get('/documents/archive', { params: filters });
    return data?.data ?? { documents: [], total: 0 };
  },

  async getDocument(documentId: string): Promise<ArchiveDocument> {
    const { data } = await apiClient.get(`/documents/${documentId}`);
    return data?.data as ArchiveDocument;
  },

  async getViewerUrl(documentId: string): Promise<{ signedUrl: string; expiresAt: string; contentType: string | null; fileName: string | null }> {
    const { data } = await apiClient.get(`/documents/${documentId}/signed-url`);
    return data?.data;
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
