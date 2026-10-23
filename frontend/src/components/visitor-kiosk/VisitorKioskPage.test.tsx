import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisitorKioskPage, VisitorPassPage, VisitorStatusPage, visitorDetailsAreValid, type VisitorKioskFormState } from './VisitorKioskPage';
import { visitorService, type KioskConfig } from '../../api/visitorService';

vi.mock('../../api/visitorService', async () => {
  const actual = await vi.importActual<typeof import('../../api/visitorService')>('../../api/visitorService');
  return { ...actual, visitorService: { ...actual.visitorService, getKioskConfig: vi.fn(), submitKioskRegistration: vi.fn(), inspectVisitorPass: vi.fn(), inspectVisitorStatus: vi.fn() } };
});

vi.mock('./VisitorIdScanner', () => ({
  VisitorIdScanner: ({ onImageChange }: { onImageChange: (image: string, confirmed: boolean) => void }) => (
    <button type="button" onClick={() => onImageChange('data:image/jpeg;base64,AA==', true)}>Use test ID image</button>
  ),
}));

const configured: KioskConfig = {
  privacy: {
    organizationName: 'HIRNA TNVS',
    controllerName: 'Configured Controller', controllerContact: 'privacy@example.test', dpoContact: 'dpo@example.test',
    processingPurposes: 'Visitor registration and facility security.',
    lawfulBasis: 'Configured lawful basis', retentionPolicy: 'Configured retention policy', rightsProcess: 'Configured rights process',
    privacyNoticeText: '# Approved Visitor Notice\n\n**Important:** this is the complete approved policy.\n\n- Visitor details\n- Approved ID image\n\nContact the [privacy team](mailto:privacy@example.test).',
    acknowledgementText: 'I acknowledge that I have read and understood this configured notice.',
    retentionDays: 30,
    processors: 'Configured processors', safeguards: 'Configured safeguards', alternativeVerification: 'Present the original ID to an authorized officer.',
    noticeVersion: '2026-10', acceptedIdTypes: ['Company ID', 'Government ID'], ready: true, configurationComplete: true, registrationEnabled: true, missing: [],
    ocr: { status: 'NOT_CONFIGURED', message: 'OCR is not configured.' },
    identityVerification: { status: 'NOT_CONFIGURED', livenessSupported: false, message: 'Provider not configured.' },
  },
  purposes: [{ value: 'MEETING_EMPLOYEE', label: 'Meeting an Employee' }, { value: 'OTHER', label: 'Other Purpose' }],
  hosts: [{ id: 'host-1', name: 'Active Host', department: 'Operations' }], departments: ['Operations'],
};

afterEach(() => cleanup());

