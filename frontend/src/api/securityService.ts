import { apiClient } from './client';
import type {
  SecurityMetrics, SecurityLog, BlockedIp, ActiveSession, SecurityAlert,
} from '../types';

export const securityService = {
  async getMetrics(): Promise<SecurityMetrics> {
    const empty: SecurityMetrics = {
      activeSessions: 0,
      blockedIpsCount: 0,
      activeAlertsCount: 0,
      failedLoginAttempts: 0,
      ddosBlockedRequests: 0,
      suspiciousActivitiesCount: 0,
    };
    try {
      const { data } = await apiClient.get('/security/admin/metrics');
      const m = data ?? {};
      return {
        activeSessions: m.activeSessions ?? 0,
        blockedIpsCount: m.blockedIpsCount ?? 0,
        activeAlertsCount: m.activeAlertsCount ?? 0,
        failedLoginAttempts: m.failedLoginAttempts ?? 0,
        ddosBlockedRequests: m.ddosBlockedRequests ?? 0,
        suspiciousActivitiesCount: m.suspiciousActivitiesCount ?? 0,
      };
    } catch {
      return empty;
    }
  },

  async getLogs(params?: Record<string, string>): Promise<SecurityLog[]> {
    try {
      const { data } = await apiClient.get('/security/admin/logs', { params });
      return data?.content ?? data ?? [];
    } catch {
      return [];
    }
  },

  async getActiveSessions(): Promise<ActiveSession[]> {
    try {
      const { data } = await apiClient.get('/security/admin/sessions');
      return data ?? [];
    } catch {
      return [];
    }
  },

  async getBlockedIps(): Promise<BlockedIp[]> {
    try {
      const { data } = await apiClient.get('/security/admin/blocked-ips');
      return data ?? [];
    } catch {
      return [];
    }
  },

  async getAlerts(): Promise<SecurityAlert[]> {
    try {
      const { data } = await apiClient.get('/security/admin/alerts');
      return data ?? [];
    } catch {
      return [];
    }
  },

  async blockIp(ipAddress: string, reason: string, durationMinutes?: number): Promise<BlockedIp> {
    const { data } = await apiClient.post('/security/admin/blocked-ips', { ipAddress, reason, durationMinutes });
    return data;
  },

  async unblockIp(ipAddress: string): Promise<void> {
    await apiClient.delete(`/security/admin/blocked-ips/${ipAddress}`);
  },

  async revokeSession(sessionId: string): Promise<void> {
    await apiClient.post(`/security/admin/sessions/${sessionId}/revoke`);
  },

  async resolveAlert(alertId: string, resolvedBy: string): Promise<void> {
    await apiClient.post(`/security/admin/alerts/${alertId}/resolve`, { resolvedBy });
  },
};
