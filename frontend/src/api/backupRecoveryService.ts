import axios from 'axios';
import { apiClient, extractErrorMessage } from './client';
import type { BackupRecord } from '../types';

export const BACKUP_MODULES = [
  { key: 'audit_logs', label: 'Audit Logs' },
  { key: 'facilities', label: 'Facilities Data' },
  { key: 'compliance_permits', label: 'Compliance Permits' },
  { key: 'security_events', label: 'Security Events' },
] as const;

const BACKUP_SCHEDULE_CONFIG_KEY = 'BACKUP_DAILY';
const DEFAULT_SCHEDULE: BackupSchedule = {
  scheduleKey: BACKUP_SCHEDULE_CONFIG_KEY,
  cronExpression: '0 0 * * *',
  enabled: false,
};

export type BackupExportFormat = 'CSV' | 'JSON';

export interface BackupSchedule {
  id?: string;
  scheduleKey: string;
  cronExpression: string;
  enabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

function unwrap<T>(response: { data?: { data?: T } }): T {
  return response.data?.data as T;
}

function normalizeRecord(raw: Record<string, unknown>): BackupRecord {
  return {
    id: String(raw.id ?? ''),
    backupType: String(raw.backupType ?? raw.backup_type ?? 'UNKNOWN'),
    status: String(raw.status ?? 'UNKNOWN'),
    startedAt: String(raw.startedAt ?? raw.started_at ?? raw.createdAt ?? raw.created_at ?? new Date().toISOString()),
    completedAt: typeof (raw.completedAt ?? raw.completed_at) === 'string'
      ? String(raw.completedAt ?? raw.completed_at)
      : undefined,
    createdAt: typeof (raw.createdAt ?? raw.created_at) === 'string'
      ? String(raw.createdAt ?? raw.created_at)
      : undefined,
    fileSize: typeof (raw.fileSize ?? raw.file_size) === 'number'
      ? Number(raw.fileSize ?? raw.file_size)
      : undefined,
    filePath: typeof (raw.filePath ?? raw.file_path) === 'string'
      ? String(raw.filePath ?? raw.file_path)
      : undefined,
    fileUrl: typeof (raw.fileUrl ?? raw.file_url) === 'string'
      ? String(raw.fileUrl ?? raw.file_url)
      : undefined,
    checksum: typeof raw.checksum === 'string' ? raw.checksum : undefined,
    integrityCheck: typeof (raw.integrityCheck ?? raw.integrity_check) === 'string'
      ? String(raw.integrityCheck ?? raw.integrity_check)
      : undefined,
    triggeredBy: typeof (raw.triggeredBy ?? raw.triggered_by) === 'string'
      ? String(raw.triggeredBy ?? raw.triggered_by)
      : undefined,
    createdBy: typeof (raw.createdBy ?? raw.created_by) === 'string'
      ? String(raw.createdBy ?? raw.created_by)
      : undefined,
    moduleScope: Array.isArray(raw.moduleScope ?? raw.module_scope)
      ? (raw.moduleScope ?? raw.module_scope) as string[]
      : undefined,
    exportFormat: typeof (raw.exportFormat ?? raw.export_format) === 'string'
      ? String(raw.exportFormat ?? raw.export_format)
      : undefined,
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
  };
}

async function request<T>(operation: () => Promise<{ data?: { data?: T } }>): Promise<T> {
  try {
    return unwrap(await operation());
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}

export async function listBackupRecords(): Promise<BackupRecord[]> {
  const rows = await request<unknown[]>(() => apiClient.get('/admin/backups'));
  return Array.isArray(rows) ? rows.map((row) => normalizeRecord(row as Record<string, unknown>)) : [];
}

export async function runFullSqlBackup(): Promise<BackupRecord> {
  const row = await request<Record<string, unknown>>(() => apiClient.post('/admin/backups', {
    backupType: 'FULL_SQL',
  }));
  return normalizeRecord(row);
}

export async function exportGranularBackup(
  modules: string[],
  format: BackupExportFormat,
): Promise<BackupRecord> {
  const row = await request<Record<string, unknown>>(() => apiClient.post('/admin/backups', {
    backupType: 'GRANULAR_EXPORT',
    modules,
    format,
  }));
  return normalizeRecord(row);
}

export async function loadBackupSchedule(): Promise<BackupSchedule> {
  try {
    const schedule = await request<BackupSchedule>(() => apiClient.get('/admin/backups/schedule'));
    return schedule ?? DEFAULT_SCHEDULE;
  } catch {
    try {
      const response = await apiClient.get('/admin/config');
      const config = (response.data?.data as Array<{ configKey?: string; configValue?: string }> | undefined)
        ?.find((item) => item.configKey === BACKUP_SCHEDULE_CONFIG_KEY);
      if (config?.configValue) {
        const parsed = JSON.parse(config.configValue) as Partial<BackupSchedule>;
        return {
          ...DEFAULT_SCHEDULE,
          cronExpression: parsed.cronExpression === '0 0 * * 0' ? '0 0 * * 0' : '0 0 * * *',
          enabled: parsed.enabled === true,
        };
      }
    } catch {
    }
    return DEFAULT_SCHEDULE;
  }
}

export async function saveBackupSchedule(schedule: Pick<BackupSchedule, 'cronExpression' | 'enabled'>): Promise<BackupSchedule> {
  try {
    return await request<BackupSchedule>(() => apiClient.put('/admin/backups/schedule', schedule));
  } catch {
    const value = JSON.stringify(schedule);
    const response = await apiClient.put(`/admin/config/${BACKUP_SCHEDULE_CONFIG_KEY}`, {
      value,
      description: 'Automated backup schedule persisted while the dedicated backup schedule endpoint is unavailable.',
      category: 'BACKUP',
    });
    const config = response.data?.data as { updatedAt?: string; updatedBy?: string } | undefined;
    return {
      ...DEFAULT_SCHEDULE,
      ...schedule,
      updatedAt: config?.updatedAt,
      updatedBy: config?.updatedBy,
    };
  }
}

export type BackupDownloadResult = {
  fileUrl?: string;
  fileBlob?: Blob;
  fileName?: string;
};

async function extractDownloadError(error: unknown): Promise<string> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const payload = JSON.parse(await error.response.data.text()) as { message?: string };
      if (payload.message) return payload.message;
    } catch {
      // Fall through to the shared API error handling.
    }
  }
  return extractErrorMessage(error);
}

function fileNameFromContentDisposition(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded.replace(/^"|"$/g, ''));
  return value.match(/filename="?([^";]+)"?/i)?.[1];
}

export async function downloadBackup(id: string): Promise<BackupDownloadResult> {
  try {
    const response = await apiClient.post(`/admin/backups/${encodeURIComponent(id)}/download`, undefined, {
      responseType: 'blob',
    });
    const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
    if (contentType.includes('application/json')) {
      const payload = JSON.parse(await (response.data as Blob).text()) as { data?: { fileUrl?: string }; message?: string };
      if (!payload.data?.fileUrl) throw new Error(payload.message ?? 'The backup service did not return a valid file URL.');
      return { fileUrl: payload.data.fileUrl };
    }
    return {
      fileBlob: response.data as Blob,
      fileName: fileNameFromContentDisposition(response.headers['content-disposition']),
    };
  } catch (error) {
    throw new Error(await extractDownloadError(error));
  }
}
