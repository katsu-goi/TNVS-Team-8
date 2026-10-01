import axios from 'axios';
import { fetchAnalytics } from './analyticsService';
import { securityService } from './securityService';

export async function loadDashboardAnalytics(superAdministrator: boolean) {
  const [analytics, security] = await Promise.all([
    fetchAnalytics({ preset: 'today' }),
    superAdministrator ? securityService.getMetrics() : Promise.resolve(null),
  ]);
  if (superAdministrator) {
    const overview = analytics.enterprise?.overview;
    if (analytics.scope !== 'SUPER_ADMIN' || !overview || !security) {
      throw new Error('Invalid enterprise dashboard response');
    }
    return { overview, security };
  }
  if (analytics.scope !== 'SYSTEM_ADMIN' || !analytics.operational) {
    throw new Error('Invalid operational dashboard response');
  }
  return {
    overview: null,
    security: {
      activeSessions: analytics.operational.activeSessions,
      failedLoginAttempts: analytics.operational.failedEvents,
      blockedIpsCount: analytics.operational.blockedIps,
      activeAlertsCount: analytics.operational.activeSecurityAlerts,
    },
  };
}

export function dashboardErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const code = error.response?.data?.errorCode ?? error.response?.data?.code;
    if (status === 401) return 'Your session could not be verified.';
    if (status === 403 || code === '42501' || code === 'ACCESS_DENIED') {
      return 'You do not have permission to access this resource.';
    }
    if (!error.response) return 'Unable to reach the server.';
  }
  return 'Unable to retrieve dashboard data.';
}
