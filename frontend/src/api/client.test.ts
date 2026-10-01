import { describe, expect, it, vi } from 'vitest';
import { apiClient, extractErrorMessage, getApiUrl, safeFetchJson } from './client';

describe('safeFetchJson', () => {
  it('throws a normalized error instead of converting failures to null', async () => {
    vi.spyOn(apiClient, 'request').mockRejectedValueOnce(new Error('network unavailable'));
    await expect(safeFetchJson('/example')).rejects.toThrow('network unavailable');
  });
});

describe('Supabase Edge Function routing', () => {
  it('preserves role aliases after the deployed function name', () => {
    expect(getApiUrl('/facilities-officer/dashboard/summary')).toMatch(/\/facilities\/facilities-officer\/dashboard\/summary$/);
    expect(getApiUrl('/facilities-manager/dashboard/kpi')).toMatch(/\/facilities\/facilities-manager\/dashboard\/kpi$/);
  });

  it('preserves the plural visitor API beneath the singular function name', () => {
    expect(getApiUrl('/visitors')).toMatch(/\/visitor\/visitors$/);
    expect(getApiUrl('/visitors/occupancy')).toMatch(/\/visitor\/visitors\/occupancy$/);
  });

  it('does not duplicate an API prefix that already matches its function', () => {
    const url = getApiUrl('/facilities/management');
    expect(url).toMatch(/\/facilities\/management$/);
    expect(url).not.toMatch(/\/facilities\/facilities\/management$/);
  });
});

describe('extractErrorMessage', () => {
  it('includes the server-authoritative circuit retry time', () => {
    expect(extractErrorMessage({
      response: {
        data: { message: 'AI processing is temporarily unavailable.', data: { retryAfterSeconds: 42 } },
        headers: { 'retry-after': '42' },
      },
    })).toBe('AI processing is temporarily unavailable. Try again in 42 seconds.');
  });
});
