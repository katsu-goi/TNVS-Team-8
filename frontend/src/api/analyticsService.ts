import { apiClient } from './client';
import type { AnalyticsData } from '../types';

export type AnalyticsQuery = {
  preset?: 'today' | 'last_7_days' | 'last_30_days' | 'this_month' | 'previous_month' | 'custom';
  from?: string;
  to?: string;
  status?: string;
};

export async function fetchAnalytics(query: AnalyticsQuery = {}): Promise<AnalyticsData> {
  const { data } = await apiClient.get('/analytics', { params: query });
  return data?.data ?? data;
}

export async function exportAnalyticsCsv(query: AnalyticsQuery = {}): Promise<void> {
  const response = await apiClient.get('/analytics/export.csv', { params: query, responseType: 'blob' });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const match = disposition.match(/filename="([^"]+)"/i);
  const fileName = match?.[1] ?? `analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
