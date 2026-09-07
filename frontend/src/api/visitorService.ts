import { apiClient } from './client';
import type {
  IdType,
  VisitorVerification,
  VisitorWatchlistEntry,
  WatchlistEntryStatus,
} from '../types/visitors';

/**
 * Visitor verification + watchlist API (Task 4).
 *
 * Paths are relative to the axios `baseURL` (`/api/v1`), matching the other
 * service modules in this directory.
 */
export const visitorService = {
  async listVisitors(): Promise<any[]> {
    const { data } = await apiClient.get('/visitors');
    return data?.data ?? [];
  },

  /** Runs the heuristic ID parse + watchlist screen. `idNumber` falls back to the registered one. */
  async verifyVisitor(id: string, idType: IdType, idNumber?: string): Promise<VisitorVerification> {
    const { data } = await apiClient.post(`/visitors/${id}/verify`, { idType, idNumber });
    return data?.data;
  },

  async listVerifications(id: string): Promise<VisitorVerification[]> {
    const { data } = await apiClient.get(`/visitors/${id}/verifications`);
    return data?.data ?? [];
  },

  async listWatchlist(): Promise<VisitorWatchlistEntry[]> {
    const { data } = await apiClient.get('/visitors/watchlist');
    return data?.data ?? [];
  },

  async addWatchlistEntry(
    fullName: string,
    idNumber?: string,
    reason?: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'HIGH',
  ): Promise<VisitorWatchlistEntry> {
    const { data } = await apiClient.post('/visitors/watchlist', { fullName, idNumber, reason, severity });
    return data?.data;
  },

  async updateWatchlistStatus(
    id: string,
    status: WatchlistEntryStatus,
  ): Promise<VisitorWatchlistEntry> {
    const { data } = await apiClient.post(`/visitors/watchlist/${id}/status`, { status });
    return data?.data;
  },

  async checkIn(id: string): Promise<any> {
    const { data } = await apiClient.post(`/visitors/${id}/check-in`);
    return data?.data;
  },

  async checkOut(id: string): Promise<any> {
    const { data } = await apiClient.post(`/visitors/${id}/check-out`);
    return data?.data;
  },

  async reviewVisitor(
    visitorId: string,
    verificationId: string,
    decision: 'CLEAR' | 'BLOCK',
    notes: string,
  ): Promise<VisitorVerification> {
    const { data } = await apiClient.post(
      `/visitors/${visitorId}/verifications/${verificationId}/review`,
      { decision, notes },
    );
    return data?.data;
  },

  async history(id: string): Promise<any[]> {
    const { data } = await apiClient.get(`/visitors/${id}/history`);
    return data?.data ?? [];
  },
};
