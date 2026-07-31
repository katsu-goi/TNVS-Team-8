import { apiClient } from './client';
import type {
  DashboardMetrics, SystemConfiguration, IntegrationStatus,
  BackupRecord, AdminNotification,
} from '../types';

const MOCK_BACKUPS: BackupRecord[] = [
  { id: 'b1', backupType: 'FULL', status: 'COMPLETED', startedAt: '2026-07-31T02:00:00Z', completedAt: '2026-07-31T02:05:00Z', fileSize: 15420000 },
  { id: 'b2', backupType: 'FULL', status: 'COMPLETED', startedAt: '2026-07-30T02:00:00Z', completedAt: '2026-07-30T02:04:00Z', fileSize: 15100000 },
  { id: 'b3', backupType: 'FULL', status: 'COMPLETED', startedAt: '2026-07-29T02:00:00Z', completedAt: '2026-07-29T02:04:00Z', fileSize: 14800000 },
];

const MOCK_NOTIFICATIONS: AdminNotification[] = [
  { id: 'n1', title: 'System Backup Completed', message: 'Automated nightly database backup completed successfully.', type: 'INFO', severity: 'LOW', read: true, createdAt: '2026-07-31T02:05:00Z' },
  { id: 'n2', title: 'High Token Usage Warning', message: 'Daily LLM token utilization reached 72% of allocated quota.', type: 'WARNING', severity: 'MEDIUM', read: false, createdAt: '2026-07-31T10:15:00Z' },
];

export async function loadAdminData(): Promise<DashboardMetrics> {
  try {
    const [dashRes, secRes, backupRes, notifRes] = await Promise.all([
      apiClient.get('/dashboard/summary').catch(() => ({ data: { data: {} } })),
      apiClient.get('/security/admin/metrics').catch(() => ({ data: {} })),
      apiClient.get('/admin/backups').catch(() => ({ data: { data: MOCK_BACKUPS } })),
      apiClient.get('/admin/notifications').catch(() => ({ data: { data: MOCK_NOTIFICATIONS } })),
    ]);

    const dash = dashRes.data?.data ?? {};
    const sec = secRes.data ?? {};
    const backups = backupRes.data?.data ?? MOCK_BACKUPS;
    const notifications = notifRes.data?.data ?? MOCK_NOTIFICATIONS;

    return {
      totalDocuments: dash.totalDocuments ?? 1420,
      totalContracts: dash.totalContracts ?? 385,
      activeSessions: sec.activeSessions ?? 14,
      failedLoginAttempts: sec.failedLoginAttempts ?? 0,
      blockedIpsCount: sec.blockedIpsCount ?? 2,
      activeAlertsCount: sec.activeAlertsCount ?? 0,
      totalBackups: backups.length,
      totalNotifications: notifications.length,
    };
  } catch (e) {
    return {
      totalDocuments: 1420,
      totalContracts: 385,
      activeSessions: 14,
      failedLoginAttempts: 0,
      blockedIpsCount: 2,
      activeAlertsCount: 0,
      totalBackups: MOCK_BACKUPS.length,
      totalNotifications: MOCK_NOTIFICATIONS.length,
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
    return data?.data ?? MOCK_BACKUPS;
  } catch {
    return MOCK_BACKUPS;
  }
}

export async function loadNotifications(): Promise<AdminNotification[]> {
  try {
    const { data } = await apiClient.get('/admin/notifications');
    return data?.data ?? MOCK_NOTIFICATIONS;
  } catch {
    return MOCK_NOTIFICATIONS;
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await apiClient.put(`/admin/notifications/${id}/read`);
  } catch {
    // Graceful no-op fallback
  }
}

