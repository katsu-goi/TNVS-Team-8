import { apiClient } from './client';

export type VisitorKioskAdminConfig = {
  organizationName: string;
  controllerName: string;
  controllerContact: string;
  dpoContact: string;
  processingPurposes: string;
  lawfulBasis: string;
  privacyNoticeText: string;
  acknowledgementText: string;
  noticeVersion: string;
  retentionPolicy: string;
  retentionDays: number | null;
  rightsProcess: string;
  processors: string;
  safeguards: string;
  alternativeVerification: string;
  acceptedIdTypes: string[];
  purposeDepartmentRoutes: Record<string, string>;
  registrationEnabled: boolean;
  privacyReviewApproved: boolean;
  securityReviewApproved: boolean;
  operationsReviewApproved: boolean;
  revision: number;
  updatedAt: string;
  approvals: Record<'privacy' | 'security' | 'operations', { approved: boolean; approvedAt: string | null }>;
};

export type VisitorKioskAdminState = {
  config: VisitorKioskAdminConfig;
  readiness: {
    ready: boolean;
    configurationComplete: boolean;
    registrationEnabled: boolean;
    missing: string[];
  };
  availableDepartments: string[];
  fixedDepartmentPurposes: string[];
  technical: {
    publicUrl: string;
    emailDeliveryConfigured: boolean;
    passPolicyConfigured: boolean;
    ocrStatus: string;
    identityVerificationStatus: string;
  };
};

export type VisitorKioskConfigUpdate = Omit<VisitorKioskAdminConfig, 'revision' | 'updatedAt' | 'approvals'> & {
  expectedRevision: number;
  changeReason: string;
};

export const visitorKioskConfigService = {
  async load(): Promise<VisitorKioskAdminState> {
    const { data } = await apiClient.get('/admin/visitor-kiosk-config');
    return data?.data;
  },

  async update(payload: VisitorKioskConfigUpdate): Promise<VisitorKioskAdminState> {
    const { data } = await apiClient.put('/admin/visitor-kiosk-config', payload);
    return data?.data;
  },
};
