import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VisitorKioskPage, visitorDetailsAreValid, type VisitorKioskFormState } from './VisitorKioskPage';
import { visitorService, type KioskConfig } from '../../api/visitorService';

vi.mock('../../api/visitorService', async () => {
  const actual = await vi.importActual<typeof import('../../api/visitorService')>('../../api/visitorService');
  return { ...actual, visitorService: { ...actual.visitorService, getKioskConfig: vi.fn(), submitKioskRegistration: vi.fn() } };
});

const configured: KioskConfig = {
  privacy: {
    controllerName: 'Configured Controller', controllerContact: 'privacy@example.test', dpoContact: 'dpo@example.test',
    lawfulBasis: 'Configured lawful basis', retentionPolicy: 'Configured retention policy', rightsProcess: 'Configured rights process',
    processors: 'Configured processors', safeguards: 'Configured safeguards', alternativeVerification: 'Present the original ID to an authorized officer.',
    noticeVersion: '2026-10', acceptedIdTypes: ['Company ID', 'Government ID'], ready: true, missing: [],
    ocr: { status: 'NOT_CONFIGURED', message: 'OCR is not configured.' },
    identityVerification: { status: 'NOT_CONFIGURED', livenessSupported: false, message: 'Provider not configured.' },
  },
  purposes: [{ value: 'MEETING_EMPLOYEE', label: 'Meeting an Employee' }, { value: 'OTHER', label: 'Other Purpose' }],
  hosts: [{ id: 'host-1', name: 'Active Host', department: 'Operations' }], departments: ['Operations'],
};

describe('VisitorKioskPage', () => {
  beforeEach(() => vi.mocked(visitorService.getKioskConfig).mockResolvedValue(configured));

  it('shows the privacy notice before enabling ID capture', async () => {
    render(<MemoryRouter><VisitorKioskPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /start visitor registration/i }));
    expect(screen.getByRole('heading', { name: /privacy notice/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /capture an approved id/i })).not.toBeInTheDocument();
    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(continueButton);
    expect(await screen.findByRole('heading', { name: /capture an approved id/i })).toBeInTheDocument();
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
