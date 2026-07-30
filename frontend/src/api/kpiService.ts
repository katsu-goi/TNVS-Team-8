import { apiClient } from './client';
import type { SystemKpi } from '../types';

export const kpiService = {
  async loadKpi(): Promise<SystemKpi> {
    const { data } = await apiClient.get('/admin/kpi');
    return data?.data ?? {
      facilities: { totalFacilities: 0, totalRooms: 0, activeRooms: 0, bookingsToday: 0, pendingApprovals: 0, checkedIn: 0 },
      visitors: { totalVisitors: 0, onSite: 0, checkedIn: 0, registered: 0, checkedOut: 0 },
      documents: { totalDocuments: 0, archived: 0, approved: 0, pendingReview: 0, draft: 0 },
      records: { totalPolicies: 0, activePolicies: 0 },
      legal: { totalCases: 0, open: 0, inProgress: 0, pendingHearing: 0, closed: 0 },
      contracts: { totalContracts: 0, active: 0, underReview: 0, draft: 0, expired: 0, pendingApproval: 0, totalContractValue: 0 },
      global: { activeUsers: 0, activeSessions: 0, failedLoginAttempts: 0, blockedIps: 0, activeAlerts: 0, unreadNotifications: 0 },
    };
  },
};
