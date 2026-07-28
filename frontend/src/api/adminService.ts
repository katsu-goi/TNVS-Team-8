import { apiClient } from './client';
import type {
  DashboardMetrics, SystemConfiguration, IntegrationStatus,
  BackupRecord, AdminNotification,
} from '../types';

export async function loadAdminData(): Promise<DashboardMetrics> {
  const [dashRes, secRes, backupRes, notifRes] = await Promise.all([
    apiClient.get('/dashboard/summary'),
    apiClient.get('/security/admin/metrics'),
    apiClient.get('/admin/backups'),
    apiClient.get('/admin/notifications'),
  ]);

  const dash = dashRes.data?.data ?? {};
  const sec = secRes.data ?? {};
  const backups = backupRes.data?.data ?? [];
  const notifications = notifRes.data?.data ?? [];

  return {
    totalDocuments: dash.totalDocuments ?? 0,
    totalContracts: dash.totalContracts ?? 0,
    activeSessions: sec.activeSessions ?? 0,
    failedLoginAttempts: sec.failedLoginAttempts ?? 0,
    blockedIpsCount: sec.blockedIpsCount ?? 0,
    activeAlertsCount: sec.activeAlertsCount ?? 0,
    totalBackups: backups.length,
    totalNotifications: notifications.length,
  };
}

export async function loadConfigs(): Promise<SystemConfiguration[]> {
  const { data } = await apiClient.get('/admin/config');
  return data?.data ?? [];
}

export async function updateConfig(key: string, value: string, desc?: string): Promise<SystemConfiguration> {
  const { data } = await apiClient.put(`/admin/config/${key}`, { value, description: desc });
  return data?.data;
}

export async function loadIntegrations(): Promise<IntegrationStatus[]> {
  const { data } = await apiClient.get('/admin/integrations');
  return data?.data ?? [];
}

export async function loadBackups(): Promise<BackupRecord[]> {
  const { data } = await apiClient.get('/admin/backups');
  return data?.data ?? [];
}

export async function loadNotifications(): Promise<AdminNotification[]> {
  const { data } = await apiClient.get('/admin/notifications');
  return data?.data ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.put(`/admin/notifications/${id}/read`);
}
