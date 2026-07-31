import { apiClient } from './client';
import type {
  SecurityMetrics, SecurityLog, BlockedIp, ActiveSession, SecurityAlert,
} from '../types';

const MOCK_SECURITY_LOGS: SecurityLog[] = [
  { id: 'sec-101', module: 'Auth', action: 'User Login Success', timestamp: new Date().toISOString(), ipAddress: '192.168.1.45', riskLevel: 'LOW', status: 'SUCCESS', fullName: 'System Admin', role: 'ADMIN' },
  { id: 'sec-102', module: 'Contract Management', action: 'AI Clause Risk Scan', timestamp: new Date(Date.now() - 300000).toISOString(), ipAddress: '192.168.1.12', riskLevel: 'LOW', status: 'SUCCESS', fullName: 'Legal Officer', role: 'LEGAL' },
  { id: 'sec-103', module: 'Visitor System', action: 'OCR Valid ID Scan', timestamp: new Date(Date.now() - 600000).toISOString(), ipAddress: '192.168.1.88', riskLevel: 'LOW', status: 'SUCCESS', fullName: 'Security Guard', role: 'SECURITY' },
];

export const securityService = {
  async getMetrics(): Promise<SecurityMetrics> {
    try {
      const { data } = await apiClient.get('/security/admin/metrics');
      const m = data ?? {};
      return {
        activeSessions: m.activeSessions ?? 14,
        blockedIpsCount: m.blockedIpsCount ?? 2,
        activeAlertsCount: m.activeAlertsCount ?? 0,
        failedLoginAttempts: m.failedLoginAttempts ?? 0,
        ddosBlockedRequests: m.ddosBlockedRequests ?? 0,
        suspiciousActivitiesCount: m.suspiciousActivitiesCount ?? 0,
      };
    } catch {
      return {
        activeSessions: 14,
        blockedIpsCount: 2,
        activeAlertsCount: 0,
        failedLoginAttempts: 0,
        ddosBlockedRequests: 0,
        suspiciousActivitiesCount: 0,
      };
    }
  },

  async getLogs(params?: Record<string, string>): Promise<SecurityLog[]> {
    try {
      const { data } = await apiClient.get('/security/admin/logs', { params });
      return data?.content ?? data ?? MOCK_SECURITY_LOGS;
    } catch {
      return MOCK_SECURITY_LOGS;
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
