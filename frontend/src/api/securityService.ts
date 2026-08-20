import { apiClient } from './client';
import { supabaseMonitoringService } from './supabaseMonitoringService';
import { supabase } from '../lib/supabase';
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
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('active_sessions')
        .select('*')
        .order('login_time', { ascending: false });

      if (error || !data) return [];

      return data.map(s => ({
        id: s.id?.toString() || s.session_id || s.user_id,
        sessionId: s.session_id,
        userId: s.user_id,
        username: s.username,
        fullName: s.full_name || s.username,
        role: s.role || 'EMPLOYEE',
        ipAddress: s.ip_address || '127.0.0.1',
        deviceName: s.device_name || 'Web Browser',
        loginTime: s.login_time || new Date().toISOString(),
        lastActivity: s.last_activity || new Date().toISOString(),
        status: s.revoked_at ? 'REVOKED' : 'ACTIVE',
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
