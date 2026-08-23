import { apiClient } from './client';
import type { AnalyticsData } from '../types';

/**
 * The shape the dashboard is entitled to when the analytics request fails.
 *
 * This is deliberately typed as `AnalyticsData` rather than cast with `as any`.
 * The previous fallback returned `{ overview, timeSeries, breakdown }` - three keys
 * that appear nowhere in `AnalyticsData` - and `as any` is what let it compile.
 * `AnalyticsDashboard` reads `data.activity.series` on its first render, so the
 * fallback did not degrade the page, it crashed it: `activity` was undefined and the
 * uncaught TypeError took the whole route down to a blank screen.
 *
 * Typing it means the compiler now checks this value against every field the
 * dashboard can read, so a field added to `AnalyticsData` cannot silently reappear
 * as a runtime crash on the one path nobody exercises by hand - the failure path.
 */
function emptyAnalytics(from?: Date, to?: Date): AnalyticsData {
  return {
    period: {
      from: from ? from.toISOString() : '',
      to: to ? to.toISOString() : '',
      label: 'Unavailable',
    },
    kpis: [],
    activity: { labels: [], series: [] },
    security: {
      total: 0, critical: 0, high: 0, medium: 0, low: 0,
      failedLogins: 0, blockedIps: 0, byRiskLevel: [], overTime: [],
    },
    ai: {
      totalRequests: 0, successful: 0, failed: 0, successRate: null,
      avgResponseTimeMs: null, source: 'unavailable', providers: [], requestsByProvider: [],
    },
    health: {
      overallStatus: 'UNKNOWN', healthyCount: 0, warningCount: 0,
      offlineCount: 0, errorCount: 0, components: [],
    },
    audit: { total: 0, byModule: [], byAction: [], mostActiveModule: null, mostCommonAction: null },
    documents: { total: 0, uploaded: 0, archived: 0, aiClassified: 0 },
    contracts: { total: 0, active: 0, expiringSoon: 0, expired: 0, renewed: 0 },
    backups: {
      total: 0, successCount: 0, failedCount: 0, successRate: null,
      lastSuccessfulAt: null, lastBackupAt: null,
    },
    insights: [],
  };
}

export async function fetchAnalytics(from?: Date, to?: Date): Promise<AnalyticsData> {
  try {
    const params: Record<string, string> = {};
    if (from) params.from = from.toISOString();
    if (to) params.to = to.toISOString();
    // `/admin/analytics`, not `/analytics/admin/analytics`. AnalyticsController maps
    // `/v1/admin/analytics` and the axios client already contributes `/api/v1`, so the
    // extra `analytics/` segment made every request a 404 - which meant the catch below
    // was not a safety net for an outage, it was the only branch this function ever took.
    const { data } = await apiClient.get('/admin/analytics', { params });
    return data?.data ?? data;
  } catch (err) {
    console.warn('Analytics API unavailable, returning empty analytics structure:', err);
    return emptyAnalytics(from, to);
  }
}
