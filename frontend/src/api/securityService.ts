import { apiClient } from './client';
import { supabaseMonitoringService } from './supabaseMonitoringService';
import type {
  SecurityMetrics, SecurityLog, BlockedIp, ActiveSession, SecurityAlert,
} from '../types';

export const securityService = {
  async getMetrics(): Promise<SecurityMetrics> {
    const telemetry = await supabaseMonitoringService.getLiveDashboardCounts();
    const d = telemetry.data;
    return {
      activeSessions: d.activeSessionsCount,
      blockedIpsCount: d.blockedIpsCount,
      activeAlertsCount: d.activeAlertsCount,
      failedLoginAttempts: d.failedLoginAttemptsCount,
      ddosBlockedRequests: 0,
      suspiciousActivitiesCount: d.activeAlertsCount,
    };
  },

  async getLogs(_params?: Record<string, string>): Promise<SecurityLog[]> {
    return supabaseMonitoringService.getRecentSecurityLogs(20);
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
