import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  load: vi.fn(), update: vi.fn(), loadGmailOAuthStatus: vi.fn(), startGmailOAuth: vi.fn(), disconnectGmail: vi.fn(),
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
  alternativeVerification: 'Authorized Facilities staff manually review the supplied ID image.', acceptedIdTypes: ['Approved government ID'],
  purposeDepartmentRoutes: Object.fromEntries(purposes.map((purpose) => [purpose, 'Operations'])), registrationEnabled: false,
  privacyReviewApproved: true, securityReviewApproved: true, operationsReviewApproved: true, revision: 2, updatedAt: '2026-10-21T00:00:00Z',
  approvals: { privacy: { approved: true, approvedAt: '2026-10-21T00:00:00Z' }, security: { approved: true, approvedAt: '2026-10-21T00:00:00Z' }, operations: { approved: true, approvedAt: '2026-10-21T00:00:00Z' } },
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
    expect(service.loadGmailOAuthStatus).not.toHaveBeenCalled();
  });
});
