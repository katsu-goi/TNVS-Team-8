import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Users, Shield,
  RefreshCw, AlertCircle, Cpu,
  Download, Bell, Ban,
} from 'lucide-react';
import { dashboardErrorMessage, loadDashboardAnalytics } from '../../api/dashboardData';
import { securityService } from '../../api/securityService';
import { loadBackups } from '../../api/adminService';
import { notificationService, type AppNotification } from '../../api/notificationService';
import { isActorSuperAdmin, useAuthStore } from '../../stores/authStore';
import { OversightPanel } from '../oversight';
import { useLiveActivities } from './useLiveActivities';
import { SubsystemHealthGrid } from './SubsystemHealthGrid';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import type { AnalyticsData, DashboardMetrics, SecurityLog, BackupRecord } from '../../types';
import { DashboardHero, DashboardMetricCard } from '../ui/DashboardPrimitives';
import { EnterpriseOverview } from '../analytics/EnterpriseOverview';
import { PortalLoadingOverlay } from '../ui/PortalLoadingOverlay';

export const SysAdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const superAdministrator = isActorSuperAdmin(user);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [overview, setOverview] = useState<NonNullable<AnalyticsData['enterprise']>['overview'] | null>(null);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const { activities, onlineCount, peakToday } = useLiveActivities();
  const realtimeRevision = useRealtimeSyncStore((state) => state.revision);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analytics, l, b, n] = await Promise.all([
        loadDashboardAnalytics(superAdministrator),
        superAdministrator ? securityService.getLogs() : Promise.resolve([]),
        superAdministrator ? Promise.resolve([]) : loadBackups(),
        notificationService.getNotifications(),
      ]);
      const m: DashboardMetrics = {
        totalDocuments: 0,
        totalContracts: 0,
        activeSessions: analytics.security.activeSessions,
        failedLoginAttempts: analytics.security.failedLoginAttempts,
        blockedIpsCount: analytics.security.blockedIpsCount,
        activeAlertsCount: analytics.security.activeAlertsCount,
        totalBackups: b.length,
        totalNotifications: n.length,
      };
      setMetrics(m);
      setOverview(analytics.overview);
      setLogs(l);
      setBackups(b);
      setNotifications(n);
    } catch (err: unknown) {
      console.warn('Dashboard backend request failed; response details were withheld.');
      setError(dashboardErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [retry, realtimeRevision, superAdministrator]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading && !metrics) {
    return <PortalLoadingOverlay message="Loading system dashboard..." />;
  }

  if (error && !metrics) {
    return (
      <div className="card-stat p-6 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
        <h3 className="text-lg font-bold text-slate-900">Dashboard unavailable</h3>
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
  const backupStatus = latestBackup?.status === 'COMPLETED'
    ? latestBackup.verificationState ?? 'NOT_VERIFIED'
    : latestBackup?.status ?? 'NONE';
  const backupVerified = backupStatus === 'INTEGRITY_VERIFIED' || backupStatus === 'RESTORE_VERIFIED';
  const dashboardTitle = superAdministrator ? 'Super Administrator' : 'System Administrator';
  const dashboardSubtitle = superAdministrator
    ? 'Business Governance, RBAC & Security Oversight'
    : 'Infrastructure, Integration & Platform Monitoring';
  const dashboardCards = superAdministrator
    ? [
        { label: 'Online Users', value: onlineCount, icon: Users, color: onlineCount > 0 ? 'text-emerald-600' : 'text-slate-400', sub: `${onlineCount} users online · Peak today: ${peakToday}`, path: '/security', pulse: true },
        { label: 'Active Sessions', value: metrics.activeSessions, icon: Activity, color: 'text-emerald-600', sub: 'Authenticated sessions', path: '/security/audit-logs' },
        { label: 'Security Alerts', value: metrics.activeAlertsCount, icon: Shield, color: metrics.activeAlertsCount > 0 ? 'text-rose-500' : 'text-emerald-600', sub: 'Open security alerts', path: '/security' },
        { label: 'Failed Logins', value: metrics.failedLoginAttempts, icon: Shield, color: metrics.failedLoginAttempts > 0 ? 'text-amber-500' : 'text-emerald-600', sub: 'Failed attempts for admin/user accounts', path: '/security' },
        { label: 'Blocked IPs', value: metrics.blockedIpsCount, icon: Ban, color: metrics.blockedIpsCount > 0 ? 'text-amber-500' : 'text-emerald-600', sub: 'Active network blocks', path: '/security' },
        { label: 'Notifications', value: unreadNotifs, icon: Bell, color: unreadNotifs > 0 ? 'text-rose-500' : 'text-slate-400', sub: `${notifications.length} recipient-scoped`, path: '/admin/notifications' },
      ]
    : [
        { label: 'Online Users', value: onlineCount, icon: Users, color: onlineCount > 0 ? 'text-emerald-600' : 'text-slate-400', sub: `${onlineCount} users online · Peak today: ${peakToday}`, path: '/admin/sessions', pulse: true },
        { label: 'Active Sessions', value: metrics.activeSessions, icon: Cpu, color: metrics.activeSessions > 0 ? 'text-emerald-600' : 'text-slate-400', sub: 'Authenticated platform sessions', path: '/admin/sessions' },
        { label: 'Backup Status', value: backupStatus, icon: Download, color: backupVerified ? 'text-emerald-600' : 'text-amber-500', sub: `Last: ${lastBackupTime}`, path: '/admin/backup' },
        { label: 'Security Alerts', value: metrics.activeAlertsCount, icon: Shield, color: metrics.activeAlertsCount > 0 ? 'text-rose-500' : 'text-emerald-600', sub: 'Open security alerts', path: '/admin/system-health' },
        { label: 'Failed Logins', value: metrics.failedLoginAttempts, icon: Shield, color: metrics.failedLoginAttempts > 0 ? 'text-amber-500' : 'text-emerald-600', sub: 'Failed authentication attempts', path: '/admin/account-lockouts' },
        { label: 'Blocked IPs', value: metrics.blockedIpsCount, icon: Ban, color: metrics.blockedIpsCount > 0 ? 'text-amber-500' : 'text-emerald-600', sub: 'Active network blocks', path: '/admin/system-health' },
        { label: 'Notifications', value: unreadNotifs, icon: Bell, color: unreadNotifs > 0 ? 'text-rose-500' : 'text-slate-400', sub: `${notifications.length} total`, path: '/admin/notifications' },
      ];

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="card-stat p-4 text-rose-600">{error} Displaying the last successful update.</p>}
      <DashboardHero title={dashboardTitle} subtitle={dashboardSubtitle} actions={
          <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition text-slate-400 hover:text-slate-700" title="Refresh from database">
            <RefreshCw className="w-4 h-4" />
          </button>
      } />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {dashboardCards.map((card) => (
          <DashboardMetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            color={card.color}
            sub={card.sub}
            pulse={card.pulse}
            onClick={() => navigate(card.path)}
          />
        ))}
      </div>

      {overview && <EnterpriseOverview overview={overview} periodLabel="Today (Asia/Manila)" />}

      {superAdministrator && <OversightPanel />}

      <div className={`grid grid-cols-1 gap-6 ${superAdministrator ? 'lg:grid-cols-2' : ''}`}>
        {superAdministrator && <div className="card-stat p-5">
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
        </div>}

        {superAdministrator && <div className="card-stat p-5">
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
        </div>}
      </div>

      {/* SUBSYSTEM HEALTH & AVAILABILITY MONITORING 2x2 GRID */}
      <SubsystemHealthGrid />

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
