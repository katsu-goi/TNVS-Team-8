import { apiClient } from './client';
import type {
  SecurityMetrics, SecurityLog, BlockedIp, ActiveSession, SecurityAlert,
} from '../types';

export const securityService = {
  async getMetrics(): Promise<SecurityMetrics> {
    const { data } = await apiClient.get('/security/admin/metrics');
    return data?.data ?? data;
  },

  async getLogs(_params?: Record<string, string>): Promise<SecurityLog[]> {
    try {
      const { data } = await apiClient.get('/security/admin/logs', { params: _params });
      const page = data?.data ?? data;
      return Array.isArray(page) ? page : page?.content ?? [];
    } catch {
      return [];
    }
  },

  async getActiveSessions(): Promise<ActiveSession[]> {
    try {
      const { data } = await apiClient.get('/security/admin/sessions');
      const arr = Array.isArray(data) ? data : data?.data ?? [];
      return (arr as any[]).map(s => ({
        id: String(s.id ?? s.sessionId ?? s.userId ?? ''),
        sessionId: s.sessionId,
        userId: s.userId,
        username: s.username,
        fullName: s.fullName || s.username,
        role: s.role || 'EMPLOYEE',
        ipAddress: s.ipAddress || '127.0.0.1',
        browser: s.browser,
        deviceName: s.deviceName || 'Web Browser',
        loginTime: s.loginTime || new Date().toISOString(),
        lastActivity: s.lastActivity || new Date().toISOString(),
        status: s.status || 'ACTIVE',
      }));
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
    const { data } = await apiClient.post('/security/admin/blocked-ips', null, {
      params: { ipAddress, reason, durationMinutes },
    });
    return data;
  },

  async unblockIp(ipAddress: string): Promise<void> {
    await apiClient.delete(`/security/admin/blocked-ips/${ipAddress}`);
  },

  async revokeSession(sessionId: string): Promise<void> {
    await apiClient.post(`/security/admin/sessions/${sessionId}/revoke`);
  },

  async resolveAlert(alertId: string, resolvedBy: string): Promise<void> {
    await apiClient.post(`/security/admin/alerts/${alertId}/resolve`, null, {
      params: { resolvedBy },
    });
  },
};
