import { supabaseMonitoringService } from './supabaseMonitoringService';
import type { SystemKpi } from '../types';

export const kpiService = {
  async loadKpi(): Promise<SystemKpi> {
    const telemetry = await supabaseMonitoringService.getLiveDashboardCounts();
    const d = telemetry.data;

    return {
      facilities: { totalFacilities: d.totalFacilities, totalRooms: 0, activeRooms: 0, bookingsToday: d.totalReservations, pendingApprovals: 0, checkedIn: 0 },
      visitors: { totalVisitors: d.totalVisitors, onSite: 0, checkedIn: 0, registered: d.totalVisitors, checkedOut: 0 },
      documents: { totalDocuments: d.totalDocuments, archived: 0, approved: d.totalDocuments, pendingReview: 0, draft: 0 },
      records: { totalPolicies: 0, activePolicies: 0 },
      legal: { totalCases: d.totalLegalCases, open: d.totalLegalCases, inProgress: 0, pendingHearing: 0, closed: 0 },
      contracts: { totalContracts: d.totalContracts, active: d.totalContracts, underReview: 0, draft: 0, expired: 0, pendingApproval: 0, totalContractValue: 0 },
      global: {
        activeUsers: d.activeSessionsCount,
        activeSessions: d.activeSessionsCount,
        failedLoginAttempts: d.failedLoginAttemptsCount,
        blockedIps: d.blockedIpsCount,
        activeAlerts: d.activeAlertsCount,
        unreadNotifications: d.unreadNotificationsCount,
      },
    };
  },
};
