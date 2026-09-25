import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileArchive,
  FileJson,
  FileText,
  HardDrive,
  LockKeyhole,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import type { BackupRecord } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import {
  BACKUP_MODULES,
  downloadBackup,
  exportGranularBackup,
  loadBackupHealth,
  loadBackupSchedule,
  listBackupRecords,
  runFullSqlBackup,
  saveBackupSchedule,
  setBackupProtection,
  type BackupHealth,
  type BackupExportFormat,
  type BackupSchedule,
} from '../../api/backupRecoveryService';
import { DashboardHero } from '../ui/DashboardPrimitives';
import { DataTable, DataTableStatusBadge, type DataTableColumn } from '../ui/data-table';

const DEFAULT_SCHEDULE: BackupSchedule = {
  scheduleKey: 'BACKUP_DAILY',
  cronExpression: '0 0 * * *',
  enabled: false,
};

const SCHEDULE_OPTIONS = [
  { value: '0 0 * * *', label: 'Daily at 12:00 AM' },
  { value: '0 0 * * 0', label: 'Weekly on Sunday at 12:00 AM' },
] as const;

function formatDate(value?: string): string {
  if (!value) return 'Not available';
  return new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
}

function formatBytes(value?: number): string {
  if (!value || value < 1) return 'Not available';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function recordDate(record: BackupRecord): string {
  return record.createdAt ?? record.completedAt ?? record.startedAt;
}

function displayType(record: BackupRecord): string {
  if (record.backupType === 'FULL_SQL' || record.backupType === 'FULL') return 'Full SQL';
  if (record.backupType === 'GRANULAR_EXPORT') return `Granular ${record.exportFormat ?? 'Export'}`;
  return record.backupType.replaceAll('_', ' ');
}

const Metric: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
  tone: string;
}> = ({ icon: Icon, label, value, detail, tone }) => (
  <div className="border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
        <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{detail}</p>
      </div>
      <div className={`rounded-lg border p-2 ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

export const BackupRecoveryConsole: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const realtimeConnected = useRealtimeSyncStore((state) => state.connected);
  const backupRevision = useRealtimeSyncStore((state) => state.backupRevision);
  const [records, setRecords] = useState<BackupRecord[]>([]);
  const [schedule, setSchedule] = useState<BackupSchedule>(DEFAULT_SCHEDULE);
  const [health, setHealth] = useState<BackupHealth | null>(null);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<BackupExportFormat>('CSV');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextRecords, nextSchedule, nextHealth] = await Promise.all([
        listBackupRecords(),
        loadBackupSchedule(),
        loadBackupHealth(),
      ]);
      setRecords(nextRecords);
      setSchedule(nextSchedule);
      setHealth(nextHealth);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load backup data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (backupRevision > 0) void refresh();
  }, [backupRevision, refresh]);

  const orderedRecords = useMemo(
    () => [...records].sort((first, second) => new Date(recordDate(second)).getTime() - new Date(recordDate(first)).getTime()),
    [records],
  );

  const lastBackup = orderedRecords.find((record) => record.status === 'COMPLETED');
  const currentMonth = new Date();
  const backupsThisMonth = orderedRecords.filter((record) => {
    const date = new Date(recordDate(record));
    return date.getFullYear() === currentMonth.getFullYear() && date.getMonth() === currentMonth.getMonth();
  }).length;
  const healthOnline = !error && health !== null;
  const scheduleLabel = SCHEDULE_OPTIONS.find((option) => option.value === schedule.cronExpression)?.label ?? schedule.cronExpression;

  const runAction = async (action: string, operation: () => Promise<BackupRecord>) => {
    setBusyAction(action);
    setError(null);
    setNotice(null);
    try {
      const record = await operation();
      setNotice(record.status === 'COMPLETED'
        ? `${displayType(record)} completed and passed artifact integrity verification.`
        : `${displayType(record)} finished with status ${record.status}.`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Backup request failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleProtection = async (record: BackupRecord) => {
    setBusyAction(`protect-${record.id}`);
    setError(null);
    setNotice(null);
    try {
      const saved = await setBackupProtection(record.id, !record.protected);
      setNotice(saved.protected ? 'Backup protected from retention cleanup.' : 'Backup returned to ordinary retention.');
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update backup protection.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleGranularExport = () => {
    if (selectedModules.length === 0) {
      setError('Select at least one module before exporting granular data.');
      return;
    }
    void runAction('granular', () => exportGranularBackup(selectedModules, exportFormat));
  };

  const handleScheduleSave = async () => {
    setBusyAction('schedule');
    setError(null);
    setNotice(null);
    try {
      const saved = await saveBackupSchedule({
        cronExpression: schedule.cronExpression,
        enabled: schedule.enabled,
      });
      setSchedule(saved);
      setNotice(saved.enabled ? `Automated backup schedule saved: ${scheduleLabel}.` : 'Automated backup schedule disabled.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save the backup schedule.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownload = async (record: BackupRecord) => {
    const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
    setBusyAction(`download-${record.id}`);
    setError(null);
    setNotice(null);
    try {
      const result = await downloadBackup(record.id);
      if (result.fileUrl) {
        if (!/^https?:\/\//i.test(result.fileUrl)) {
          throw new Error('The backup service returned an invalid download URL.');
        }
        if (popup) popup.location.href = result.fileUrl;
        else window.location.assign(result.fileUrl);
      } else if (result.fileBlob) {
        popup?.close();
        const objectUrl = URL.createObjectURL(result.fileBlob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = result.fileName ?? `backup-${record.id}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } else {
        throw new Error('The backup service did not return a downloadable archive.');
      }
      setNotice('Backup download authorized and recorded in the audit trail.');
      await refresh();
    } catch (requestError) {
      popup?.close();
      setError(requestError instanceof Error ? requestError.message : 'Unable to authorize this download.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <DashboardHero title="Backup & Disaster Recovery" subtitle="Verified logical data, private Storage copies, retention, and isolated recovery evidence." actions={
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="portal-header-action inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh data
        </button>
      } />

      {error && (
        <div className="flex items-start gap-3 border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-sm" role="alert">
          <X className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-3 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm" role="status">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric
          icon={Clock3}
          label="Last Backup Date"
          value={lastBackup ? formatDate(recordDate(lastBackup)) : 'No backup yet'}
          detail={lastBackup ? `${displayType(lastBackup)} · ${lastBackup.verificationState ?? lastBackup.status}` : 'Awaiting first verified backup'}
          tone="border-red-200 bg-red-50 text-red-700"
        />
        <Metric
          icon={FileArchive}
          label="Total Backups (This Month)"
          value={String(backupsThisMonth)}
          detail={`${orderedRecords.length} records in backup history`}
          tone="border-slate-200 bg-slate-50 text-slate-700"
        />
        <Metric
          icon={Activity}
          label="System Health Status"
          value={healthOnline ? 'Online' : 'Unavailable'}
          detail={health ? `${health.consecutiveFailures} consecutive failure${health.consecutiveFailures === 1 ? '' : 's'} · ${realtimeConnected ? 'Realtime connected' : 'API reachable'}` : 'Backup health API unavailable'}
          tone={healthOnline ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-red-700">
                <Database className="h-5 w-5" />
                <h2 className="text-base font-bold text-slate-900">Full System Backup</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">Create a logical application-data SQL export, restore JSON, schema-control inventory, and verified copies of private business files.</p>
            </div>
            <FileText className="h-5 w-5 text-slate-300" />
          </div>
          <div className="mt-5 border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Completion is recorded only after every artifact is downloaded again and SHA-256 verified.</div>
          </div>
          <button
            type="button"
            onClick={() => void runAction('full', runFullSqlBackup)}
            disabled={busyAction !== null}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-red-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === 'full' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Run Full SQL Backup
          </button>
        </section>

        <section className="border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-red-700">
                <HardDrive className="h-5 w-5" />
                <h2 className="text-base font-bold text-slate-900">Granular Data Export</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">Select operational modules for a focused CSV or JSON export.</p>
            </div>
            <FileJson className="h-5 w-5 text-slate-300" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {BACKUP_MODULES.map((module) => (
              <label key={module.key} className="flex cursor-pointer items-center gap-3 border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 transition hover:border-red-300">
                <input
                  type="checkbox"
                  checked={selectedModules.includes(module.key)}
                  onChange={(event) => setSelectedModules((current) => event.target.checked
                    ? [...current, module.key]
                    : current.filter((key) => key !== module.key))}
                  className="h-4 w-4 accent-red-700"
                />
                <span>{module.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              Format
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as BackupExportFormat)} className="border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500">
                <option value="CSV">CSV</option>
                <option value="JSON">JSON</option>
              </select>
            </label>
            <button
              type="button"
              onClick={handleGranularExport}
              disabled={busyAction !== null}
              className="inline-flex flex-1 items-center justify-center gap-2 border border-red-700 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'granular' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export Selected Data (CSV/JSON)
            </button>
          </div>
        </section>
      </div>

      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Automated Scheduling</h2>
            <p className="mt-1 text-sm text-slate-500">Control the secure pg_cron dispatcher; scheduled and manual requests use the same verified backup engine.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={schedule.cronExpression}
              onChange={(event) => setSchedule((current) => ({ ...current, cronExpression: event.target.value }))}
              className="border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            >
              {SCHEDULE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button
              type="button"
              role="switch"
              aria-checked={schedule.enabled}
              aria-label="Enable automated backup schedule"
              onClick={() => setSchedule((current) => ({ ...current, enabled: !current.enabled }))}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${schedule.enabled ? 'bg-red-700' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${schedule.enabled ? 'left-6' : 'left-1'}`} />
            </button>
            <button
              type="button"
              onClick={() => void handleScheduleSave()}
              disabled={busyAction !== null}
              className="inline-flex items-center justify-center gap-2 bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Schedule
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-red-700" />{scheduleLabel}</span>
          <span className={`inline-flex items-center gap-2 font-semibold ${schedule.enabled ? 'text-emerald-700' : 'text-slate-500'}`}><span className={`h-2 w-2 rounded-full ${schedule.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />{schedule.enabled ? 'Enabled' : 'Disabled'}</span>
          {schedule.updatedAt && <span>Updated {formatDate(schedule.updatedAt)}{schedule.updatedBy ? ` by ${schedule.updatedBy}` : ''}</span>}
          {schedule.lastSuccessAt && <span>Last scheduled success {formatDate(schedule.lastSuccessAt)}</span>}
          {schedule.lastFailureAt && <span className="text-rose-700">Last scheduled failure {formatDate(schedule.lastFailureAt)}</span>}
          {health?.nextSchedule && <span>{health.nextSchedule}</span>}
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Backup History</h2>
            <p className="mt-1 text-sm text-slate-500">Recent backup metadata and integrity verification records.</p>
          </div>
          <span className="text-xs font-semibold text-slate-500">{orderedRecords.length} record{orderedRecords.length === 1 ? '' : 's'}</span>
        </div>
        <DataTable
          data={orderedRecords}
          rowKey={(row) => row.id}
          caption="Backup history"
          loading={loading}
          columns={[
            { id: 'date', header: 'Date / time', accessor: (row) => formatDate(recordDate(row)), sortValue: (row) => new Date(recordDate(row)), sortable: true },
            { id: 'type', header: 'Type', searchableValue: (row) => `${displayType(row)} ${row.status}`, cell: (row) => <><p className="font-semibold text-slate-900">{displayType(row)}</p><div className="mt-1"><DataTableStatusBadge value={row.status} /></div></>, sortable: true },
            { id: 'triggeredBy', header: 'Triggered by', accessor: (row) => row.createdBy ?? row.triggeredBy ?? 'System Scheduler', sortable: true },
            { id: 'size', header: 'File size', accessor: (row) => formatBytes(row.fileSize), sortValue: (row) => row.fileSize ?? 0, sortable: true, align: 'right' },
            { id: 'checksum', header: 'SHA-256 checksum', cell: (row) => <span className="font-mono text-xs" title={row.checksum ?? 'Checksum pending'}>{row.checksum ? `${row.checksum.slice(0, 18)}…` : 'Pending'}</span>, searchableValue: (row) => row.checksum, optional: true },
            { id: 'verification', header: 'Verification', searchableValue: (row) => `${row.verificationState ?? ''} ${row.failureReason ?? ''}`, cell: (row) => <><DataTableStatusBadge value={row.verificationState ?? 'NOT_VERIFIED'} /><p className="mt-1 text-xs text-slate-500">{row.rowCount ?? 0} rows · {row.storageObjectCount ?? 0} files</p>{row.failureReason && <p className="mt-1 max-w-xs text-xs text-rose-700">{row.failureReason}</p>}</>, sortable: true },
            { id: 'retention', header: 'Retention', searchableValue: (row) => `${row.cleanupStatus ?? ''} ${row.protected ? 'protected' : ''}`, cell: (row) => <><p>{row.protected ? 'Protected' : formatDate(row.retentionExpiresAt)}</p><p className="mt-1 text-xs text-slate-500">{row.cleanupStatus ?? 'RETAINED'}</p></>, optional: true },
            { id: 'restore', header: 'Restore test', searchableValue: (row) => row.restoreTestStatus, cell: (row) => <><DataTableStatusBadge value={row.restoreTestStatus ?? 'NOT_VERIFIED'} />{row.lastRestoreTestAt && <p className="mt-1 text-xs text-slate-500">{formatDate(row.lastRestoreTestAt)}</p>}</>, sortable: true, optional: true },
          ] satisfies DataTableColumn<BackupRecord>[]}
          searchableText={(row) => `${displayType(row)} ${row.status} ${row.createdBy ?? row.triggeredBy ?? ''} ${row.checksum ?? ''} ${row.verificationState ?? ''} ${row.cleanupStatus ?? ''} ${row.restoreTestStatus ?? ''}`}
          searchPlaceholder="Search backup history…"
          rowActions={(row) => { const hasDownload = row.status === 'COMPLETED' && ['INTEGRITY_VERIFIED', 'RESTORE_VERIFIED'].includes(row.verificationState ?? ''); const downloadBusy = busyAction === `download-${row.id}`; return <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => void handleProtection(row)} disabled={busyAction !== null || row.cleanupStatus === 'DELETED'} title={row.protected ? 'Return to ordinary retention' : 'Protect from retention cleanup'} className="inline-flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"><LockKeyhole className="h-3.5 w-3.5" />{row.protected ? 'Unprotect' : 'Protect'}</button><button type="button" onClick={() => void handleDownload(row)} disabled={!hasDownload || busyAction !== null} title={hasDownload ? 'Authorize a five-minute download after re-verifying its checksum' : 'Only integrity-verified completed artifacts can be downloaded'} className="inline-flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50">{downloadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{hasDownload ? 'Download' : 'Unavailable'}</button></div>; }}
          emptyTitle="No backup records"
          emptyDescription="Run a full SQL backup or export selected modules to create a record."
        />
      </section>

      <div className="flex items-center gap-2 border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <span>Requests are attributed to {user?.email ?? 'the authenticated System Administrator'}. Production restore is deliberately not exposed; recovery verification uses an isolated service-only schema.</span>
      </div>
    </div>
  );
};
