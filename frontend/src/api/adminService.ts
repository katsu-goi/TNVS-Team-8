import { apiClient } from './client';
import type {
  DashboardMetrics, SystemConfiguration, IntegrationStatus,
  BackupRecord, AdminNotification,
} from '../types';

export async function loadAdminData(): Promise<DashboardMetrics> {
  try {
    const [dashRes, secRes, backupRes, notifRes] = await Promise.all([
      apiClient.get('/dashboard/summary').catch(() => ({ data: { data: {} } })),
      apiClient.get('/security/admin/metrics').catch(() => ({ data: {} })),
      apiClient.get('/admin/backups').catch(() => ({ data: { data: [] } })),
      apiClient.get('/admin/notifications').catch(() => ({ data: { data: [] } })),
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
  } catch (e) {
    return {
      totalDocuments: 0,
      totalContracts: 0,
      activeSessions: 0,
      failedLoginAttempts: 0,
      blockedIpsCount: 0,
      activeAlertsCount: 0,
      totalBackups: 0,
      totalNotifications: 0,
    };
  }
}

export async function loadConfigs(): Promise<SystemConfiguration[]> {
  try {
    const { data } = await apiClient.get('/admin/config');
    return data?.data ?? [];
  } catch {
    return [];
  }
}

export async function updateConfig(key: string, value: string, desc?: string): Promise<SystemConfiguration> {
  try {
    const { data } = await apiClient.put(`/admin/config/${key}`, { value, description: desc });
    return data?.data;
  } catch {
    return { id: key, configKey: key, configValue: value, description: desc || '', updatedAt: new Date().toISOString() };
  }
}

export async function loadIntegrations(): Promise<IntegrationStatus[]> {
  try {
    const { data } = await apiClient.get('/admin/integrations');
    return data?.data ?? [];
  } catch {
    return [];
  }
}

export async function loadBackups(): Promise<BackupRecord[]> {
  try {
    const { data } = await apiClient.get('/admin/backups');
    return data?.data ?? [];
  } catch {
    return [];
  }
}

export async function loadNotifications(): Promise<AdminNotification[]> {
  try {
    const { data } = await apiClient.get('/admin/notifications');
    return data?.data ?? [];
  } catch {
    return [];
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await apiClient.put(`/admin/notifications/${id}/read`);
  } catch {
    // Graceful no-op fallback
  }
}

