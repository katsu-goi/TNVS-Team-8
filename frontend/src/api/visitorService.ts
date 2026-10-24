import { apiClient } from './client';
import type {
  IdType,
  VisitorVerification,
  VisitorWatchlistEntry,
  WatchlistEntryStatus,
} from '../types/visitors';

export type KioskHost = { id: string; name: string; department: string; position?: string | null };
export type KioskPurpose = { value: string; label: string; department?: string | null };
export type KioskConfig = {
  privacy: {
    organizationName: string;
    controllerName: string;
    controllerContact: string;
    dpoContact: string;
    processingPurposes: string;
    lawfulBasis: string;
    privacyNoticeText: string;
    acknowledgementText: string;
    retentionPolicy: string;
    retentionDays: number | null;
    rightsProcess: string;
    processors: string;
    safeguards: string;
    alternativeVerification: string;
    noticeVersion: string;
    acceptedIdTypes: string[];
    ready: boolean;
    configurationComplete: boolean;
    registrationEnabled: boolean;
    missing: string[];
    ocr: { status: 'BROWSER_LOCAL'; message: string };
    identityVerification: {
      status: 'DISABLED' | 'ENABLED';
      livenessSupported: false;
      message: string;
      biometricNotice?: string;
      authorizationText?: string;
      authorizationRequired?: boolean;
    };
  };
  purposes: KioskPurpose[];
  hosts: KioskHost[];
  departments: string[];
};

