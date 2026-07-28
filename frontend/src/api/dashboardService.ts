import { apiClient } from './client';

export interface DashboardStats {
  totalFacilities: number;
  totalReservations: number;
  totalVisitors: number;
  totalDocuments: number;
  totalContracts: number;
  totalLegalCases: number;
  activeSessions: number;
  failedLoginAttempts: number;
  blockedIpsCount: number;
  activeAlertsCount: number;
}

export const dashboardService = {
  async loadFullDashboard(): Promise<{ stats: DashboardStats }> {
    const [dashRes, secRes] = await Promise.all([
      apiClient.get('/dashboard/summary'),
      apiClient.get('/security/admin/metrics'),
    ]);
    const s = dashRes.data?.data ?? {};
    const m = secRes.data ?? {};
    const stats: DashboardStats = {
      totalFacilities: s.totalFacilities ?? 0,
      totalReservations: s.totalReservations ?? 0,
      totalVisitors: s.totalVisitors ?? 0,
      totalDocuments: s.totalDocuments ?? 0,
      totalContracts: s.totalContracts ?? 0,
      totalLegalCases: s.totalLegalCases ?? 0,
      activeSessions: m.activeSessions ?? 0,
      failedLoginAttempts: m.failedLoginAttempts ?? 0,
      blockedIpsCount: m.blockedIpsCount ?? 0,
      activeAlertsCount: m.activeAlertsCount ?? 0,
    };
    return { stats };
  },
};
