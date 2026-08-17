import { apiClient } from './client';
import type { AnalyticsData } from '../types';

export async function fetchAnalytics(from?: Date, to?: Date): Promise<AnalyticsData> {
  const params: Record<string, string> = {};
  if (from) params.from = from.toISOString();
  if (to) params.to = to.toISOString();
  const { data } = await apiClient.get('/admin/analytics', { params });
  return data?.data ?? data;
}