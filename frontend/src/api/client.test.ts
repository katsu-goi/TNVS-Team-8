import { describe, expect, it, vi } from 'vitest';
import { apiClient, getApiUrl, safeFetchJson } from './client';

describe('safeFetchJson', () => {
  it('throws a normalized error instead of converting failures to null', async () => {
    vi.spyOn(apiClient, 'request').mockRejectedValueOnce(new Error('network unavailable'));
    await expect(safeFetchJson('/example')).rejects.toThrow('network unavailable');
  });
});

describe('Supabase Edge Function routing', () => {
  it('preserves role aliases after the deployed function name', () => {
    expect(getApiUrl('/facilities-officer/dashboard/summary')).toBe('/api/facilities/facilities-officer/dashboard/summary');
    expect(getApiUrl('/facilities-manager/dashboard/kpi')).toBe('/api/facilities/facilities-manager/dashboard/kpi');
  });

  it('preserves the plural visitor API beneath the singular function name', () => {
    expect(getApiUrl('/visitors')).toBe('/api/visitor/visitors');
    expect(getApiUrl('/visitors/occupancy')).toBe('/api/visitor/visitors/occupancy');
  });

  it('does not duplicate an API prefix that already matches its function', () => {
    expect(getApiUrl('/facilities/management')).toBe('/api/facilities/management');
  });
});
