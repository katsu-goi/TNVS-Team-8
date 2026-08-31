import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database, Activity, Users, Shield,
  RefreshCw, AlertCircle, Cpu,
  Download, Bell, Layers,
  Loader2,
} from 'lucide-react';
import { supabaseMonitoringService } from '../../api/supabaseMonitoringService';
import { kpiService } from '../../api/kpiService';
import { securityService } from '../../api/securityService';
import { loadBackups, loadNotifications } from '../../api/adminService';
import { useLiveActivities } from './useLiveActivities';
import { SubsystemHealthGrid } from './SubsystemHealthGrid';
import type { DashboardMetrics, SecurityLog, AdminNotification, BackupRecord, SystemKpi } from '../../types';

const KpiCard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
  iconBackground?: string;
  sub?: string;
  onClick?: () => void;
  pulse?: boolean;
}> = ({ label, value, icon: Icon, color, iconBackground, sub, onClick, pulse }) => (
  <button
    type="button"
    onClick={onClick}
    className="group min-h-[148px] w-full rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-[0_4px_16px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-px hover:border-slate-300 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] focus:outline-none focus:ring-2 focus:ring-[#D02F34]/20 focus:ring-offset-2"
  >
    <div className="mb-2 flex items-start justify-between gap-4">
      <p className="flex min-w-0 items-center gap-1.5 pt-0.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 transition-colors group-hover:text-slate-700">
        {label}
        {pulse && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="animate-pulse relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        )}
      </p>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/[0.035] ${iconBackground || 'bg-slate-50'}`}>
        <Icon className={`h-5 w-5 ${color || 'text-slate-400'} transition-transform duration-200 group-hover:scale-105`} />
      </div>
    </div>
    <p className="text-[28px] font-bold leading-none tracking-tight text-slate-950">{value}</p>
    {sub && <p className="mt-2 text-xs leading-4 text-slate-500">{sub}</p>}
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
      const [telemetry, k, l, b, n] = await Promise.all([
        supabaseMonitoringService.getLiveDashboardCounts(),
        kpiService.loadKpi(),
        securityService.getLogs(),
        loadBackups(),
        loadNotifications(),
      ]);
      const m: DashboardMetrics = {
        totalDocuments: telemetry.data.totalDocuments,
        totalContracts: telemetry.data.totalContracts,
        activeSessions: telemetry.data.activeSessionsCount,
        failedLoginAttempts: telemetry.data.failedLoginAttemptsCount,
        blockedIpsCount: telemetry.data.blockedIpsCount,
        activeAlertsCount: telemetry.data.activeAlertsCount,
        totalBackups: b.length,
        totalNotifications: n.length,
      };
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
      <div className="flex flex-col gap-5 rounded-2xl border border-[#2A2D34] bg-gradient-to-br from-[#17191F] to-[#20232A] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.13)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <h1 className="font-heading text-[28px] font-extrabold leading-tight text-white sm:text-[34px]">System Administrator</h1>
          <p className="mt-1 text-sm leading-5 text-white/65">Infrastructure, Integration &amp; Platform Monitoring</p>
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => setRetry(r => r + 1)}
            className="rounded-lg border border-white/15 bg-white/10 p-2.5 text-white/70 shadow-sm transition hover:border-white/25 hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
            title="Refresh from database"
            aria-label="Refresh dashboard data"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Connected Subsystems" value={kpi ? `${[kpi.facilities.totalFacilities, kpi.visitors.totalVisitors, kpi.documents.totalDocuments, kpi.legal.totalCases, kpi.contracts.totalContracts].filter(v => v > 0).length}` : '0'} icon={Layers} color="text-blue-500" iconBackground="bg-blue-50" sub="Modules with data" onClick={() => navigate('/admin/integrations')} />
          <KpiCard label="Active Users" value={onlineCount} icon={Users} color={onlineCount > 0 ? 'text-emerald-600' : 'text-slate-400'} iconBackground={onlineCount > 0 ? 'bg-emerald-50' : 'bg-slate-50'} sub={`${onlineCount} users online · Peak today: ${peakToday}`} onClick={() => navigate('/security')} pulse />
          <KpiCard label="AI Services" value={`${metrics.totalDocuments} docs`} icon={Cpu} color={metrics.totalDocuments > 0 ? 'text-[#D02F34]' : 'text-slate-400'} iconBackground={metrics.totalDocuments > 0 ? 'bg-red-50' : 'bg-slate-50'} sub={`${metrics.totalContracts} contracts`} onClick={() => navigate('/admin/ai-services')} />
          <KpiCard label="Backup Status" value={backupStatus} icon={Download} color={backupStatus === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-500'} iconBackground={backupStatus === 'COMPLETED' ? 'bg-emerald-50' : 'bg-amber-50'} sub={`Last: ${lastBackupTime}`} onClick={() => navigate('/admin/backup')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard label="Security Alerts" value={metrics.activeAlertsCount} icon={Shield} color={metrics.activeAlertsCount > 0 ? 'text-rose-500' : 'text-emerald-600'} iconBackground={metrics.activeAlertsCount > 0 ? 'bg-rose-50' : 'bg-emerald-50'} sub="Open security alerts" onClick={() => navigate('/security')} />
          <KpiCard label="Failed Logins" value={metrics.failedLoginAttempts} icon={Shield} color={metrics.failedLoginAttempts > 0 ? 'text-amber-500' : 'text-emerald-600'} iconBackground={metrics.failedLoginAttempts > 0 ? 'bg-amber-50' : 'bg-emerald-50'} sub="Failed authentication attempts" onClick={() => navigate('/security')} />
          <KpiCard label="Notifications" value={unreadNotifs} icon={Bell} color={unreadNotifs > 0 ? 'text-rose-500' : 'text-violet-500'} iconBackground={unreadNotifs > 0 ? 'bg-rose-50' : 'bg-violet-50'} sub={`${notifications.length} total`} onClick={() => navigate('/admin/notifications')} />
        </div>
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
                const isAdmin = /ADMIN/i.test(a.user.role);
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
