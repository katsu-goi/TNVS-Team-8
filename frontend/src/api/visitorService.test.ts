import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./client', () => ({ apiClient: api }));

import { visitorService } from './visitorService';

describe('visitor kiosk API integration', () => {
  beforeEach(() => vi.resetAllMocks());

  it('loads configuration through the public visitor kiosk route', async () => {
    const config = {
      privacy: { ready: true },
      hosts: [{ id: 'employee-1', name: 'Active Employee', department: 'Operations' }],
      departments: ['Operations'],
      purposes: [{ value: 'MEETING_EMPLOYEE', label: 'Meeting an Employee', department: null }],
    };
    api.get.mockResolvedValueOnce({ data: { data: config } });

    await expect(visitorService.getKioskConfig()).resolves.toBe(config);
    expect(api.get).toHaveBeenCalledWith('/visitor-kiosk/config');
  });

  it('submits the acknowledged visitor details and ID to the kiosk registration route', async () => {
    const payload = {
      idempotencyKey: 'visitor_submission_123456789', privacyNoticeVersion: 'v1', privacyAcknowledged: true as const,
      fullName: 'Test Visitor', email: 'visitor@example.test', idType: 'Approved government ID',
      idImage: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', confirmedReadable: true as const },
      purposeCategory: 'MEETING_EMPLOYEE', hostId: 'employee-1', expectedArrival: '2026-10-22T02:00:00.000Z',
    };
    api.post.mockResolvedValueOnce({ data: { data: { id: 'visitor-1', referenceNumber: 'HV-1', approvalStatus: 'PENDING', identityVerificationStatus: 'PROVIDER_NOT_CONFIGURED' } } });
    await visitorService.submitKioskRegistration(payload);
    expect(api.post).toHaveBeenCalledWith('/visitor-kiosk/register', payload);
  });

  it('keeps manual identity review and visit approval as separate protected operations', async () => {
    api.post.mockResolvedValue({ data: { data: {} } });
    await visitorService.manualIdentityReview('visitor-1', 'APPROVE', 'Original ID inspected by authorized staff.');
    await visitorService.decideApproval('visitor-1', 'APPROVE', 'Visit approved by receiving operation.');
    expect(api.post).toHaveBeenNthCalledWith(1, '/visitors/visitor-1/manual-identity-review', {
      decision: 'APPROVE', notes: 'Original ID inspected by authorized staff.',
    });
    expect(api.post).toHaveBeenNthCalledWith(2, '/visitors/visitor-1/approval', {
      decision: 'APPROVE', reason: 'Visit approved by receiving operation.',
    });
  });

  it('requests private identity artifacts through the authenticated visitor function route', async () => {
    const artifacts = [{ id: 'artifact-1', signedUrl: 'https://project.supabase.co/storage/v1/object/sign/private/path' }];
    api.get.mockResolvedValueOnce({ data: { data: artifacts } });
    await expect(visitorService.getIdentityArtifacts('visitor-1')).resolves.toBe(artifacts);
    expect(api.get).toHaveBeenCalledWith('/visitors/visitor-1/identity-artifacts');
  });

  it('inspects an issued visitor QR without using reservation QR endpoints', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { referenceNumber: 'HV-1', status: 'REGISTERED' } } });
    await visitorService.inspectVisitorPass('vst_test_token');
    expect(api.post).toHaveBeenCalledWith('/visitor-pass/inspect', { token: 'vst_test_token' });
  });
});
