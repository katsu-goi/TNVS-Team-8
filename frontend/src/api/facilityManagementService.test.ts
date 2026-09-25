import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('./client', () => ({ apiClient: api }));
import { facilityManagementService as service } from './facilityManagementService';

describe('facility management application API integration', () => {
  beforeEach(() => vi.resetAllMocks());
  it('maps persisted facilities including floor plans through the authenticated API', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id: 'f1', facility_name: 'Hub', total_capacity: 12, floor_plan_url: 'https://example.com/plan.png' }] } });
    expect(await service.listFacilities()).toEqual([expect.objectContaining({ id: 'f1', facilityName: 'Hub', capacity: 12, floorPlanUrl: 'https://example.com/plan.png' })]);
    expect(api.get).toHaveBeenCalledWith('/facilities/management');
  });
  it('uploads multipart images without forcing the JSON content type', async () => {
    api.post.mockResolvedValue({ data: { data: { url: 'https://example.com/plan.png' } } });
    const file = new File(['image'], 'plan.png', { type: 'image/png' });
    expect(await service.uploadFloorPlan('f1', file)).toBe('https://example.com/plan.png');
    const [path, body, config] = api.post.mock.calls[0];
    expect(path).toBe('/facilities/management/f1/floor-plan');
    expect(body.get('file')).toBe(file);
    expect(config.headers['Content-Type']).toBeUndefined();
  });
  it('rejects active image formats before upload', async () => {
    await expect(service.uploadFloorPlan('f1', new File(['<svg/>'], 'plan.svg', { type: 'image/svg+xml' }))).rejects.toThrow('PNG, JPEG, or WebP');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('maps saved pins and propagates failed writes', async () => {
    api.post.mockResolvedValue({ data: { data: { id: 'p1', facility_id: 'f1', x: '25', y: '50', title: 'Door' } } });
    expect(await service.createPin({ facilityId: 'f1', x: 25, y: 50, title: 'Door' })).toEqual(expect.objectContaining({ id: 'p1', facilityId: 'f1', x: 25, y: 50 }));
    api.delete.mockRejectedValue(new Error('Access denied'));
    await expect(service.deletePin('p1')).rejects.toThrow('Access denied');
  });
});
