import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, CheckSquare, Building2, ClipboardList,
  RefreshCw, AlertCircle, Loader2, Activity,
  BarChart3, Clock,
} from 'lucide-react';
import { facilitiesService } from '../../api/facilitiesService';

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

export const FacilitiesDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await facilitiesService.getDashboardKpi();
      setKpi(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading && !kpi) {
    return (
      <div className="space-y-6">
        <div className="glass-panel p-5 flex items-center space-x-3">
          <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading facilities dashboard...</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="card-stat p-5 animate-pulse"><div className="h-3 w-20 bg-slate-200 rounded mb-3" /><div className="h-7 w-12 bg-slate-200 rounded" /></div>)}
        </div>
      </div>
    );
  }

  if (error && !kpi) {
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

  if (!kpi) return null;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h1 className="text-[34px] font-extrabold font-heading text-slate-900 leading-tight">Facilities Manager</h1>
          <p className="text-slate-500 text-sm mt-1">Operational Overview & Resource Management</p>
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
        <KpiCard label="Active Reservations" value={kpi.activeReservations ?? 0} icon={Calendar} color="text-emerald-600" sub="Currently approved" onClick={() => navigate('/facilities/reservations')} />
        <KpiCard label="Pending Approvals" value={kpi.pendingApprovals ?? 0} icon={CheckSquare} color={(kpi.pendingApprovals ?? 0) > 0 ? 'text-amber-500' : 'text-slate-400'} sub="Awaiting review" onClick={() => navigate('/facilities/approval')} />
        <KpiCard label="Available Rooms" value={kpi.availableRooms ?? 0} icon={Building2} color="text-emerald-600" sub="Ready for use" onClick={() => navigate('/facilities/rooms')} />
        <KpiCard label="Occupied Rooms" value={kpi.occupiedRooms ?? 0} icon={Building2} color={(kpi.occupiedRooms ?? 0) > 0 ? 'text-amber-500' : 'text-slate-400'} sub="Currently in use" onClick={() => navigate('/facilities/rooms')} />
        <KpiCard label="Rooms Under Maintenance" value={kpi.maintenanceRooms ?? 0} icon={Clock} color={(kpi.maintenanceRooms ?? 0) > 0 ? 'text-rose-500' : 'text-slate-400'} sub="Out of service" onClick={() => navigate('/facilities/rooms')} />
        <KpiCard label="Total Facility Assets" value={kpi.totalAssets ?? 0} icon={ClipboardList} color="text-blue-500" sub="All equipment" onClick={() => navigate('/facilities/assets')} />
        <KpiCard label="Asset Utilization Rate" value={kpi.assetUtilizationRate != null ? `${kpi.assetUtilizationRate}%` : 'N/A'} icon={BarChart3} color={(kpi.assetUtilizationRate ?? 0) > 50 ? 'text-emerald-600' : 'text-amber-500'} sub="Current rate" onClick={() => navigate('/facilities/analytics')} />
        <KpiCard label="Today's Reservations" value={kpi.todaysReservations ?? 0} icon={Calendar} color={(kpi.todaysReservations ?? 0) > 0 ? 'text-emerald-600' : 'text-slate-400'} sub="Scheduled today" onClick={() => navigate('/facilities/reservations')} />
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
