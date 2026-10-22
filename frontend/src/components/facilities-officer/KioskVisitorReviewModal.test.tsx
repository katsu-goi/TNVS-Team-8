import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getIdentityArtifacts: vi.fn(),
  manualIdentityReview: vi.fn(),
  decideApproval: vi.fn(),
  retryPassEmail: vi.fn(),
  listVisitors: vi.fn(),
}));

vi.mock('../../api/visitorService', () => ({ visitorService: api }));

import { KioskVisitorReviewModal } from './KioskVisitorReviewModal';

const visitor = {
  id: 'visitor-1',
  referenceNumber: 'HV-2026-001',
  fullName: 'Review Visitor',
  email: 'visitor@example.test',
  purposeOfVisit: 'Meeting an Employee',
  receivingDepartment: 'Operations',
  idType: 'National ID',
  idNumberLast4: '1234',
  identityVerificationStatus: 'PROVIDER_NOT_CONFIGURED',
  approvalStatus: 'PENDING',
  accessStatus: 'NOT_AUTHORIZED',
  emailDeliveryStatus: 'NOT_REQUESTED',
};

const artifact = (overrides: Record<string, unknown> = {}) => ({
  id: 'artifact-1',
  type: 'ID_FRONT',
  mimeType: 'image/jpeg',
  byteSize: 2048,
  capturedAt: '2026-10-22T01:00:00.000Z',
  deleteAfter: '2026-11-21T01:00:00.000Z',
  signedUrl: 'https://project.supabase.co/storage/v1/object/sign/visitor-identity-private/path.jpg?token=secret',
  expiresInSeconds: 300,
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
  ...overrides,
});

const renderReview = () => render(
  <KioskVisitorReviewModal visitor={visitor} onClose={vi.fn()} onChanged={vi.fn().mockResolvedValue(undefined)} />,
);

describe('secure kiosk visitor identity review', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getIdentityArtifacts.mockResolvedValue([artifact()]);
    api.listVisitors.mockResolvedValue([visitor]);
    api.manualIdentityReview.mockResolvedValue({});
    api.decideApproval.mockResolvedValue({});
  });

  afterEach(() => cleanup());

  it('keeps identity decisions disabled until the private image loads successfully', async () => {
    renderReview();
    const approve = screen.getByRole('button', { name: 'Approve manual identity review' });
    fireEvent.change(screen.getByPlaceholderText('Required: at least 5 characters'), { target: { value: 'Image inspected carefully.' } });
    expect(approve).toBeDisabled();

    const image = await screen.findByAltText('Identification document submitted by Review Visitor');
    fireEvent.load(image);
    expect(await screen.findByText('Identification document loaded successfully')).toBeInTheDocument();
    expect(approve).toBeEnabled();
  });

  it('shows a persistent loading state for a slow protected request', () => {
    api.getIdentityArtifacts.mockReturnValue(new Promise(() => undefined));
    renderReview();
    expect(screen.getByText('Loading identification document...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve manual identity review' })).toBeDisabled();
  });

  it('handles missing and expired artifacts without enabling review', async () => {
    api.getIdentityArtifacts.mockResolvedValueOnce([]);
    const first = renderReview();
    expect(await screen.findByText('No active identification document is available for this visitor.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve manual identity review' })).toBeDisabled();
    first.unmount();

    api.getIdentityArtifacts.mockResolvedValueOnce([artifact({ expiresAt: '2020-01-01T00:00:00.000Z' })]);
    renderReview();
    expect(await screen.findByText('The secure image link expired. Request a fresh link to continue.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve manual identity review' })).toBeDisabled();
  });

  it.each([
    [403, 'You are not authorized to inspect this identity document.'],
    [404, 'The identity artifact could not be found.'],
  ])('surfaces a protected API %s response and offers a secure retry', async (status, message) => {
    api.getIdentityArtifacts.mockRejectedValue({ response: { status, data: { error: { message } } } });
    renderReview();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request fresh secure link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve manual identity review' })).toBeDisabled();
  });

  it('rejects an unexpected media type defensively', async () => {
    api.getIdentityArtifacts.mockResolvedValue([artifact({ mimeType: 'text/html' })]);
    renderReview();
    expect(await screen.findByText('The identification document has an unsupported media type.')).toBeInTheDocument();
    expect(screen.queryByAltText('Identification document submitted by Review Visitor')).not.toBeInTheDocument();
  });

  it('automatically requests one fresh link after an image fetch failure, then shows an error', async () => {
    renderReview();
    fireEvent.error(await screen.findByAltText('Identification document submitted by Review Visitor'));
    await waitFor(() => expect(api.getIdentityArtifacts).toHaveBeenCalledTimes(2));
    fireEvent.error(await screen.findByAltText('Identification document submitted by Review Visitor'));
    expect(await screen.findByText('The private identification image could not be loaded. Check access or storage, then retry.')).toBeInTheDocument();
    expect(api.getIdentityArtifacts).toHaveBeenCalledTimes(2);
  });

  it('requests a fresh signed URL for every modal mount', async () => {
    const first = renderReview();
    await waitFor(() => expect(api.getIdentityArtifacts).toHaveBeenCalledTimes(1));
    first.unmount();
    renderReview();
    await waitFor(() => expect(api.getIdentityArtifacts).toHaveBeenCalledTimes(2));
  });

  it('provides zoom, rotate, reset, and full-screen controls after load', async () => {
    renderReview();
    const image = await screen.findByAltText('Identification document submitted by Review Visitor');
    fireEvent.load(image);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));
    expect(image).toHaveStyle({ transform: 'translate(0px, 0px) rotate(90deg) scale(1.25)' });
    fireEvent.click(screen.getByRole('button', { name: 'Open full-screen image view' }));
    expect(screen.getByRole('dialog', { name: 'Full-screen identification image' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset image view' })[0]);
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
  });

  it('records identity review separately and does not issue a visit pass', async () => {
    renderReview();
    fireEvent.load(await screen.findByAltText('Identification document submitted by Review Visitor'));
    fireEvent.change(screen.getByPlaceholderText('Required: at least 5 characters'), { target: { value: 'Government ID is readable.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve manual identity review' }));
    await waitFor(() => expect(api.manualIdentityReview).toHaveBeenCalledWith('visitor-1', 'APPROVE', 'Government ID is readable.'));
    expect(api.decideApproval).not.toHaveBeenCalled();
  });
});
