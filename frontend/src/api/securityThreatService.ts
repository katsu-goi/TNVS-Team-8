import { apiClient } from './client';
import type {
  ThreatMapDiagnostics,
  ThreatMapResponse,
  ThreatMapStats,
  ThreatWindow,
} from '../types/threatMap';

// The backend wraps every payload in ApiResponse { success, message, data }.
// Axios gives us the full envelope as `response.data`, so the real payload
// lives at `response.data.data`. Fall back defensively in case a caller
// (or future endpoint) returns the payload directly.

export interface TestEventResult {
  eventId: string;
  ip: string;
  privateIp: boolean;
  geolocation: {
    country: string | null;
    countryCode: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    isp: string | null;
    asn: string | null;
  } | null;
}

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

  async fetchDiagnostics(): Promise<ThreatMapDiagnostics | null> {
    try {
      const { data } = await apiClient.get('/security/ip-threats/diagnostics');
      return data?.data ?? data ?? null;
    } catch {
      return null;
    }
  },

  async triggerTestEvent(): Promise<TestEventResult | null> {
    try {
      const { data } = await apiClient.post('/security/ip-threats/test-event');
      return data?.data ?? data ?? null;
    } catch {
      return null;
    }
  },
};