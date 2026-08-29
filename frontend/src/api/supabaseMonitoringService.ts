import { apiClient } from './client';
import type { SecurityLog } from '../types';

export type TelemetryStatus = 'LIVE' | 'EMPTY' | 'DISCONNECTED' | 'INITIALIZING';

export interface TelemetryMetric<T> {
  data: T;
  status: TelemetryStatus;
  error?: string;
  lastUpdated: string;
}

export interface LiveDashboardCounts {
  totalUsers: number;
  totalDocuments: number;
  totalContracts: number;
  totalFacilities: number;
  totalReservations: number;
  totalVisitors: number;
  totalLegalCases: number;
  activeSessionsCount: number;
  failedLoginAttemptsCount: number;
  blockedIpsCount: number;
  activeAlertsCount: number;
  unreadNotificationsCount: number;
}

export interface SubsystemConnectivityStatus {
  key: string;
  name: string;
  status: 'HEALTHY' | 'WARNING' | 'OFFLINE';
  latencyMs: number;
  recordCount: number;
  lastChecked: string;
  detail: string;
}

export const supabaseMonitoringService = {
  /**
   * Fetch live counts from the edge-function KPI endpoint (service role
   * under the hood — no anon table access needed).
   */
  async getLiveDashboardCounts(): Promise<TelemetryMetric<LiveDashboardCounts>> {
    try {
      const { data } = await apiClient.get('/admin/kpi');
      const k = (data?.data ?? data ?? {}) as Record<string, any>;

      const counts: LiveDashboardCounts = {
        totalUsers: k.global?.activeUsers ?? 0,
        totalDocuments: k.documents?.totalDocuments ?? 0,
        totalContracts: k.contracts?.totalContracts ?? 0,
        totalFacilities: k.facilities?.totalFacilities ?? 0,
        totalReservations: k.facilities?.bookingsToday ?? 0,
        totalVisitors: k.visitors?.totalVisitors ?? 0,
        totalLegalCases: k.legal?.totalCases ?? 0,
        activeSessionsCount: k.global?.activeSessions ?? 0,
        failedLoginAttemptsCount: k.global?.failedLoginAttempts ?? 0,
        blockedIpsCount: k.global?.blockedIps ?? 0,
        activeAlertsCount: k.global?.activeAlerts ?? 0,
        unreadNotificationsCount: k.global?.unreadNotifications ?? 0,
      };

      const hasAnyData = Object.values(counts).some(v => v > 0);

      return {
        data: counts,
        status: hasAnyData ? 'LIVE' : 'EMPTY',
        lastUpdated: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error('[Telemetry] Fetch failed:', err);
      return {
        data: {
          totalUsers: 0,
          totalDocuments: 0,
          totalContracts: 0,
          totalFacilities: 0,
          totalReservations: 0,
          totalVisitors: 0,
          totalLegalCases: 0,
          activeSessionsCount: 0,
          failedLoginAttemptsCount: 0,
          blockedIpsCount: 0,
          activeAlertsCount: 0,
          unreadNotificationsCount: 0,
        },
        status: 'DISCONNECTED',
        error: err?.message || 'Failed to query database',
        lastUpdated: new Date().toISOString(),
      };
    }
  },

  /**
   * Fetch recent security logs through the authenticated security endpoint.
   */
  async getRecentSecurityLogs(limit = 10): Promise<SecurityLog[]> {
    try {
      const { data } = await apiClient.get('/security/admin/logs', {
        params: { page: 0, size: limit },
      });
      const page = data?.data ?? data ?? {};
      return (page.content ?? []).map((row: any) => ({
        id: String(row.id ?? Math.random()),
        timestamp: row.timestamp || row.createdAt || new Date().toISOString(),
        username: row.username ?? undefined,
        fullName: row.fullName || row.username || 'System User',
        role: row.role ?? undefined,
        module: row.module || 'SECURITY',
        action: row.action || 'SECURITY_EVENT',
        riskLevel: row.riskLevel || 'LOW',
        ipAddress: row.ipAddress || '127.0.0.1',
        status: row.status || 'SUCCESS',
      }));
    } catch {
      return [];
    }
  },

  /**
   * Test connectivity and latency across all core subsystems using the
   * monitoring edge function's health snapshot.
   */
  async checkSubsystemConnectivity(): Promise<SubsystemConnectivityStatus[]> {
    try {
      const { data } = await apiClient.get('/monitoring/admin/system-monitoring/subsystems');
      const snapshot = (data?.data ?? data) as Record<string, any> | null;
      const subs: any[] = Array.isArray(snapshot?.subsystems) ? snapshot.subsystems : [];
      return subs.map(s => ({
        key: s.key,
        name: s.name,
        status: (s.status === 'HEALTHY' ? 'HEALTHY' : s.status === 'WARNING' ? 'WARNING' : 'OFFLINE') as 'HEALTHY' | 'WARNING' | 'OFFLINE',
        latencyMs: s.latencyAvgMs ?? 0,
        recordCount: s.errorCount ?? 0,
        lastChecked: s.lastSync || new Date().toISOString(),
        detail: Array.isArray(s.checks) && s.checks.length
          ? s.checks.map((c: any) => `${c.name}: ${c.status}`).join(', ')
          : `Status: ${s.status}`,
      }));
    } catch {
      return [];
    }
  },
};
