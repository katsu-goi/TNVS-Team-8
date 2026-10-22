import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisitorKioskPage, VisitorStatusPage, visitorDetailsAreValid, type VisitorKioskFormState } from './VisitorKioskPage';
import { visitorService, type KioskConfig } from '../../api/visitorService';

vi.mock('../../api/visitorService', async () => {
  const actual = await vi.importActual<typeof import('../../api/visitorService')>('../../api/visitorService');
  return { ...actual, visitorService: { ...actual.visitorService, getKioskConfig: vi.fn(), submitKioskRegistration: vi.fn(), inspectVisitorStatus: vi.fn() } };
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

describe('VisitorStatusPage', () => {
  it.each([
    ['PENDING', 'No entry credential is active.'],
    ['APPROVED', 'Use only the QR pass delivered'],
    ['DECLINED', 'No entry credential was issued.'],
  ] as const)('displays a token-protected %s status without personal data', async (status, message) => {
    vi.mocked(visitorService.inspectVisitorStatus).mockResolvedValue({
      referenceNumber: 'HV-20261022-TEST',
      status,
      message: `Status message: ${message}`,
      updatedAt: '2026-10-22T01:00:00.000Z',
    });
    render(<MemoryRouter initialEntries={['/visitor-status/vss_secure_token']}><Routes><Route path="/visitor-status/:token" element={<VisitorStatusPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText(status)).toBeInTheDocument();
    expect(screen.getByText('HV-20261022-TEST')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(message, 'i'))).toBeInTheDocument();
    expect(visitorService.inspectVisitorStatus).toHaveBeenCalledWith('vss_secure_token');
    expect(screen.queryByText(/visitor@example/i)).not.toBeInTheDocument();
  });

  it('shows a safe error for an invalid or expired status token', async () => {
    vi.mocked(visitorService.inspectVisitorStatus).mockRejectedValue(new Error('This visitor status link has expired.'));
    render(<MemoryRouter initialEntries={['/visitor-status/vss_expired']}><Routes><Route path="/visitor-status/:token" element={<VisitorStatusPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Status unavailable' })).toBeInTheDocument();
    expect(screen.getByText('This visitor status link has expired.')).toBeInTheDocument();
  });
});
