import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  load: vi.fn(), update: vi.fn(), checkBiometricReadiness: vi.fn(), loadGmailOAuthStatus: vi.fn(), startGmailOAuth: vi.fn(), disconnectGmail: vi.fn(),
}));
vi.mock('../../api/visitorKioskConfigService', () => ({ visitorKioskConfigService: service }));
import { VisitorKioskConfigPage } from './VisitorKioskConfigPage';
import { useAuthStore } from '../../stores/authStore';

const purposes = ['DRIVER_PARTNER_ASSISTANCE', 'DRIVER_PARTNER_ONBOARDING', 'HR_RECRUITMENT', 'DOCUMENT_TRANSACTION', 'DELIVERY_PICKUP', 'FLEET_OPERATIONS', 'MAINTENANCE_SERVICE', 'GOVERNMENT_REGULATORY'];
const config = {
  organizationName: 'HIRNA TNVS', controllerName: 'Approved Controller', controllerContact: 'privacy@example.test', dpoContact: 'dpo@example.test',
  processingPurposes: 'Approved visitor registration and facility security purposes.', lawfulBasis: 'Approved lawful basis for each actual processing activity.',
  privacyNoticeText: 'Approved visitor privacy notice containing the required transparent processing details.', acknowledgementText: 'I acknowledge that I read and understood this privacy notice.',
  noticeVersion: 'v1', retentionPolicy: 'Identity images are securely deleted after the approved retention period.', retentionDays: 30,
  rightsProcess: 'Contact the approved privacy channel to exercise applicable rights.', processors: 'Approved processors only.', safeguards: 'Private storage, authorization, signed URLs, and audit logging.',
  alternativeVerification: 'Authorized Facilities staff manually review the supplied ID image.', acceptedIdTypes: ['Philippine Passport'],
  purposeDepartmentRoutes: Object.fromEntries(purposes.map((purpose) => [purpose, 'Operations'])), registrationEnabled: false,
  privacyReviewApproved: true, securityReviewApproved: true, operationsReviewApproved: true, revision: 2, updatedAt: '2026-10-21T00:00:00Z',
  biometricProcessingEnabled: false,
  biometricNoticeText: '', biometricAuthorizationText: '',
  biometricPrivacyApproved: false, biometricPrivacyEvidence: '',
  biometricPiaApproved: false, biometricPiaEvidence: '',
  biometricSecurityApproved: false, biometricSecurityEvidence: '',
  biometricLicenseApproved: false, biometricLicenseEvidence: '',
  biometricRetentionApproved: false, biometricRetentionEvidence: '',
  approvals: { privacy: { approved: true, approvedAt: '2026-10-21T00:00:00Z' }, security: { approved: true, approvedAt: '2026-10-21T00:00:00Z' }, operations: { approved: true, approvedAt: '2026-10-21T00:00:00Z' } },
  biometricApprovals: Object.fromEntries(['privacy', 'pia', 'security', 'license', 'retention'].map((name) => [name, { approved: false, approvedBy: null, approvedAt: null, evidence: '' }])),
};
const state = {
  config,
  readiness: { ready: false, configurationComplete: true, registrationEnabled: false, missing: ['registrationEnabled'] },
  availableDepartments: ['Operations'], fixedDepartmentPurposes: purposes,
  technical: { publicUrl: 'https://example.test', emailDeliveryConfigured: false, passPolicyConfigured: false, ocrStatus: 'NOT_CONFIGURED', identityVerificationStatus: 'MANUAL_REVIEW_REQUIRED' },
};
const gmailStatus = {
  provider: 'GMAIL', senderEmail: 'hirnamobilitysolutionsinc@gmail.com', scope: 'https://www.googleapis.com/auth/gmail.send',
  redirectUri: 'https://dunijfrvfozwlykpkfhy.supabase.co/functions/v1/visitor/admin/gmail-oauth/callback',
  serverSecretsConfigured: true, serverConfigurationStatus: 'CONFIGURED', configurationErrorCode: null,
  connected: false, connectionStatus: 'NOT_CONNECTED', connectedAt: null,
  disconnectedAt: null, lastErrorCode: null, lastErrorAt: null,
};