export type KioskRegistration = {
  idempotencyKey: string;
  privacyNoticeVersion: string;
  privacyAcknowledged: true;
  fullName: string;
  email: string;
  phoneNumber?: string;
  company?: string;
  idType: string;
  idNumberLast4?: string;
  idExpirationDate?: string;
  idIssuingAuthority?: string;
  documentScreening?: {
    ocrStatus: 'SUCCEEDED' | 'FAILED';
    classification: 'SUPPORTED_ID_TYPE' | 'UNSUPPORTED_DOCUMENT' | 'PAYMENT_CARD_DETECTED' | 'INCONCLUSIVE';
    detectedIdType: string | null;
    warnings: string[];
    textQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  idImage: { dataUrl: string; confirmedReadable: true };
  selfieImage?: { dataUrl: string };
  biometricAuthorization?: boolean;
  manualAlternativeRequested?: boolean;
  purposeCategory: string;
  otherPurpose?: string;
  hostId?: string;
  receivingDepartment?: string;
  expectedArrival: string;
};

export type VisitorIdentityArtifact = {
  id: string;
  type: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
  capturedAt: string;
  deleteAfter?: string | null;
  signedUrl: string;
  expiresInSeconds: number;
  expiresAt: string;
};

export type VisitorPassInspection = {
  referenceNumber: string;
  visitorName: string;
  purpose: string | null;
  destination: string | null;
  expectedArrival: string;
  validFrom: string;
  expiresAt: string;
  status: 'NOT_YET_VALID' | 'ACTIVE';
  active: boolean;
};

/**
 * Visitor verification + watchlist API (Task 4).
 *
 * Paths are relative to the axios `baseURL` (`/api/v1`), matching the other
 * service modules in this directory.
 */
export const visitorService = {
  async getKioskConfig(): Promise<KioskConfig> {
    const { data } = await apiClient.get('/visitor-kiosk/config');
    return data?.data;
  },

  async submitKioskRegistration(payload: KioskRegistration): Promise<{
    id: string;
    referenceNumber: string;
    approvalStatus: string;
    identityVerificationStatus: string;
    emailDeliveryStatus: 'NOT_REQUESTED' | 'ACCEPTED' | 'FAILED' | 'NOT_CONFIGURED';
    statusToken: string | null;
    duplicate?: boolean;
  }> {
    const { data } = await apiClient.post('/visitor-kiosk/register', payload);
    return data?.data;
  },

  async inspectVisitorPass(token: string): Promise<VisitorPassInspection> {
    const { data } = await apiClient.post('/visitor-pass/inspect', { token });
    return data?.data;
  },

  async inspectVisitorStatus(token: string): Promise<{
    referenceNumber: string;
    status: 'PENDING_REVIEW' | 'APPROVED' | 'DECLINED' | 'PASS_EXPIRED' | 'PASS_REVOKED' | 'TEMPORARILY_UNAVAILABLE';
    message: string;
    updatedAt: string;
  }> {
    const { data } = await apiClient.post('/visitor-status/inspect', { token });
    return data?.data;
  },

  async scanVisitorPass(token: string, mode: 'CHECK_IN' | 'CHECK_OUT'): Promise<any> {
    const path = mode === 'CHECK_IN' ? '/visitor-passes/check-in' : '/visitor-passes/check-out';
    const { data } = await apiClient.post(path, { token });
    return data?.data;
  },

  async getIdentityArtifacts(id: string): Promise<VisitorIdentityArtifact[]> {
    const { data } = await apiClient.get(`/visitors/${id}/identity-artifacts`);
    return data?.data ?? [];
  },

  async manualIdentityReview(id: string, decision: 'APPROVE' | 'REJECT', notes: string): Promise<VisitorVerification> {
    const { data } = await apiClient.post(`/visitors/${id}/manual-identity-review`, { decision, notes });
    return data?.data;
  },

  async decideApproval(id: string, decision: 'APPROVE' | 'DECLINE', reason?: string): Promise<any> {
    const { data } = await apiClient.post(`/visitors/${id}/approval`, { decision, reason });
    return data?.data;
  },

  async retryPassEmail(id: string): Promise<any> {
    const { data } = await apiClient.post(`/visitors/${id}/email-retry`);
    return data?.data;
  },
  async listVisitors(): Promise<any[]> {
    const { data } = await apiClient.get('/visitors');
    return data?.data ?? [];
  },

  /** Runs the heuristic ID parse + watchlist screen. `idNumber` falls back to the registered one. */
  async verifyVisitor(id: string, idType: IdType, idNumber?: string): Promise<VisitorVerification> {
    const { data } = await apiClient.post(`/visitors/${id}/verify`, { idType, idNumber });
    return data?.data;
  },

  async listVerifications(id: string): Promise<VisitorVerification[]> {
    const { data } = await apiClient.get(`/visitors/${id}/verifications`);
    return data?.data ?? [];
  },

  async listWatchlist(): Promise<VisitorWatchlistEntry[]> {
    const { data } = await apiClient.get('/visitors/watchlist');
    return data?.data ?? [];
  },

  async addWatchlistEntry(
    fullName: string,
    idNumber?: string,
    reason?: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'HIGH',
  ): Promise<VisitorWatchlistEntry> {
    const { data } = await apiClient.post('/visitors/watchlist', { fullName, idNumber, reason, severity });
    return data?.data;
  },

  async updateWatchlistStatus(
    id: string,
    status: WatchlistEntryStatus,
  ): Promise<VisitorWatchlistEntry> {
    const { data } = await apiClient.post(`/visitors/watchlist/${id}/status`, { status });
    return data?.data;
  },

  async checkIn(id: string): Promise<any> {
    const { data } = await apiClient.post(`/visitors/${id}/check-in`);
    return data?.data;
  },

  async verifyAndAllow(id: string, idType: IdType, idNumber?: string): Promise<any> {
    const { data } = await apiClient.post(`/visitors/${id}/verify-allow`, { idType, idNumber });
    return data?.data;
  },

  async denyVisitor(id: string, reason: string): Promise<any> {
    const { data } = await apiClient.post(`/visitors/${id}/deny`, { reason });
    return data?.data;
  },

  async checkOut(id: string): Promise<any> {
    const { data } = await apiClient.post(`/visitors/${id}/check-out`);
    return data?.data;
  },

  async getOccupancy(): Promise<{ current: number; maxCapacity: number; rate: number }> {
    const { data } = await apiClient.get('/visitors/occupancy');
    return data?.data ?? { current: 0, maxCapacity: 1, rate: 0 };
  },

  async reviewVisitor(
    visitorId: string,
    verificationId: string,
    decision: 'CLEAR' | 'BLOCK',
    notes: string,
  ): Promise<VisitorVerification> {
    const { data } = await apiClient.post(
      `/visitors/${visitorId}/verifications/${verificationId}/review`,
      { decision, notes },
    );
    return data?.data;
  },

  async history(id: string): Promise<any[]> {
    const { data } = await apiClient.get(`/visitors/${id}/history`);
    return data?.data ?? [];
  },
};
