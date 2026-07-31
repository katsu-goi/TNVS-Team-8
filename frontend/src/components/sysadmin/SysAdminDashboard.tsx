import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database, Activity, Users, Shield,
  RefreshCw, AlertCircle, Cpu,
  Download, Bell, Layers,
  ChevronRight, Loader2,
} from 'lucide-react';
import { loadAdminData, loadBackups, loadNotifications } from '../../api/adminService';
import { kpiService } from '../../api/kpiService';
import { securityService } from '../../api/securityService';
import { useLiveActivities } from './useLiveActivities';
import { SubsystemHealthGrid } from './SubsystemHealthGrid';
import type { DashboardMetrics, SecurityLog, AdminNotification, BackupRecord, SystemKpi } from '../../types';

const KpiCard: React.FC<{ label: string; value: string | number; icon: React.ElementType; color?: string; sub?: string; onClick?: () => void; pulse?: boolean }> = ({ label, value, icon: Icon, color, sub, onClick, pulse }) => (
  <button onClick={onClick} className="card-stat p-4 text-left w-full cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group">
    <div className="flex items-center justify-between mb-2">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] group-hover:text-emerald-700 transition-colors flex items-center gap-1.5">
        {label}
        {pulse && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="animate-pulse relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        )}
      </p>
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
  const [kpi, setKpi] = useState<SystemKpi | null>(null);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const { activities, onlineCount, peakToday } = useLiveActivities();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, k, l, b, n] = await Promise.all([
        loadAdminData(),
        kpiService.loadKpi(),
        securityService.getLogs(),
        loadBackups(),
        loadNotifications(),
      ]);
      setMetrics(m);
      setKpi(k);
      setLogs(l);
      setBackups(b);
      setNotifications(n);
    } catch (err: any) {
      console.warn('Backend connection issue:', err);
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
          <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition text-slate-400 hover:text-slate-700" title="Refresh from database">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Connected Subsystems" value={kpi ? `${[kpi.facilities.totalFacilities, kpi.visitors.totalVisitors, kpi.documents.totalDocuments, kpi.legal.totalCases, kpi.contracts.totalContracts].filter(v => v > 0).length}` : '0'} icon={Layers} color="text-blue-500" sub="Modules with data" onClick={() => navigate('/admin/integrations')} />
        <KpiCard label="Active Users" value={onlineCount} icon={Users} color={onlineCount > 0 ? 'text-emerald-600' : 'text-slate-400'} sub={`${onlineCount} users online · Peak today: ${peakToday}`} onClick={() => navigate('/security')} pulse />
        <KpiCard label="AI Services" value={`${metrics.totalDocuments} docs`} icon={Cpu} color={metrics.totalDocuments > 0 ? 'text-emerald-600' : 'text-slate-400'} sub={`${metrics.totalContracts} contracts`} onClick={() => navigate('/admin/ai-services')} />
        <KpiCard label="Backup Status" value={backupStatus} icon={Download} color={backupStatus === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-500'} sub={`Last: ${lastBackupTime}`} onClick={() => navigate('/admin/backup')} />
        <KpiCard label="Security Alerts" value={metrics.activeAlertsCount} icon={Shield} color={metrics.activeAlertsCount > 0 ? 'text-rose-500' : 'text-emerald-600'} sub="Open security alerts" onClick={() => navigate('/security')} />
        <KpiCard label="Failed Logins" value={metrics.failedLoginAttempts} icon={Shield} color={metrics.failedLoginAttempts > 0 ? 'text-amber-500' : 'text-emerald-600'} sub="Failed authentication attempts" onClick={() => navigate('/security')} />
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
                    <span className={`w-2 h-2 rounded-full shrink-0 ${log.riskLevel === 'CRITICAL' ? 'bg-rose-500' : log.riskLevel === 'HIGH' ? 'bg-orange-500' : log.riskLevel === 'MEDIUM' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{log.action}</p>
                      <p className="text-xs text-slate-500">{log.fullName || log.ipAddress} · {log.module}</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 font-mono shrink-0 ml-2">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-stat p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center">
            <Activity className="w-4 h-4 mr-2 text-emerald-600" />
            Live User Activity
            <span className="ml-2 text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="animate-pulse relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              Real-Time Feed
            </span>
          </h3>
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Activity className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-xs">Waiting for user activity...</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin">
              {activities.map((a) => {
                const secs = Math.floor((Date.now() - a.timestamp.getTime()) / 1000);
                const rel = secs < 3 ? 'Just now' : secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`;
                const isAdmin = a.user.role === 'Admin';
                return (
                  <div key={a.id} className={`flex items-start space-x-3 py-2.5 px-3 rounded-xl transition-all duration-500 ${a.isNew ? 'bg-emerald-500/10' : 'hover:bg-slate-50'}`}>
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isAdmin ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>{a.user.initials}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {a.user.name}
                          <span className={`ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded-full ${isAdmin ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>{a.user.role}</span>
                        </p>
                        <span className="text-[11px] text-emerald-600 font-mono shrink-0">{rel}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{a.user.email}</p>
                      <p className="text-xs text-slate-700 mt-0.5">{a.action}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{a.ip} · {a.device}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SUBSYSTEM HEALTH & AVAILABILITY MONITORING 2x2 GRID */}
      <SubsystemHealthGrid />

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
            <p className="text-xs text-slate-500">Active Users</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{kpi?.global.activeUsers ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Blocked IPs</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{metrics.blockedIpsCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Reservations Today</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{kpi?.facilities.bookingsToday ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Visitors On-Site</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{kpi?.visitors.onSite ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Legal Cases</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{kpi?.legal.totalCases ?? 0}</p>
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