describe('VisitorKioskConfigPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({
      user: { id: 'super-1', email: 'super@example.test', assignedRoles: ['SUPER_ADMIN'], roles: ['SUPER_ADMIN'] },
    });
    service.load.mockResolvedValue(state);
    service.checkBiometricReadiness.mockResolvedValue({
      checkedAt: '2026-10-24T01:00:00Z', activationAllowed: false, enabled: false,
      missing: ['SUPABASE_BIOMETRIC_FLAG_DISABLED', 'DEEPFACE_INFERENCE_NOT_TESTED'],
      technical: {
        checkedAt: '2026-10-24T01:00:00Z', overallStatus: 'DISABLED', ready: false,
        edge: { featureFlagEnabled: false, serviceUrlConfigured: true, secureTransport: true, serviceKeyConfigured: true },
        service: { connected: true, featureFlagEnabled: false, model: 'Facenet512', detector: 'retinaface', modelStatus: 'INITIALIZED', inferenceStatus: 'NOT_TESTED', inferenceTestedAt: null, errorCode: null },
        missing: ['SUPABASE_BIOMETRIC_FLAG_DISABLED', 'PYTHON_BIOMETRIC_FLAG_DISABLED', 'DEEPFACE_INFERENCE_NOT_TESTED'],
      },
      policy: { noticeApproved: false, authorizationApproved: false, legalReviewCompleted: false, piaReviewCompleted: false, securityReviewCompleted: false, licenseReviewCompleted: false, retentionReviewCompleted: false, manualAlternativeConfigured: true },
    });
    service.loadGmailOAuthStatus.mockResolvedValue(gmailStatus);
    service.startGmailOAuth.mockResolvedValue({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', redirectUri: gmailStatus.redirectUri, scope: gmailStatus.scope, expiresAt: '2026-10-22T10:10:00Z' });
    service.disconnectGmail.mockResolvedValue(undefined);
    service.update.mockResolvedValue({ ...state, config: { ...config, registrationEnabled: true, revision: 3 }, readiness: { ready: true, configurationComplete: true, registrationEnabled: true, missing: [] } });
  });

  it('shows the server readiness gate and saves enablement with an audit reason', async () => {
    render(<VisitorKioskConfigPage />);
    expect(await screen.findByText('Registration is not ready')).toBeInTheDocument();
    const enable = screen.getByRole('checkbox', { name: /Enable public visitor registration/i });
    expect(enable).toBeEnabled();
    fireEvent.click(enable);
    fireEvent.change(screen.getByLabelText(/Change reason for audit log/i), { target: { value: 'Organization approved launch' } });
    fireEvent.click(screen.getByRole('button', { name: /Save configuration/i }));
    await waitFor(() => expect(service.update).toHaveBeenCalledWith(expect.objectContaining({
      registrationEnabled: true,
      expectedRevision: 2,
      changeReason: 'Organization approved launch',
    })));
    expect(await screen.findByText('Configuration saved. Public visitor registration is enabled.')).toBeInTheDocument();
  });

  it('prominently flags unresolved policy placeholders and blocks local activation', async () => {
    service.load.mockResolvedValueOnce({
      ...state,
      config: { ...config, dpoContact: '[APPROVED PRIVACY EMAIL]' },
      readiness: { ready: false, configurationComplete: false, registrationEnabled: false, missing: ['dpoContact:unresolvedPlaceholder', 'registrationEnabled'] },
    });
    render(<VisitorKioskConfigPage />);
    expect(await screen.findByRole('heading', { name: 'Unresolved privacy notice placeholders' })).toBeInTheDocument();
    expect(screen.getByText('[APPROVED PRIVACY EMAIL]')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Enable public visitor registration/i })).toBeDisabled();
  });

  it('shows genuine biometric readiness and keeps activation disabled when inference is untested', async () => {
    render(<VisitorKioskConfigPage />);
    expect(await screen.findByRole('heading', { name: 'Biometric Identity Verification' })).toBeInTheDocument();
    expect(screen.getAllByText('Not checked').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Check Biometric Readiness' }));
    await waitFor(() => expect(service.checkBiometricReadiness).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Run real inference with authorized, non-sensitive readiness images.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Permit biometric processing/i })).toBeDisabled();
  });

  it('persists biometric policy and approval evidence instead of dropping it from the save payload', async () => {
    service.load.mockResolvedValueOnce({
      ...state,
      config: {
        ...config,
        biometricNoticeText: 'Approved notice describing the optional biometric comparison and safeguards.',
        biometricAuthorizationText: 'I authorize this optional comparison and may request the manual alternative.',
        biometricPrivacyEvidence: 'DPO decision record DPO-2026-10',
        biometricPrivacyApproved: true,
      },
    });
    render(<VisitorKioskConfigPage />);
    await screen.findByRole('heading', { name: 'Biometric Identity Verification' });
    fireEvent.change(screen.getByLabelText(/Change reason for audit log/i), { target: { value: 'Save reviewed biometric policy' } });
    fireEvent.click(screen.getByRole('button', { name: /Save configuration/i }));
    await waitFor(() => expect(service.update).toHaveBeenCalledWith(expect.objectContaining({
      biometricNoticeText: 'Approved notice describing the optional biometric comparison and safeguards.',
      biometricAuthorizationText: 'I authorize this optional comparison and may request the manual alternative.',
      biometricPrivacyApproved: true,
      biometricPrivacyEvidence: 'DPO decision record DPO-2026-10',
      biometricRetentionApproved: false,
    })));
  });

  it('flags real Gmail and Resend integrations missing from the processor disclosure', async () => {
    service.load.mockResolvedValueOnce({ ...state, technical: { ...state.technical, emailDeliveryConfigured: true } });
    service.loadGmailOAuthStatus.mockResolvedValueOnce({ ...gmailStatus, connected: true, connectionStatus: 'CONNECTED', connectedAt: '2026-10-22T10:00:00Z' });
    render(<VisitorKioskConfigPage />);
    expect(await screen.findByRole('heading', { name: 'Processor disclosure needs review' })).toBeInTheDocument();
    expect(screen.getByText(/Resend is configured as an email fallback/)).toBeInTheDocument();
    expect(screen.getByText(/Gmail API is connected/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Enable public visitor registration/i })).toBeDisabled();
  });

  it('always shows the Gmail controls and actual disconnected state to a direct SUPER_ADMIN', async () => {
    render(<VisitorKioskConfigPage />);
    expect(await screen.findByRole('heading', { name: 'Gmail Email Integration' })).toBeInTheDocument();
    expect(screen.getByText('hirnamobilitysolutionsinc@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('Not Connected')).toBeInTheDocument();
    expect(screen.getByText('Configured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Gmail' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Disconnect Gmail' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh Gmail status' })).toBeEnabled();
  });

  it('keeps the Gmail section visible with a clear error when status loading fails', async () => {
    service.loadGmailOAuthStatus.mockRejectedValueOnce(new Error('Backend status unavailable'));
    render(<VisitorKioskConfigPage />);
    expect(await screen.findByRole('heading', { name: 'Gmail Email Integration' })).toBeInTheDocument();
    expect(await screen.findByText(/Gmail status could not be loaded: Backend status unavailable/)).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Gmail' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh Gmail status' })).toBeEnabled();
  });

  it('keeps a failed Connect action separate from the actual NOT_CONNECTED status', async () => {
    service.startGmailOAuth.mockRejectedValueOnce(new Error('The Gmail OAuth encryption key is invalid.'));
    render(<VisitorKioskConfigPage />);
    expect(await screen.findByText('Not Connected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Gmail' }));
    expect(await screen.findByText(/Gmail connection failed: The Gmail OAuth encryption key is invalid/)).toBeInTheDocument();
    expect(screen.getByText('NOT CONNECTED')).toBeInTheDocument();
    expect(screen.queryByText(/Gmail status could not be loaded/)).not.toBeInTheDocument();
  });

  it('shows malformed encryption configuration without changing first-time connection state', async () => {
    service.loadGmailOAuthStatus.mockResolvedValueOnce({
      ...gmailStatus,
      serverSecretsConfigured: false,
      serverConfigurationStatus: 'INVALID',
      configurationErrorCode: 'GMAIL_ENCRYPTION_KEY_INVALID',
    });
    render(<VisitorKioskConfigPage />);
    expect(await screen.findByText('Not Connected')).toBeInTheDocument();
    expect(screen.getByText('Invalid')).toBeInTheDocument();
    expect(screen.getByText(/GMAIL_ENCRYPTION_KEY_INVALID/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Gmail' })).toBeDisabled();
  });

  it('does not expose Gmail management controls to SYSTEM_ADMIN', async () => {
    useAuthStore.setState({
      user: { id: 'system-1', email: 'system@example.test', assignedRoles: ['SYSTEM_ADMIN'], roles: ['SYSTEM_ADMIN'] },
    });
    render(<VisitorKioskConfigPage />);
    expect(await screen.findByText('Registration is not ready')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Gmail Email Integration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check Biometric Readiness' })).not.toBeInTheDocument();
    expect(screen.getByText(/directly assigned SUPER_ADMIN role is required to check or change biometric configuration/i)).toBeInTheDocument();
    expect(service.loadGmailOAuthStatus).not.toHaveBeenCalled();
  });
});
