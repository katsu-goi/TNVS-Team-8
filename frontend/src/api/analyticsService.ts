import { apiClient } from './client';
import type { AnalyticsData } from '../types';

export async function fetchAnalytics(from?: Date, to?: Date): Promise<AnalyticsData> {
  try {
    const params: Record<string, string> = {};
    if (from) params.from = from.toISOString();
    if (to) params.to = to.toISOString();
    const { data } = await apiClient.get('/admin/analytics', { params });
    return data?.data ?? data;
  } catch (err) {
    console.warn('Analytics API unavailable, returning empty analytics structure:', err);
    return {
      overview: { totalUsers: 0, totalFacilities: 0, totalReservations: 0, totalVisitors: 0 },
      timeSeries: [],
      breakdown: [],
    } as any;
  }
}