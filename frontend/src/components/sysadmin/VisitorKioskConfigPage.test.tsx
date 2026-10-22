import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({ load: vi.fn(), update: vi.fn() }));
vi.mock('../../api/visitorKioskConfigService', () => ({ visitorKioskConfigService: service }));
import { VisitorKioskConfigPage } from './VisitorKioskConfigPage';

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

describe('VisitorKioskConfigPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    service.load.mockResolvedValue(state);
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
});
