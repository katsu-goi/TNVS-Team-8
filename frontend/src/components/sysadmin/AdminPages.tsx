import React, { useEffect, useState } from 'react';
import {
  Activity, Users, Shield,
  AlertTriangle, AlertCircle,
  FileText, Bell, Settings, Layers,
  RefreshCw, Wifi, WifiOff,
  Search, ChevronLeft, ChevronRight,} from 'lucide-react';
import { loadConfigs, updateConfig, loadIntegrations, loadNotifications, markNotificationRead } from '../../api/adminService';
import { securityService } from '../../api/securityService';
import { SubsystemHealthGrid } from './SubsystemHealthGrid';
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
  <div className="glass-panel p-5 flex items-center justify-between mb-6">
    <div className="flex items-center space-x-4">
      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200"><Icon className="w-5 h-5 text-emerald-600" /></div>
      <div><h1 className="text-2xl font-bold font-heading text-slate-900">{title}</h1><p className="text-sm text-slate-500">{subtitle}</p></div>
    </div>
  </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-stat p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Security Alerts ({alerts.length})</h3>
          {alerts.length === 0 ? <p className="text-xs text-slate-400">No alerts</p> : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {alerts.map((a) => (
                <div key={a.id} className={`p-3 rounded-lg border text-xs ${
                  a.severity === 'CRITICAL' ? 'bg-rose-50 border-rose-200' :
                  a.severity === 'HIGH' ? 'bg-orange-50 border-orange-200' :
                  a.severity === 'MEDIUM' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{a.title}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      a.severity === 'CRITICAL' ? 'bg-rose-200 text-rose-800' :
                      a.severity === 'HIGH' ? 'bg-orange-200 text-orange-800' : 'bg-amber-200 text-amber-800'
                    }`}>{a.severity}</span>
                  </div>
                  <p className="text-slate-500 mt-1">{a.description}</p>
                  <p className="text-slate-400 mt-1 font-mono">{a.targetIp} · {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card-stat p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Active Sessions ({sessions.length})</h3>
          {sessions.length === 0 ? <p className="text-xs text-slate-400">No active sessions</p> : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <p className="font-medium text-slate-900">{s.fullName || s.username}</p>
                    <p className="text-slate-500">{s.ipAddress} · {s.browser}</p>
                  </div>
                  <span className="text-slate-400">{s.loginTime ? new Date(s.loginTime).toLocaleString() : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(page), size: '20' };
      if (riskFilter) params.riskLevel = riskFilter;
      const result = await securityService.getLogs(params);
      setLogs(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [page, riskFilter]);

  const filtered = search
    ? logs.filter(l => l.action?.toLowerCase().includes(search.toLowerCase()) || l.ipAddress?.includes(search) || l.fullName?.toLowerCase().includes(search.toLowerCase()))
    : logs;

  const riskColors: Record<string, string> = {
    CRITICAL: 'bg-rose-100 text-rose-700', HIGH: 'bg-orange-100 text-orange-700',
    MEDIUM: 'bg-amber-100 text-amber-700', LOW: 'bg-slate-100 text-slate-600',
  };

  return (
    <div>
      <PageHeader icon={FileText} title="Audit Logs" subtitle="Security audit trail from database" />
      <div className="glass-panel p-5">
        <div className="flex items-center space-x-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500" />
          </div>
          <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
            className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-600 focus:outline-none focus:border-emerald-500">
            <option value="">All Risks</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <button onClick={fetchLogs} className="p-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"><RefreshCw className="w-4 h-4" /></button>
        </div>
        {loading ? <LoadingSkeleton /> : error ? <ErrorState message={error} onRetry={fetchLogs} /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-3 px-2">Timestamp</th><th className="text-left py-3 px-2">User</th>
                  <th className="text-left py-3 px-2">Module</th><th className="text-left py-3 px-2">Action</th>
                  <th className="text-left py-3 px-2">IP</th><th className="text-center py-3 px-2">Risk</th><th className="text-center py-3 px-2">Status</th>
                </tr></thead>
                <tbody>
                  {filtered.map((log, i) => (
                    <tr key={log.id || i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-2 font-mono text-slate-600">{log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}</td>
                      <td className="py-3 px-2 font-medium text-slate-900">{log.fullName || log.userId || 'Unknown'}</td>
                      <td className="py-3 px-2 text-slate-600">{log.module}</td>
                      <td className="py-3 px-2 text-slate-600">{log.action}</td>
                      <td className="py-3 px-2 font-mono text-slate-500">{log.ipAddress}</td>
                      <td className="py-3 px-2 text-center"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${riskColors[log.riskLevel] || 'bg-slate-100 text-slate-600'}`}>{log.riskLevel}</span></td>
                      <td className="py-3 px-2 text-center"><span className={`text-[10px] font-semibold ${log.status === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'}`}>{log.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-slate-400">{filtered.length} entries</span>
              <div className="flex items-center space-x-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded bg-slate-100 text-slate-500 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-xs text-slate-600">Page {page + 1}</span>
                <button onClick={() => setPage(p => p + 1)} className="p-1 rounded bg-slate-100 text-slate-500"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export { BackupPage } from './BackupPage';

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
  const { data, loading, error, retry } = useQuery(loadNotifications);
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
              }`} onClick={() => { if (!n.read) { markNotificationRead(n.id); retry(); } }}>
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
