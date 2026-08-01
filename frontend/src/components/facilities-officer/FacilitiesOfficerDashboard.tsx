import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, ClipboardList, Building2, CheckSquare,
  RefreshCw, AlertCircle, Loader2, Activity,
  Wrench, FileText, Eye, PlusCircle, BarChart3,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

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

const QuickActionCard: React.FC<{ label: string; desc: string; icon: React.ElementType; onClick?: () => void }> = ({ label, desc, icon: Icon, onClick }) => (
  <button onClick={onClick} className="card-stat p-4 text-left w-full cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group flex items-start space-x-3">
    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 shrink-0">
      <Icon className="w-5 h-5 text-emerald-600" />
    </div>
    <div>
      <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">{label}</p>
      <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
    </div>
  </button>
);

const PIE_COLORS = ['#10B981', '#F59E0B', '#EF4444', '#6B7280', '#3B82F6'];

import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';

import { safeFetchJson } from '../../api/client';

export const FacilitiesOfficerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/facilities-officer/dashboard/summary');
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

  const kpi = data?.kpi ?? {};
  const chartData = data?.charts ?? {};
  const tables = data?.tables ?? {};

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="glass-panel p-5 flex items-center space-x-3">
          <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading facilities officer dashboard...</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card-stat p-5 animate-pulse"><div className="h-3 w-20 bg-slate-200 rounded mb-3" /><div className="h-7 w-12 bg-slate-200 rounded" /></div>)}
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

  const todayBookings = tables?.todayBookings ?? [];
  const maintenanceTasks = tables?.maintenanceTasks ?? [];
  const facilityInventory = tables?.facilityInventory ?? [];

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h1 className="text-[34px] font-extrabold font-heading text-slate-900 leading-tight">Facilities Officer</h1>
          <p className="text-slate-500 text-sm mt-1">Day-to-Day Facility Operations</p>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Today's Reservations" value={kpi.todaysReservations ?? 0} icon={Calendar} color={(kpi.todaysReservations ?? 0) > 0 ? 'text-emerald-600' : 'text-slate-400'} sub="Scheduled today" onClick={() => navigate('/facilities-officer/reservations')} />
        <KpiCard label="Pending Requests" value={kpi.pendingRequests ?? 0} icon={CheckSquare} color={(kpi.pendingRequests ?? 0) > 0 ? 'text-amber-500' : 'text-slate-400'} sub="Awaiting processing" onClick={() => navigate('/facilities-officer/reservations')} />
        <KpiCard label="Facilities Under Maintenance" value={kpi.facilitiesUnderMaintenance ?? 0} icon={Wrench} color={(kpi.facilitiesUnderMaintenance ?? 0) > 0 ? 'text-rose-500' : 'text-slate-400'} sub="Out of service" />
        <KpiCard label="Tasks Due Today" value={kpi.tasksDueToday ?? 0} icon={ClipboardList} color={(kpi.tasksDueToday ?? 0) > 0 ? 'text-blue-500' : 'text-slate-400'} sub="Pending completion" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-stat p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Daily Reservation Load</h3>
            <BarChart3 className="w-4 h-4 text-slate-400" />
          </div>
          {chartData.dailyReservationLoad?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData.dailyReservationLoad}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-xs text-slate-400">No reservation data available</div>
          )}
        </div>

        <div className="card-stat p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Facility Status Breakdown</h3>
            <Building2 className="w-4 h-4 text-slate-400" />
          </div>
          {chartData.facilityStatusBreakdown?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                  <Pie data={chartData.facilityStatusBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name" label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {chartData.facilityStatusBreakdown.map((_: any, idx: number) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-xs text-slate-400">No facility status data available</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-stat overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Today's Bookings</h3>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>
          {todayBookings.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No bookings for today</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {todayBookings.map((b: any, i: number) => (
                <div key={i} className="p-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{b.title}</p>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      b.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' :
                      b.status === 'PENDING' ? 'bg-amber-50 text-amber-600' :
                      b.status === 'CANCELLED' ? 'bg-slate-100 text-slate-500' :
                      'bg-rose-50 text-rose-600'
                    }`}>{b.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{b.room} · {b.time}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-stat overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Maintenance Task List</h3>
            <Wrench className="w-4 h-4 text-slate-400" />
          </div>
          {maintenanceTasks.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No maintenance tasks</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {maintenanceTasks.map((t: any, i: number) => (
                <div key={i} className="p-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{t.task}</p>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      t.priority === 'HIGH' ? 'bg-rose-50 text-rose-600' :
                      t.priority === 'MEDIUM' ? 'bg-amber-50 text-amber-600' :
                      'bg-slate-100 text-slate-500'
                    }`}>{t.priority}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{t.location} · Due: {t.dueDate}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-stat overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Facility Inventory</h3>
            <ClipboardList className="w-4 h-4 text-slate-400" />
          </div>
          {facilityInventory.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No inventory data</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {facilityInventory.map((item: any, i: number) => (
                <div key={i} className="p-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{item.name}</p>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      item.status === 'AVAILABLE' ? 'bg-emerald-50 text-emerald-600' :
                      item.status === 'IN_USE' ? 'bg-blue-50 text-blue-600' :
                      item.status === 'UNDER_MAINTENANCE' ? 'bg-amber-50 text-amber-600' :
                      'bg-slate-100 text-slate-500'
                    }`}>{item.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Qty: {item.quantity} · {item.location}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickActionCard label="Reserve Facility" desc="Book a room or vehicle bay" icon={PlusCircle} onClick={() => navigate('/facilities-officer/reservations')} />
          <QuickActionCard label="Log Maintenance Issue" desc="Report a repair needed" icon={Wrench} onClick={() => navigate('/facilities-officer/reservations')} />
          <QuickActionCard label="Check Facility Status" desc="View current room availability" icon={Eye} onClick={() => navigate('/facilities-officer/reservations')} />
          <QuickActionCard label="Upload Facility Document" desc="Attach facility-related files" icon={FileText} onClick={() => navigate('/facilities-officer/documents')} />
        </div>
      </div>

      <div className="glass-panel p-3 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center space-x-2">
          <Activity className="w-3.5 h-3.5 text-emerald-600" />
          <span>All data sourced from live backend database</span>
        </span>
        <button onClick={() => setRetry(r => r + 1)} className="flex items-center space-x-1 text-emerald-600 hover:underline">
          <RefreshCw className="w-3 h-3" /><span>Refresh</span>
        </button>
      </div>
    </div>
  );
};