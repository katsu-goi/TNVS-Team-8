import { apiClient } from './client';
import type { ThreatMapResponse, ThreatMapStats, ThreatWindow } from '../types/threatMap';

// The backend wraps every payload in ApiResponse { success, message, data }.
// Axios gives us the full envelope as `response.data`, so the real payload
// lives at `response.data.data`. Fall back defensively in case a caller
// (or future endpoint) returns the payload directly.

export const securityThreatService = {
  async fetchMap(window: ThreatWindow): Promise<ThreatMapResponse | null> {
    try {
      const { data } = await apiClient.get('/security/ip-threats/vector-map', {
        params: { window },
      });
      return data?.data ?? data ?? null;
    } catch {
      return null;
    }
  },

  async fetchStats(window: ThreatWindow): Promise<ThreatMapStats | null> {
    try {
      const { data } = await apiClient.get('/security/ip-threats/stats', {
        params: { window },
      });
      return data?.data ?? data ?? null;
    } catch {
      return null;
    }
  },
};