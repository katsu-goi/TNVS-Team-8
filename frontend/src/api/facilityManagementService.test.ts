import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
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
    api.post.mockResolvedValue({ data: { data: { id: 'f1', facility_name: 'Hub', capacity: 12, floor_plan_url: 'https://example.com/plan.png' } } });
    const file = new File(['image'], 'plan.png', { type: 'image/png' });
    expect(await service.uploadFloorPlan('f1', file)).toEqual(expect.objectContaining({ id: 'f1', floorPlanUrl: 'https://example.com/plan.png' }));
    const [path, body, config] = api.post.mock.calls[0];
    expect(path).toBe('/facilities/management/f1/floor-plan');
    expect(body.get('file')).toBe(file);
    expect(config.headers['Content-Type']).toBeUndefined();
  });
  it('rejects active image formats before upload', async () => {
    await expect(service.uploadFloorPlan('f1', new File(['<svg/>'], 'plan.svg', { type: 'image/svg+xml' }))).rejects.toThrow('PNG, JPEG, or WebP');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('rejects floor plans larger than 5 MB before upload', async () => {
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' });
    await expect(service.uploadFloorPlan('f1', file)).rejects.toThrow('5 MB');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('creates a facility without requiring an image and archives through status', async () => {
    const input = { facilityName: 'Hub', code: 'HUB-1', type: 'OFFICE', capacity: 20, amenities: [], status: 'AVAILABLE', active: true };
    api.post
      .mockResolvedValueOnce({ data: { data: { id: 'f1', facility_name: 'Hub', code: 'HUB-1', capacity: 20, active: true } } })
      .mockResolvedValueOnce({ data: { data: { id: 'f1', facility_name: 'Hub', code: 'HUB-1', capacity: 20, active: false, status: 'INACTIVE' } } });
    expect(await service.createFacility(input)).toEqual(expect.objectContaining({ id: 'f1', code: 'HUB-1' }));
    expect(await service.setFacilityActive('f1', false)).toEqual(expect.objectContaining({ active: false, status: 'INACTIVE' }));
    expect(api.post).toHaveBeenNthCalledWith(1, '/facilities/management', expect.objectContaining({ code: 'HUB-1', capacity: 20 }));
    expect(api.post).toHaveBeenNthCalledWith(2, '/facilities/management/f1/status', { active: false });
  });
  it('maps saved pins and propagates failed writes', async () => {
    api.post.mockResolvedValue({ data: { data: { id: 'p1', facility_id: 'f1', x: '25', y: '50', title: 'Door' } } });
    expect(await service.createPin({ facilityId: 'f1', x: 25, y: 50, title: 'Door' })).toEqual(expect.objectContaining({ id: 'p1', facilityId: 'f1', x: 25, y: 50 }));
    api.delete.mockRejectedValue(new Error('Access denied'));
    await expect(service.deletePin('f1', 'p1')).rejects.toThrow('Access denied');
  });
  it('loads the canonical facility detail and facility-scoped workspace resources', async () => {
    api.get
      .mockResolvedValueOnce({ data: { data: { id: 'f1', facility_name: 'Main Hub', space_count: 3, active_reservation_count: 2 } } })
      .mockResolvedValueOnce({ data: { data: [{ id: 's1', facility_id: 'f1', name: 'Board Room', room_number: '101', capacity: 10 }] } })
      .mockResolvedValueOnce({ data: { data: [{ id: 'r1', title: 'Review' }] } });
    expect(await service.getFacility('f1')).toEqual(expect.objectContaining({ id: 'f1', spaceCount: 3, activeReservationCount: 2 }));
    expect(await service.listSpaces('f1')).toEqual([expect.objectContaining({ id: 's1', facilityId: 'f1', roomNumber: '101' })]);
    expect(await service.listReservations('f1', 'CONFIRMED')).toEqual([expect.objectContaining({ id: 'r1' })]);
    expect(api.get).toHaveBeenNthCalledWith(1, '/facilities/management/f1');
    expect(api.get).toHaveBeenNthCalledWith(2, '/facilities/management/f1/spaces');
    expect(api.get).toHaveBeenNthCalledWith(3, '/facilities/management/f1/reservations', { params: { status: 'CONFIRMED' } });
  });
  it('uses scoped PATCH routes for facility, space, and pin updates', async () => {
    const facility = { facilityName: 'Hub', code: 'HUB-1', type: 'OFFICE', capacity: 20, amenities: [], status: 'AVAILABLE', active: true };
    api.patch
      .mockResolvedValueOnce({ data: { data: { id: 'f1', facility_name: 'Hub', code: 'HUB-1', capacity: 20 } } })
      .mockResolvedValueOnce({ data: { data: { id: 's1', facility_id: 'f1', name: 'Room', room_number: '1', capacity: 2 } } })
      .mockResolvedValueOnce({ data: { data: { id: 'p1', facility_id: 'f1', title: 'Door', x: 1, y: 2 } } });
    await service.updateFacility('f1', facility);
    await service.updateSpace('f1', 's1', { name: 'Room', roomNumber: '1', building: null, floor: null, floorNumber: null, capacity: 2, type: 'OFFICE', status: 'AVAILABLE', description: null, active: true });
    await service.updatePin('f1', 'p1', { title: 'Door', x: 1, y: 2 });
    expect(api.patch.mock.calls.map(([path]) => path)).toEqual(['/facilities/management/f1', '/facilities/management/f1/spaces/s1', '/facilities/management/f1/pins/p1']);
  });
  it('removes floor plans through the protected facility endpoint', async () => {
    api.delete.mockResolvedValue({ data: { data: { id: 'f1' } } });
    await service.removeFloorPlan('f1');
    expect(api.delete).toHaveBeenCalledWith('/facilities/management/f1/floor-plan');
  });
});
