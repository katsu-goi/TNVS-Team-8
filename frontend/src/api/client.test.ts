import { describe, expect, it, vi } from 'vitest';
import { apiClient, safeFetchJson } from './client';

describe('safeFetchJson', () => {
  it('throws a normalized error instead of converting failures to null', async () => {
    vi.spyOn(apiClient, 'request').mockRejectedValueOnce(new Error('network unavailable'));
    await expect(safeFetchJson('/example')).rejects.toThrow('network unavailable');
  });
});
