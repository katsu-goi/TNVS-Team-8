import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
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
});
