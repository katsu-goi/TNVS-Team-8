import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('./client', () => ({ apiClient: api }));
import { visitorKioskConfigService } from './visitorKioskConfigService';

describe('visitor kiosk administrator API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('uses the protected administrator configuration endpoint', async () => {
    const state = { readiness: { ready: false }, config: { revision: 1 } };
    api.get.mockResolvedValueOnce({ data: { data: state } });
    await expect(visitorKioskConfigService.load()).resolves.toBe(state);
    expect(api.get).toHaveBeenCalledWith('/admin/visitor-kiosk-config');
  });

  it('sends optimistic revision and audit reason when saving', async () => {
    const payload = { expectedRevision: 3, changeReason: 'Approved policy update' } as never;
    api.put.mockResolvedValueOnce({ data: { data: { config: { revision: 4 } } } });
    await visitorKioskConfigService.update(payload);
    expect(api.put).toHaveBeenCalledWith('/admin/visitor-kiosk-config', payload);
  });

  it('uses protected visitor-function routes for Gmail management', async () => {
    const status = { provider: 'GMAIL', connected: false };
    api.get.mockResolvedValueOnce({ data: { data: status } });
    await expect(visitorKioskConfigService.loadGmailOAuthStatus()).resolves.toBe(status);
    expect(api.get).toHaveBeenCalledWith('/visitor/admin/gmail-oauth/status');

    const authorization = { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth' };
    api.post.mockResolvedValueOnce({ data: { data: authorization } });
    await expect(visitorKioskConfigService.startGmailOAuth()).resolves.toBe(authorization);
    expect(api.post).toHaveBeenCalledWith('/visitor/admin/gmail-oauth/authorize');

    api.post.mockResolvedValueOnce({ data: { data: { connected: false } } });
    await visitorKioskConfigService.disconnectGmail('Rotating the authorized sender');
    expect(api.post).toHaveBeenCalledWith('/visitor/admin/gmail-oauth/disconnect', { reason: 'Rotating the authorized sender' });
  });
});