describe('VisitorKioskPage', () => {
  beforeEach(() => vi.mocked(visitorService.getKioskConfig).mockResolvedValue(configured));

  it('loads backend configuration and shows the privacy notice before enabling ID capture', async () => {
    render(<MemoryRouter><VisitorKioskPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: /welcome to hirna tnvs/i })).toBeInTheDocument();
    expect(visitorService.getKioskConfig).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /start visitor registration/i }));
    expect(screen.getByRole('heading', { name: /your privacy matters/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /capture an approved id/i })).not.toBeInTheDocument();
    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(continueButton);
    expect(await screen.findByRole('heading', { name: /capture an approved id/i })).toBeInTheDocument();
  });

  it('renders complete Markdown semantics without allowing raw HTML or unsafe links', async () => {
    vi.mocked(visitorService.getKioskConfig).mockResolvedValue({
      ...configured,
      privacy: {
        ...configured.privacy,
        privacyNoticeText: '## Collection details\n\n**Required explanation**\n\n1. Name\n2. ID image\n\n[Safe contact](mailto:privacy@example.test)\n\n[Unsafe link](javascript:alert(1))\n\n<script>window.policyInjected = true</script>',
      },
    });
    const { container } = render(<MemoryRouter><VisitorKioskPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /start visitor registration/i }));

    expect(screen.getByRole('heading', { name: 'Collection details' })).toBeInTheDocument();
    expect(screen.getByText('Required explanation').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem').some((item) => item.textContent === 'ID image')).toBe(true);
    expect(screen.getByRole('link', { name: 'Safe contact' })).toHaveAttribute('href', 'mailto:privacy@example.test');
    expect(screen.queryByRole('link', { name: 'Unsafe link' })).not.toBeInTheDocument();
    expect(screen.getByText('Unsafe link')).toBeInTheDocument();
    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(screen.getByText('Manual identity verification is available')).toBeInTheDocument();
    expect(screen.getByText('Organization and Contact')).toBeInTheDocument();
    expect(screen.getByText('Information and Processing')).toBeInTheDocument();
    expect(screen.getByText('Privacy and Security')).toBeInTheDocument();
  });

  it('uses an unchecked native acknowledgment and keeps Continue disabled until activation', async () => {
    render(<MemoryRouter><VisitorKioskPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /start visitor registration/i }));
    const checkbox = screen.getByRole('checkbox', { name: configured.privacy.acknowledgementText });
    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(checkbox).not.toBeChecked();
    expect(continueButton).toBeDisabled();
    checkbox.focus();
    expect(checkbox).toHaveFocus();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(continueButton).toBeEnabled();
    expect(screen.getByRole('link', { name: /review the full notice again/i })).toHaveAttribute('href', '#full-privacy-notice');
  });

  it('submits the acknowledged notice version once with the pending registration', async () => {
    vi.mocked(visitorService.submitKioskRegistration).mockResolvedValue({
      id: 'visitor-1', referenceNumber: 'HV-20261022-TEST', approvalStatus: 'PENDING',
      identityVerificationStatus: 'MANUAL_REVIEW_REQUIRED', emailDeliveryStatus: 'NOT_CONFIGURED', statusToken: 'vss_test',
    });
    render(<MemoryRouter><VisitorKioskPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /start visitor registration/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Government ID' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use test ID image' }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue for manual review/i }));

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Visitor' } });
    fireEvent.change(screen.getByLabelText('Email for QR pass'), { target: { value: 'visitor@example.test' } });
    fireEvent.change(screen.getByLabelText('Purpose of visit'), { target: { value: 'MEETING_EMPLOYEE' } });
    fireEvent.change(screen.getByLabelText('Employee host'), { target: { value: 'host-1' } });
    fireEvent.change(screen.getByLabelText('Expected arrival'), { target: { value: '2026-10-23T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /review request/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit pending request/i }));

    await waitFor(() => expect(visitorService.submitKioskRegistration).toHaveBeenCalledTimes(1));
    expect(visitorService.submitKioskRegistration).toHaveBeenCalledWith(expect.objectContaining({
      privacyAcknowledged: true,
      privacyNoticeVersion: '2026-10',
    }));
    expect(await screen.findByRole('heading', { name: 'Request received' })).toBeInTheDocument();
  });

  it('blocks collection when mandatory privacy configuration is incomplete', async () => {
    vi.mocked(visitorService.getKioskConfig).mockResolvedValue({ ...configured, privacy: { ...configured.privacy, ready: false, missing: ['dpoContact'] } });
    render(<MemoryRouter><VisitorKioskPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: /start visitor registration/i })).toBeDisabled());
    expect(screen.getByText(/registration is not yet enabled/i)).toBeInTheDocument();
  });
});

describe('visitorDetailsAreValid', () => {
  const base: VisitorKioskFormState = {
    fullName: 'Visitor Name', email: 'visitor@example.test', phoneNumber: '', company: '', idType: 'Company ID', idNumberLast4: '',
    idImage: 'data:image/jpeg;base64,AA==', imageConfirmed: true, purposeCategory: 'OTHER', otherPurpose: '', hostId: '',
    receivingDepartment: 'Operations', expectedArrival: '2026-10-22T10:00',
  };

  it('requires an explanation for Other Purpose', () => {
    expect(visitorDetailsAreValid(base)).toBe(false);
    expect(visitorDetailsAreValid({ ...base, otherPurpose: 'Policy consultation' })).toBe(true);
  });

  it('requires a real backend host selection for employee meetings', () => {
    expect(visitorDetailsAreValid({ ...base, purposeCategory: 'MEETING_EMPLOYEE', otherPurpose: '' })).toBe(false);
    expect(visitorDetailsAreValid({ ...base, purposeCategory: 'MEETING_EMPLOYEE', otherPurpose: '', hostId: 'host-1' })).toBe(true);
  });
});

