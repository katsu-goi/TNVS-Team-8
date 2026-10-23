import { describe, expect, it, vi } from 'vitest';
import { apiClient, extractErrorMessage, extractRequestId, getApiUrl, safeFetchJson } from './client';

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

  it('builds the full function-prefixed pathname for the public kiosk configuration', () => {
    expect(getApiUrl('/visitor-kiosk/config')).toBe(
      'https://dunijfrvfozwlykpkfhy.supabase.co/functions/v1/visitor/visitor-kiosk/config',
    );
  });

  it('routes the secure visitor status request through the deployed visitor function', () => {
    expect(getApiUrl('/visitor-status/inspect')).toBe(
      'https://dunijfrvfozwlykpkfhy.supabase.co/functions/v1/visitor/visitor-status/inspect',
    );
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

  it('reads a safe support correlation ID from response headers', () => {
    expect(extractRequestId({ response: { headers: { 'x-request-id': 'request-1234' } } })).toBe('request-1234');
  });
});
