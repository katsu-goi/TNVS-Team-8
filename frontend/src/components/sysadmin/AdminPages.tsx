import React, { useEffect, useState } from 'react';
import {
  Activity, Users, Shield,
  AlertTriangle, AlertCircle,
  FileText, Bell, Settings, Layers,
  Wifi, WifiOff,
} from 'lucide-react';
import { loadConfigs, updateConfig, loadIntegrations } from '../../api/adminService';
import { notificationService } from '../../api/notificationService';
import { securityService } from '../../api/securityService';
import { SecurityThreatSection } from '../security/SecurityThreatSection';
import { SubsystemHealthGrid } from './SubsystemHealthGrid';
import { DashboardHero } from '../ui/DashboardPrimitives';
import { DataTable, DataTableStatusBadge, type DataTableColumn } from '../ui/data-table';
import type {
  SystemConfiguration, SecurityLog,
} from '../../types';

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="glass-panel p-5 animate-pulse"><div className="h-5 w-56 bg-slate-200 rounded" /></div>
    <div className="glass-panel p-5 animate-pulse"><div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-4 w-full bg-slate-200 rounded" />)}</div></div>
  </div>
);

const EmptyState: React.FC<{ icon: React.ElementType; title: string; desc: string }> = ({ icon: Icon, title, desc }) => (
  <div className="card-stat p-12 flex flex-col items-center justify-center text-center space-y-4">
    <div className="p-4 rounded-2xl bg-slate-100"><Icon className="w-10 h-10 text-slate-400" /></div>
    <p className="text-lg font-bold text-slate-700">{title}</p>
    <p className="text-sm text-slate-500 max-w-md">{desc}</p>
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="card-stat p-8 flex flex-col items-center justify-center text-center space-y-3">
    <AlertCircle className="w-10 h-10 text-rose-400" />
    <p className="text-sm font-semibold text-slate-700">Failed to load data</p>
    <p className="text-xs text-slate-500">{message}</p>
    <button onClick={onRetry} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Retry</button>
  </div>
);

function useQuery<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then(d => { setData(d); setLoading(false); })
      .catch((err: any) => { setError(err?.message || 'Query failed'); setLoading(false); });
  }, [retry]);
  return { data, loading, error, retry: () => setRetry(r => r + 1) };
}

const PageHeader: React.FC<{ icon: React.ElementType; title: string; subtitle: string }> = ({ icon: Icon, title, subtitle }) => (
  <div className="mb-6"><DashboardHero title={title} subtitle={subtitle} actions={<span className="rounded-xl border border-white/15 bg-white/10 p-2.5 text-white"><Icon className="h-5 w-5" /></span>} /></div>
);

