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
});
