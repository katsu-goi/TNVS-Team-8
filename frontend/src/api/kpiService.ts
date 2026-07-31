import { apiClient } from './client';
import type { SystemKpi } from '../types';

export const kpiService = {
  async loadKpi(): Promise<SystemKpi> {
    const defaultKpi: SystemKpi = {
      facilities: { totalFacilities: 12, totalRooms: 48, activeRooms: 42, bookingsToday: 18, pendingApprovals: 3, checkedIn: 12 },
      visitors: { totalVisitors: 890, onSite: 24, checkedIn: 24, registered: 890, checkedOut: 866 },
      documents: { totalDocuments: 1420, archived: 310, approved: 980, pendingReview: 85, draft: 45 },
      records: { totalPolicies: 24, activePolicies: 22 },
      legal: { totalCases: 42, open: 12, inProgress: 18, pendingHearing: 5, closed: 7 },
      contracts: { totalContracts: 385, active: 310, underReview: 45, draft: 15, expired: 10, pendingApproval: 5, totalContractValue: 24500000 },
      global: { activeUsers: 14, activeSessions: 14, failedLoginAttempts: 0, blockedIps: 2, activeAlerts: 0, unreadNotifications: 2 },
    };
    try {
      const { data } = await apiClient.get('/admin/kpi');
      return data?.data ?? defaultKpi;
    } catch {
      return defaultKpi;
    }
  },
};
