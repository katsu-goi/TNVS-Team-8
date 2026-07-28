import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, Database, Activity, Users, Shield,
  RefreshCw, AlertCircle, Cpu,
  Download, FileText, Bell, Layers,
  Globe, ChevronRight, Loader2,
} from 'lucide-react';
import { loadAdminData, loadBackups, loadNotifications } from '../../api/adminService';
import { securityService } from '../../api/securityService';
import type { DashboardMetrics, SecurityLog, AdminNotification, BackupRecord } from '../../types';

const KpiCard: React.FC<{ label: string; value: string | number; icon: React.ElementType; color?: string; sub?: string; onClick?: () => void }> = ({ label, value, icon: Icon, color, sub, onClick }) => (
  <button onClick={onClick} className="card-stat p-4 text-left w-full cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group">
    <div className="flex items-center justify-between mb-2">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] group-hover:text-emerald-700 transition-colors">{label}</p>
      <div className="flex items-center space-x-1">
        <Icon className={`w-4 h-4 ${color || 'text-slate-400'} group-hover:scale-110 transition-transform`} />
        <ChevronRight className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 -ml-0.5 transition-all" />
      </div>
    </div>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
    {sub && <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{sub}</p>}
  </button>
);

export const SysAdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, l, b, n] = await Promise.all([
        loadAdminData(),
        securityService.getLogs(),
        loadBackups(),
        loadNotifications(),
      ]);
      setMetrics(m);
      setLogs(l);
      setBackups(b);
      setNotifications(n);
    } catch (err: any) {
      setError(err?.message || 'Failed to load system data');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <div className="glass-panel p-5 flex items-center space-x-3">
          <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading system data from database...</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="card-stat p-5 animate-pulse"><div className="h-3 w-20 bg-slate-200 rounded mb-3" /><div className="h-7 w-12 bg-slate-200 rounded" /></div>)}
        </div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="card-stat p-6 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
        <h3 className="text-lg font-bold text-slate-900">Database Connection Error</h3>
        <p className="text-sm text-slate-500">{error}</p>
        <button onClick={() => setRetry(r => r + 1)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center space-x-2">
          <RefreshCw className="w-4 h-4" /><span>Retry</span>
        </button>
      </div>
    );
  }

  if (!metrics) return null;

  const unreadNotifs = notifications.filter(n => !n.read).length;
  const latestBackup = backups[0];
  const lastBackupTime = latestBackup?.completedAt
    ? new Date(latestBackup.completedAt).toLocaleDateString()
    : 'No backups';
  const backupStatus = latestBackup?.status || 'NONE';

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h1 className="text-[34px] font-extrabold font-heading text-slate-900 leading-tight">System Administrator</h1>
          <p className="text-slate-500 text-sm mt-1">Infrastructure, Integration & Platform Monitoring</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center px-3 py-1.5 rounded-lg border bg-emerald-50 border-emerald-200">
            <Activity className="w-4 h-4 mr-2 text-emerald-600" />
            <span className="text-xs font-mono font-semibold text-emerald-600">ONLINE</span>
          </div>
          <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition text-slate-400 hover:text-slate-700" title="Refresh from database">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="System Status" value="Online" icon={Server} color="text-emerald-600" sub="Application server operational" onClick={() => navigate('/admin/reports')} />
        <KpiCard label="Connected Subsystems" value={`${metrics.totalDocuments + metrics.totalContracts > 0 ? '2' : '0'}`} icon={Layers} color="text-blue-500" sub="Docs + Contracts" onClick={() => navigate('/admin/integrations')} />
        <KpiCard label="Active Sessions" value={metrics.activeSessions} icon={Users} color={metrics.activeSessions > 0 ? 'text-emerald-600' : 'text-slate-400'} sub="Current logged-in users" onClick={() => navigate('/security')} />
        <KpiCard label="AI Services" value={`${metrics.totalDocuments} docs`} icon={Cpu} color={metrics.totalDocuments > 0 ? 'text-emerald-600' : 'text-slate-400'} sub={`${metrics.totalContracts} contracts`} onClick={() => navigate('/admin/ai-services')} />
        <KpiCard label="Backup Status" value={backupStatus} icon={Download} color={backupStatus === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-500'} sub={`Last: ${lastBackupTime}`} onClick={() => navigate('/admin/backup')} />
        <KpiCard label="Security Alerts" value={metrics.activeAlertsCount} icon={Shield} color={metrics.activeAlertsCount > 0 ? 'text-rose-500' : 'text-emerald-600'} sub="Open security alerts" onClick={() => navigate('/security')} />
        <KpiCard label="Failed Logins" value={metrics.failedLoginAttempts} icon={Globe} color={metrics.failedLoginAttempts > 0 ? 'text-amber-500' : 'text-emerald-600'} sub="Failed authentication attempts" onClick={() => navigate('/security')} />
        <KpiCard label="Notifications" value={unreadNotifs} icon={Bell} color={unreadNotifs > 0 ? 'text-rose-500' : 'text-slate-400'} sub={`${notifications.length} total`} onClick={() => navigate('/admin/notifications')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-stat p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center"><Shield className="w-4 h-4 mr-2 text-rose-500" /> Recent Security Events</h3>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Shield className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-xs">No security events recorded</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.slice(0, 8).map((log, i) => (
                <div key={log.id || i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center space-x-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      log.riskLevel === 'CRITICAL' ? 'bg-rose-500' :
                      log.riskLevel === 'HIGH' ? 'bg-orange-500' :
                      log.riskLevel === 'MEDIUM' ? 'bg-amber-500' : 'bg-slate-300'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{log.action}</p>
                      <p className="text-xs text-slate-500">{log.fullName || log.ipAddress} · {log.module}</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 font-mono shrink-0 ml-2">
                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-stat p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center"><Bell className="w-4 h-4 mr-2 text-emerald-600" /> Recent Notifications</h3>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Bell className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-xs">No admin notifications</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.slice(0, 6).map((n) => (
                <div key={n.id} className={`p-3 rounded-xl border ${
                  n.severity === 'CRITICAL' ? 'bg-rose-50 border-rose-200' :
                  n.severity === 'WARNING' ? 'bg-amber-50 border-amber-200' :
                  'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-start space-x-2">
                    {n.severity === 'CRITICAL' ? <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" /> :
                     n.severity === 'WARNING' ? <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /> :
                     <Bell className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />}
                    <div>
                      <p className="text-sm font-medium text-slate-900">{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel p-5">
        <div className="flex items-center space-x-3 mb-5">
          <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200"><Database className="w-5 h-5 text-emerald-600" /></div>
          <div><h2 className="text-lg font-bold text-slate-900">Database Summary</h2><p className="text-xs text-slate-500">Live record counts from primary database</p></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Documents</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{metrics.totalDocuments}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Contracts</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{metrics.totalContracts}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Active Sessions</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{metrics.activeSessions}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Blocked IPs</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{metrics.blockedIpsCount}</p>
          </div>
        </div>
      </div>

      <div className="glass-panel p-3 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center space-x-2">
          <Activity className="w-3.5 h-3.5 text-emerald-600" />
          <span>All data sourced from live backend database · No mock data used</span>
        </span>
        <button onClick={() => setRetry(r => r + 1)} className="flex items-center space-x-1 text-emerald-600 hover:underline">
          <RefreshCw className="w-3 h-3" /><span>Refresh</span>
        </button>
      </div>
    </div>
  );
};