export const IntegrationsPage: React.FC = () => {
  const { data, loading, error, retry } = useQuery(loadIntegrations);
  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!data || data.length === 0) return (
    <div><PageHeader icon={Layers} title="Integration Management" subtitle="External system connection status" />
    <EmptyState icon={Layers} title="No Integrations" desc="Integration status tracking is available in the database." /></div>
  );

  return (
    <div>
      <PageHeader icon={Layers} title="Integration Management" subtitle="Database-connected subsystems overview" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((int) => (
          <div key={int.id} className={`card-stat p-5 border-l-4 ${
            int.connectionStatus === 'CONNECTED' ? 'border-l-emerald-500' :
            int.connectionStatus === 'ERROR' ? 'border-l-rose-500' : 'border-l-amber-500'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${
                  int.connectionStatus === 'CONNECTED' ? 'bg-emerald-50' : 'bg-rose-50'
                }`}>
                  {int.connectionStatus === 'CONNECTED' ? <Wifi className="w-5 h-5 text-emerald-600" /> : <WifiOff className="w-5 h-5 text-rose-500" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{int.systemName}</p>
                  <span className={`text-xs font-semibold ${
                    int.apiHealth === 'HEALTHY' ? 'text-emerald-600' : 'text-amber-600'
                  }`}>{int.apiHealth || 'UNKNOWN'}</span>
                </div>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                int.connectionStatus === 'CONNECTED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}>{int.connectionStatus}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
              <div><span className="text-slate-400">Response:</span> {int.responseTimeMs ? `${int.responseTimeMs}ms` : 'N/A'}</div>
              <div><span className="text-slate-400">Failed Syncs:</span> {int.failedSyncs}</div>
              <div><span className="text-slate-400">Last Sync:</span> {int.lastSyncAt ? new Date(int.lastSyncAt).toLocaleString() : 'N/A'}</div>
              <div><span className="text-slate-400">Last Connected:</span> {int.lastSuccessfulConnection ? new Date(int.lastSuccessfulConnection).toLocaleString() : 'N/A'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export { AiServicesPage } from './AiServicesPage';

export const SecurityCenterPage: React.FC = () => {
  const { data, loading, error, retry } = useQuery(async () => {
    const [metrics, alerts, blockedIps, sessions] = await Promise.all([
      securityService.getMetrics(),
      securityService.getAlerts(),
      securityService.getBlockedIps(),
      securityService.getActiveSessions(),
    ]);
    return { metrics, alerts, blockedIps, sessions };
  });
  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!data) return null;

  const { metrics, alerts, sessions } = data;

  return (
    <div>
      <PageHeader icon={Shield} title="Security Center" subtitle="Live security monitoring from database" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card-stat p-4"><p className="text-xs text-slate-500 uppercase tracking-wide">Active Sessions</p><p className="text-2xl font-bold text-slate-900 mt-1">{metrics.activeSessions}</p></div>
        <div className="card-stat p-4"><p className="text-xs text-slate-500 uppercase tracking-wide">Blocked IPs</p><p className="text-2xl font-bold text-slate-900 mt-1">{metrics.blockedIpsCount}</p></div>
        <div className="card-stat p-4"><p className="text-xs text-slate-500 uppercase tracking-wide">Open Alerts</p><p className="text-2xl font-bold text-rose-600 mt-1">{metrics.activeAlertsCount}</p></div>
        <div className="card-stat p-4"><p className="text-xs text-slate-500 uppercase tracking-wide">Failed Logins</p><p className="text-2xl font-bold text-amber-600 mt-1">{metrics.failedLoginAttempts}</p></div>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Security Alerts ({alerts.length})</h3>
          <DataTable
            data={alerts}
            rowKey={(row) => row.id ?? `${row.createdAt ?? 'undated'}-${row.title}`}
            caption="Security alerts"
            columns={[
              { id: 'alert', header: 'Alert', searchableValue: (row) => `${row.title} ${row.description ?? ''}`, cell: (row) => <><p className="font-semibold text-slate-900">{row.title}</p><p className="mt-1 max-w-sm truncate text-xs text-slate-500" title={row.description}>{row.description || '—'}</p></>, sortable: true },
              { id: 'severity', header: 'Severity', accessor: (row) => <DataTableStatusBadge value={row.severity} />, searchableValue: (row) => row.severity, sortable: true },
              { id: 'source', header: 'Source', accessor: (row) => row.targetIp || 'Not provided', sortable: true, optional: true },
              { id: 'created', header: 'Created', accessor: (row) => row.createdAt ? new Date(row.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '—', sortValue: (row) => row.createdAt ? new Date(row.createdAt) : null, sortable: true },
            ] satisfies DataTableColumn<(typeof alerts)[number]>[]}
            searchableText={(row) => `${row.title} ${row.description ?? ''} ${row.severity} ${row.targetIp ?? ''}`}
            searchPlaceholder="Search security alerts…"
            paginationEnabled={false}
            emptyTitle="No security alerts"
            emptyDescription="No active alerts are available in the authorized security scope."
          />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Active Sessions ({sessions.length})</h3>
          <DataTable
            data={sessions}
            rowKey={(row) => row.id}
            caption="Active security sessions"
            columns={[
              { id: 'user', header: 'User', accessor: (row) => row.fullName || row.username || 'Unknown user', sortable: true },
              { id: 'source', header: 'Source', searchableValue: (row) => `${row.ipAddress ?? ''} ${row.browser ?? ''}`, cell: (row) => <><p>{row.ipAddress || 'Not provided'}</p><p className="text-xs text-slate-500">{row.browser || 'Unknown browser'}</p></> },
              { id: 'login', header: 'Login time', accessor: (row) => row.loginTime ? new Date(row.loginTime).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '—', sortValue: (row) => row.loginTime ? new Date(row.loginTime) : null, sortable: true },
            ] satisfies DataTableColumn<(typeof sessions)[number]>[]}
            searchableText={(row) => `${row.fullName ?? row.username ?? ''} ${row.ipAddress ?? ''} ${row.browser ?? ''}`}
            searchPlaceholder="Search active sessions…"
            paginationEnabled={false}
            emptyTitle="No active sessions"
            emptyDescription="No active sessions are available in the authorized security scope."
          />
        </div>
      </div>
      <SecurityThreatSection />
    </div>
  );
};

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [riskFilter, setRiskFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(page - 1), size: String(pageSize) };
      if (riskFilter) params.riskLevel = riskFilter;
      const result = await securityService.getAuditLogs(params);
      setLogs(result.rows);
      setTotal(result.total);
    } catch (reason) {
      console.error('Unable to load authorized audit logs', reason);
      setError('Unable to load audit logs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchLogs(); }, [page, pageSize, riskFilter]);

  const columns: DataTableColumn<SecurityLog>[] = [
    { id: 'timestamp', header: 'Timestamp', sortable: true, sortValue: (log) => log.timestamp, accessor: (log) => log.timestamp ? new Date(log.timestamp).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '—' },
    { id: 'actor', header: 'Actor', searchableValue: (log) => `${log.fullName ?? ''} ${log.userId ?? ''}`, cell: (log) => <div><p className="font-semibold text-slate-900">{log.fullName || 'Unknown actor'}</p>{log.userId && <p className="mt-1 max-w-44 truncate font-mono text-[10px] text-slate-500" title={log.userId}>{log.userId}</p>}</div> },
    { id: 'module', header: 'Module', sortable: true, accessor: (log) => log.module || '—', sortValue: (log) => log.module },
    { id: 'action', header: 'Action', sortable: true, accessor: (log) => log.action || '—', sortValue: (log) => log.action },
    { id: 'source', header: 'Source', optional: true, accessor: (log) => <span className="font-mono text-xs">{log.ipAddress || 'Not provided'}</span> },
    { id: 'risk', header: 'Risk', sortable: true, cell: (log) => <DataTableStatusBadge value={log.riskLevel || 'LOW'} />, sortValue: (log) => log.riskLevel },
    { id: 'status', header: 'Status', sortable: true, cell: (log) => <DataTableStatusBadge value={log.status} />, sortValue: (log) => log.status },
  ];

  return (
    <div>
      <PageHeader icon={FileText} title="Audit Logs" subtitle="Security audit trail from database" />
      <DataTable
        data={logs}
        columns={columns}
        rowKey={(log) => log.id}
        caption="Global audit logs"
        loading={loading}
        error={error}
        onRetry={fetchLogs}
        onRefresh={fetchLogs}
        searchableText={(log) => `${log.fullName ?? ''} ${log.userId ?? ''} ${log.module ?? ''} ${log.action ?? ''} ${log.ipAddress ?? ''} ${log.riskLevel ?? ''} ${log.status ?? ''}`}
        searchPlaceholder="Search this audit page..."
        filters={<label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><span className="sr-only">Risk level</span><select value={riskFilter} onChange={(event) => { setRiskFilter(event.target.value); setPage(1); }} className="min-h-10 rounded-control border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><option value="">All risks</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></label>}
        activeFilters={riskFilter ? [{ id: 'risk', label: 'Risk', value: riskFilter, onRemove: () => { setRiskFilter(''); setPage(1); } }] : []}
        onClearFilters={() => { setRiskFilter(''); setPage(1); }}
        pagination={{ page, pageSize, total, onPageChange: setPage, onPageSizeChange: (size) => { setPageSize(size); setPage(1); } }}
        emptyTitle="No audit events found"
        emptyDescription="No authorized audit events are available for this page and filter."
        filteredEmptyTitle="No audit events match your current search or filter"
      />
    </div>
  );
};

export { BackupRecoveryConsole as BackupPage } from './BackupRecoveryConsole';

export const SettingsPage: React.FC = () => {
  const { data: configs, loading, error, retry } = useQuery(loadConfigs);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (key: string) => {
    setSaving(true);
    try {
      await updateConfig(key, editValue);
      setEditingKey(null);
      retry();
    } catch { } finally { setSaving(false); }
  };

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={retry} />;

  const grouped: Record<string, SystemConfiguration[]> = {};
  (configs || []).forEach(c => {
    const cat = c.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c);
  });

  return (
    <div>
      <PageHeader icon={Settings} title="System Configuration" subtitle="Application settings stored in database" />
      <div className="space-y-4">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="glass-panel p-5">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">{category}</h3>
            <div className="space-y-3">
              {items.map((c) => (
                <div key={c.configKey} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{c.configKey}</p>
                    <p className="text-xs text-slate-500">{c.description}</p>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    {editingKey === c.configKey ? (
                      <>
                        <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
                          className="border border-slate-300 rounded-lg px-2 py-1 text-xs w-40 focus:outline-none focus:border-emerald-500" />
                        <button onClick={() => handleSave(c.configKey)} disabled={saving}
                          className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-semibold">{saving ? '...' : 'Save'}</button>
                        <button onClick={() => setEditingKey(null)} className="px-2 py-1 rounded bg-slate-200 text-slate-600 text-[10px]">Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-mono text-slate-700">{c.configValue}</span>
                        <button onClick={() => { setEditingKey(c.configKey); setEditValue(c.configValue || ''); }}
                          className="px-2 py-1 rounded bg-slate-100 text-slate-500 text-[10px] hover:bg-slate-200">Edit</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const NotificationsPage: React.FC = () => {
  const { data, loading, error, retry } = useQuery(() => notificationService.getNotifications());
  const [filter, setFilter] = useState('');

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!data) return null;

  const filtered = filter ? data.filter(n => n.type === filter) : data;
  const unread = data.filter(n => !n.read).length;

  return (
    <div>
      <PageHeader icon={Bell} title="Notification Center" subtitle={`${unread} unread of ${data.length} total`} />
      <div className="glass-panel p-5">
        <div className="flex items-center space-x-2 mb-4">
          <span className="text-xs text-slate-500">Filter:</span>
          <button onClick={() => setFilter('')} className={`px-3 py-1 rounded-full text-xs font-semibold ${!filter ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>All</button>
          {['SECURITY_ALERT', 'INTEGRATION_FAILURE', 'BACKUP_WARNING', 'AI_ERROR', 'SYSTEM_ANNOUNCEMENT'].map(t => (
            <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1 rounded-full text-xs font-semibold ${filter === t ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{t.replace('_', ' ')}</button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={Bell} title="No Notifications" desc="No notifications matching the current filter." />
        ) : (
          <div className="space-y-2">
            {filtered.map((n) => (
              <div key={n.id} className={`flex items-start space-x-3 p-4 rounded-xl border cursor-pointer transition-colors hover:shadow-sm ${
                !n.read ? 'bg-white border-emerald-200 shadow-sm' :
                n.severity === 'CRITICAL' ? 'bg-rose-50 border-rose-200' :
                n.severity === 'WARNING' ? 'bg-amber-50 border-amber-200' :
                'bg-slate-50 border-slate-200'
              }`} onClick={() => { if (!n.read) void notificationService.markNotificationRead(n.id).then(retry); }}>
                {n.severity === 'CRITICAL' ? <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" /> :
                 n.severity === 'WARNING' ? <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" /> :
                 <Bell className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-bold text-slate-900">{n.title}</p>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                  </div>
                  {n.message && <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>}
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{n.type}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const SystemHealthPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <PageHeader icon={Activity} title="System Health" subtitle="Infrastructure status overview" />
      <SubsystemHealthGrid />
    </div>
  );
};

export const SessionsPage: React.FC = () => (
  <div>
    <PageHeader icon={Users} title="Active Sessions" subtitle="View in Security Center" />
    <EmptyState icon={Users} title="Active Sessions" desc="Go to Security Center for full session management." />
  </div>
);
