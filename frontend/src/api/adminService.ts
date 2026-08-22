import { apiClient } from './client';
import { supabaseMonitoringService } from './supabaseMonitoringService';
import type {
  DashboardMetrics, SystemConfiguration, IntegrationStatus,
  BackupRecord, AdminNotification,
} from '../types';

export async function loadAdminData(): Promise<DashboardMetrics> {
  const telemetry = await supabaseMonitoringService.getLiveDashboardCounts();
  const d = telemetry.data;

  return {
    totalDocuments: d.totalDocuments,
    totalContracts: d.totalContracts,
    activeSessions: d.activeSessionsCount,
    failedLoginAttempts: d.failedLoginAttemptsCount,
    blockedIpsCount: d.blockedIpsCount,
    activeAlertsCount: d.activeAlertsCount,
    totalBackups: 0,
    totalNotifications: d.unreadNotificationsCount,
  };
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

export async function createBackup(backupType: string, triggeredBy?: string): Promise<BackupRecord | null> {
  try {
    const { data } = await apiClient.post('/admin/backups', { backupType, triggeredBy });
    return data?.data ?? null;
  } catch {
    return null;
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

