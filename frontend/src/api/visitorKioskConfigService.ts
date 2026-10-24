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
  biometricProcessingEnabled?: boolean;
  biometricNoticeText?: string;
  biometricAuthorizationText?: string;
  biometricPrivacyApproved?: boolean;
  biometricPiaApproved?: boolean;
  biometricSecurityApproved?: boolean;
  biometricLicenseApproved?: boolean;
  biometricPrivacyEvidence?: string;
  biometricPiaEvidence?: string;
  biometricSecurityEvidence?: string;
  biometricLicenseEvidence?: string;
  biometricRetentionApproved?: boolean;
  biometricRetentionEvidence?: string;
  revision: number;
  updatedAt: string;
  approvals: Record<'privacy' | 'security' | 'operations', { approved: boolean; approvedAt: string | null }>;
  biometricApprovals?: Record<'privacy' | 'pia' | 'security' | 'license' | 'retention', {
    approved: boolean;
    approvedBy: string | null;
    approvedAt: string | null;
    evidence: string;
  }>;
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

export type VisitorKioskConfigUpdate = Omit<VisitorKioskAdminConfig, 'revision' | 'updatedAt' | 'approvals' | 'biometricApprovals'> & {
  expectedRevision: number;
  changeReason: string;
};

export type VisitorBiometricReadiness = {
  checkedAt: string;
  activationAllowed: boolean;
  enabled: boolean;
  missing: string[];
  technical: {
    checkedAt: string;
    overallStatus: 'READY' | 'NOT_CONFIGURED' | 'DISABLED' | 'UNAVAILABLE' | 'MODEL_NOT_TESTED' | 'ERROR';
    ready: boolean;
    edge: {
      featureFlagEnabled: boolean;
      serviceUrlConfigured: boolean;
      secureTransport: boolean;
      serviceKeyConfigured: boolean;
    };
    service: {
      connected: boolean;
      featureFlagEnabled: boolean | null;
      model: string | null;
      detector: string | null;
      modelStatus: 'INITIALIZED' | 'NOT_INITIALIZED' | 'ERROR' | 'UNKNOWN';
      inferenceStatus: 'PASSED' | 'NOT_TESTED' | 'FAILED' | 'UNKNOWN';
      inferenceTestedAt: string | null;
      errorCode: string | null;
    };
    missing: string[];
  };
  policy: {
    noticeApproved: boolean;
    authorizationApproved: boolean;
    legalReviewCompleted: boolean;
    piaReviewCompleted: boolean;
    securityReviewCompleted: boolean;
    licenseReviewCompleted: boolean;
    retentionReviewCompleted: boolean;
    manualAlternativeConfigured: boolean;
  };
};

export type VisitorGmailOAuthStatus = {
  provider: 'GMAIL';
  senderEmail: string;
  scope: string;
  redirectUri: string;
  serverSecretsConfigured: boolean;
  serverConfigurationStatus: 'CONFIGURED' | 'MISSING' | 'INVALID';
  configurationErrorCode: string | null;
  connected: boolean;
  connectionStatus: 'NOT_CONNECTED' | 'CONNECTED' | 'ERROR';
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
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

  async checkBiometricReadiness(): Promise<VisitorBiometricReadiness> {
    const { data } = await apiClient.post('/admin/visitor-biometric-readiness');
    return data?.data;
  },

  async loadGmailOAuthStatus(): Promise<VisitorGmailOAuthStatus> {
    const { data } = await apiClient.get('/visitor/admin/gmail-oauth/status');
    return data?.data;
  },

  async startGmailOAuth(): Promise<{ authorizationUrl: string; redirectUri: string; scope: string; expiresAt: string }> {
    const { data } = await apiClient.post('/visitor/admin/gmail-oauth/authorize');
    return data?.data;
  },

  async disconnectGmail(reason: string): Promise<void> {
    await apiClient.post('/visitor/admin/gmail-oauth/disconnect', { reason });
  },
};