describe('VisitorPassPage', () => {
  const pass = {
    referenceNumber: 'HV-20261023-TEST',
    visitorName: 'Visitor',
    purpose: 'MEETING_EMPLOYEE',
    destination: 'Department Head',
    expectedArrival: '2026-10-23T13:45:00.000Z',
    validFrom: '2026-10-23T13:15:00.000Z',
    expiresAt: '2026-10-23T17:45:00.000Z',
  };

  it('shows an approved scheduled pass and its Manila activation time before entry begins', async () => {
    vi.mocked(visitorService.inspectVisitorPass).mockResolvedValue({ ...pass, status: 'NOT_YET_VALID', active: false });
    render(<MemoryRouter initialEntries={['/visitor-pass/vst_scheduled']}><Routes><Route path="/visitor-pass/:token" element={<VisitorPassPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Visitor pass approved' })).toBeInTheDocument();
    expect(screen.getByText('APPROVED — NOT YET VALID')).toBeInTheDocument();
    expect(screen.getAllByText(/Oct 23, 2026, 9:15 PM PHT/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Pass unavailable' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check activation' })).toBeInTheDocument();
  });

  it('shows the active state only after the backend confirms the entry window', async () => {
    vi.mocked(visitorService.inspectVisitorPass).mockResolvedValue({ ...pass, status: 'ACTIVE', active: true });
    render(<MemoryRouter initialEntries={['/visitor-pass/vst_active']}><Routes><Route path="/visitor-pass/:token" element={<VisitorPassPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Active visitor pass' })).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check activation' })).not.toBeInTheDocument();
  });
});

describe('VisitorStatusPage', () => {
  it.each([
    ['PENDING_REVIEW', 'No entry credential is active.'],
    ['APPROVED', 'Use only the QR pass delivered'],
    ['DECLINED', 'No entry credential was issued.'],
    ['PASS_EXPIRED', 'has expired'],
    ['PASS_REVOKED', 'no longer active'],
  ] as const)('displays a token-protected %s status without personal data', async (status, message) => {
    vi.mocked(visitorService.inspectVisitorStatus).mockResolvedValue({
      referenceNumber: 'HV-20261022-TEST',
      status,
      message: `Status message: ${message}`,
      updatedAt: '2026-10-22T01:00:00.000Z',
    });
    render(<MemoryRouter initialEntries={['/visitor-status/vss_secure_token']}><Routes><Route path="/visitor-status/:token" element={<VisitorStatusPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText(status.replace(/_/g, ' '))).toBeInTheDocument();
    expect(screen.getByText('HV-20261022-TEST')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(message, 'i'))).toBeInTheDocument();
    expect(visitorService.inspectVisitorStatus).toHaveBeenCalledWith('vss_secure_token');
    expect(screen.queryByText(/visitor@example/i)).not.toBeInTheDocument();
  });

  it('shows a safe error for an invalid or expired status token', async () => {
    vi.mocked(visitorService.inspectVisitorStatus).mockRejectedValue({
      response: { status: 410, data: { errorCode: 'VISITOR_STATUS_EXPIRED' }, headers: { 'x-request-id': 'status-request-1234' } },
    });
    render(<MemoryRouter initialEntries={['/visitor-status/vss_expired']}><Routes><Route path="/visitor-status/:token" element={<VisitorStatusPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Status unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/secure visitor status link has expired/i)).toBeInTheDocument();
    expect(screen.getByText(/status-request-1234/)).toBeInTheDocument();
  });

  it('distinguishes an invalid secure status credential without exposing backend details', async () => {
    vi.mocked(visitorService.inspectVisitorStatus).mockRejectedValue({
      response: { status: 404, data: { errorCode: 'VISITOR_STATUS_INVALID' }, headers: {} },
    });
    render(<MemoryRouter initialEntries={['/visitor-status/not-a-status-token']}><Routes><Route path="/visitor-status/:token" element={<VisitorStatusPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText(/secure visitor status link is invalid/i)).toBeInTheDocument();
    expect(screen.queryByText(/functions\/v1/i)).not.toBeInTheDocument();
  });

  it('does not expose API URLs and permits an explicit retry after an outage', async () => {
    vi.mocked(visitorService.inspectVisitorStatus)
      .mockRejectedValueOnce(new Error('Cannot reach https://project.supabase.co/functions/v1.'))
      .mockResolvedValueOnce({
        referenceNumber: 'HV-20261022-RETRY',
        status: 'PENDING_REVIEW',
        message: 'Your request remains pending. No entry credential is active.',
        updatedAt: '2026-10-22T01:00:00.000Z',
      });
    render(<MemoryRouter initialEntries={['/visitor-status/vss_retry']}><Routes><Route path="/visitor-status/:token" element={<VisitorStatusPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText(/could not load your visitor status/i)).toBeInTheDocument();
    expect(screen.queryByText(/supabase\.co/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('HV-20261022-RETRY')).toBeInTheDocument();
    expect(visitorService.inspectVisitorStatus).toHaveBeenCalledTimes(2);
  });
});
