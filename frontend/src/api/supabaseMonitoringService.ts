import { apiClient } from './client';
import type { SecurityLog } from '../types';

export type TelemetryStatus = 'LIVE' | 'EMPTY' | 'DISCONNECTED' | 'INITIALIZING';

export interface TelemetryMetric<T> {
  data: T;
  status: TelemetryStatus;
  error?: string;
  lastUpdated: string;
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
        id: String(row.id ?? `${row.action || 'event'}-${row.timestamp || row.createdAt || 'undated'}`),
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
