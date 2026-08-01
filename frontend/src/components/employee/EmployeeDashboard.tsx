import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, RefreshCw, AlertCircle, Loader2,
  ClipboardList, Clock, CheckCircle2, XCircle,
  CalendarClock, Bell, Plus, UserPlus, Upload, FileSignature,
} from 'lucide-react';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { safeFetchJson } from '../../api/client';

const KpiCard: React.FC<{ label: string; value: string | number; icon: React.ElementType; color?: string; sub?: string; onClick?: () => void }> = ({ label, value, icon: Icon, color, sub, onClick }) => (
  <button onClick={onClick} className="card-stat p-4 text-left w-full cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group">
    <div className="flex items-center justify-between mb-2">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] group-hover:text-emerald-700 transition-colors">{label}</p>
      <Icon className={`w-4 h-4 ${color || 'text-slate-400'} group-hover:scale-110 transition-transform`} />
    </div>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
    {sub && <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{sub}</p>}
  </button>
);

const QuickAction: React.FC<{ label: string; icon: React.ElementType; onClick: () => void }> = ({ label, icon: Icon, onClick }) => (
  <button onClick={onClick} className="card-stat p-4 flex items-center space-x-3 text-left w-full hover:border-emerald-300 hover:shadow-md transition-all group">
    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
      <Icon className="w-5 h-5 text-emerald-600" />
    </div>
    <span className="text-sm font-semibold text-slate-900">{label}</span>
  </button>
);

const statusBadge = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED': return 'bg-emerald-50 text-emerald-600';
    case 'PENDING': return 'bg-amber-50 text-amber-600';
    case 'IN_REVIEW': return 'bg-blue-50 text-blue-600';
    case 'REJECTED': return 'bg-rose-50 text-rose-600';
    case 'CANCELLED': return 'bg-slate-100 text-slate-500';
    default: return 'bg-slate-100 text-slate-500';
  }
};

const notifDot = (type?: string) => {
  switch ((type || '').toUpperCase()) {
    case 'APPROVAL': return 'bg-emerald-500';
    case 'REJECTION': return 'bg-rose-500';
    case 'REMINDER': return 'bg-amber-500';
    default: return 'bg-blue-500';
  }
};

const fmtDateTime = (v?: string) => {
  if (!v) return '—';
  try {
    const d = new Date(v);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return v; }
};

export const EmployeeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/employee/dashboard/summary');
      setData(json?.data ?? {});
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { loadData(); }, [loadData]);

  const revision = useRealtimeSyncStore(s => s.revision);
  useEffect(() => { if (revision > 0) setRetry(r => r + 1); }, [revision]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="glass-panel p-5 flex items-center space-x-3">
          <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading your dashboard...</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="card-stat p-5 animate-pulse"><div className="h-3 w-20 bg-slate-200 rounded mb-3" /><div className="h-7 w-12 bg-slate-200 rounded" /></div>)}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card-stat p-6 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
        <h3 className="text-lg font-bold text-slate-900">Connection Error</h3>
        <p className="text-sm text-slate-500">{error}</p>
        <button onClick={() => setRetry(r => r + 1)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center space-x-2">
          <RefreshCw className="w-4 h-4" /><span>Retry</span>
        </button>
      </div>
    );
  }

  if (!data) return null;

  const upcoming: any[] = data.upcomingReservationsList ?? [];
  const recentRequests: any[] = data.recentRequests ?? [];
  const recentNotifications: any[] = data.recentNotifications ?? [];

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h1 className="text-[34px] font-extrabold font-heading text-slate-900 leading-tight">My Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Your requests, reservations &amp; notifications</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center px-3 py-1.5 rounded-lg border bg-emerald-50 border-emerald-200">
            <Activity className="w-4 h-4 mr-2 text-emerald-600" />
            <span className="text-xs font-mono font-semibold text-emerald-600">ONLINE</span>
          </div>
          <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition text-slate-400 hover:text-slate-700" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="Active Requests" value={data.activeRequests ?? 0} icon={ClipboardList} color="text-emerald-600" sub="In flight" onClick={() => navigate('/employee/requests')} />
        <KpiCard label="Pending Approvals" value={data.pendingApprovals ?? 0} icon={Clock} color={(data.pendingApprovals ?? 0) > 0 ? 'text-amber-500' : 'text-slate-400'} sub="Awaiting decision" onClick={() => navigate('/employee/requests')} />
        <KpiCard label="Approved" value={data.approvedRequests ?? 0} icon={CheckCircle2} color="text-emerald-600" sub="Approved items" onClick={() => navigate('/employee/requests')} />
        <KpiCard label="Rejected" value={data.rejectedRequests ?? 0} icon={XCircle} color={(data.rejectedRequests ?? 0) > 0 ? 'text-rose-500' : 'text-slate-400'} sub="Not approved" onClick={() => navigate('/employee/requests')} />
        <KpiCard label="Upcoming Reservations" value={data.upcomingReservations ?? 0} icon={CalendarClock} color="text-blue-500" sub="Scheduled ahead" onClick={() => navigate('/employee/reservations')} />
        <KpiCard label="Notifications" value={data.notifications ?? 0} icon={Bell} color={(data.notifications ?? 0) > 0 ? 'text-amber-500' : 'text-slate-400'} sub="Unread" onClick={() => navigate('/employee/notifications')} />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-bold text-slate-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction label="New Reservation" icon={Plus} onClick={() => navigate('/employee/reservations?new=1')} />
          <QuickAction label="Register Visitor" icon={UserPlus} onClick={() => navigate('/employee/visitors?new=1')} />
          <QuickAction label="Upload Document" icon={Upload} onClick={() => navigate('/employee/documents?new=1')} />
          <QuickAction label="Submit Request" icon={FileSignature} onClick={() => navigate('/employee/requests?new=1')} />
        </div>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-stat overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Upcoming Reservations</h3>
            <CalendarClock className="w-4 h-4 text-slate-400" />
          </div>
          {upcoming.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No upcoming reservations</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {upcoming.map((r: any, i: number) => (
                <button key={r.id ?? i} onClick={() => navigate('/employee/reservations')} className="w-full text-left p-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{r.title}</p>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${statusBadge(r.status)}`}>{r.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{r.roomName || '—'} · {fmtDateTime(r.startTime)}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card-stat overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Recent Requests</h3>
            <ClipboardList className="w-4 h-4 text-slate-400" />
          </div>
          {recentRequests.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No requests yet</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentRequests.map((r: any, i: number) => (
                <button key={r.id ?? i} onClick={() => navigate('/employee/requests')} className="w-full text-left p-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{r.title}</p>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${statusBadge(r.status)}`}>{(r.status || '').replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{r.type}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card-stat overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Recent Notifications</h3>
          <Bell className="w-4 h-4 text-slate-400" />
        </div>
        {recentNotifications.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">No notifications</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recentNotifications.map((n: any, i: number) => (
              <button key={n.id ?? i} onClick={() => navigate('/employee/notifications')} className="w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-start space-x-3">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${notifDot(n.type)}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900 truncate">{n.title}</p>
                    {!n.read && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 shrink-0">NEW</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{n.message}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel p-3 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center space-x-2">
          <Activity className="w-3.5 h-3.5 text-emerald-600" />
          <span>Showing only records related to you</span>
        </span>
        <button onClick={() => setRetry(r => r + 1)} className="flex items-center space-x-1 text-emerald-600 hover:underline">
          <RefreshCw className="w-3 h-3" /><span>Refresh</span>
        </button>
      </div>
    </div>
  );
};
