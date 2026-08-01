import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSignature, Building2,
  RefreshCw, AlertCircle, Loader2, Activity,
  Clock, ScrollText, ShieldAlert, BarChart3,
  BellRing, DollarSign, Gauge, CalendarClock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
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

const PIE_COLORS = ['#10B981', '#F59E0B', '#EF4444', '#6B7280', '#3B82F6', '#8B5CF6', '#EC4899'];

const riskBadge = (level?: string) => {
  switch ((level || '').toUpperCase()) {
    case 'LOW': return 'bg-emerald-50 text-emerald-600';
    case 'MEDIUM': return 'bg-amber-50 text-amber-600';
    case 'HIGH': return 'bg-orange-50 text-orange-600';
    case 'CRITICAL': return 'bg-rose-50 text-rose-600';
    default: return 'bg-slate-100 text-slate-500';
  }
};

const perfColor = (score?: number | null) => {
  if (score == null) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-500';
  return 'text-rose-500';
};

const formatCurrency = (v?: number | null) => {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
};

const toChartData = (dist: Record<string, number> = {}) =>
  Object.entries(dist).map(([name, value]) => ({ name, value, count: value }));

export const ProcurementOfficerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/procurement/dashboard/summary');
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
          <p className="text-sm text-slate-500">Loading procurement dashboard...</p>
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

  const contractsByStatus = toChartData(data.contractsByStatus);
  const contractsByType = toChartData(data.contractsByType);
  const expiringSoon: any[] = data.expiringSoon ?? [];
  const renewalAlerts: any[] = data.renewalAlerts ?? [];
  const recentlyUpdated: any[] = data.recentlyUpdatedContracts ?? [];
  const vendorPerformance: any[] = data.vendorPerformance ?? [];

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h1 className="text-[34px] font-extrabold font-heading text-slate-900 leading-tight">Contract Officer</h1>
          <p className="text-slate-500 text-sm mt-1">Contract Lifecycle &amp; Vendor Oversight</p>
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
        <KpiCard label="Active Contracts" value={data.activeContracts ?? 0} icon={FileSignature} color="text-emerald-600" sub={`${data.totalContracts ?? 0} total`} onClick={() => navigate('/procurement/contracts')} />
        <KpiCard label="Pending Reviews" value={data.pendingContractReviews ?? 0} icon={Clock} color={(data.pendingContractReviews ?? 0) > 0 ? 'text-amber-500' : 'text-slate-400'} sub="Under review" onClick={() => navigate('/procurement/contracts')} />
        <KpiCard label="Expiring Soon" value={data.expiringContracts ?? 0} icon={ShieldAlert} color={(data.expiringContracts ?? 0) > 0 ? 'text-rose-500' : 'text-slate-400'} sub="Within 30 days" onClick={() => navigate('/procurement/contracts')} />
        <KpiCard label="Active Value" value={formatCurrency(data.totalActiveContractValue)} icon={DollarSign} color="text-emerald-600" sub="Active contracts" onClick={() => navigate('/procurement/contracts')} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Active Vendors" value={data.activeVendors ?? 0} icon={Building2} color="text-blue-500" sub={`${data.totalVendors ?? 0} total`} onClick={() => navigate('/procurement/vendors')} />
        <KpiCard label="Avg Performance" value={data.avgVendorPerformance ?? 0} icon={Gauge} color={perfColor(data.avgVendorPerformance)} sub="Score / 100" onClick={() => navigate('/procurement/vendors')} />
        <KpiCard label="Overdue Obligations" value={data.overdueObligations ?? 0} icon={CalendarClock} color={(data.overdueObligations ?? 0) > 0 ? 'text-rose-500' : 'text-slate-400'} sub={`${data.openObligations ?? 0} open`} onClick={() => navigate('/procurement/vendors')} />
        <KpiCard label="Open Notices" value={data.openNotices ?? 0} icon={BellRing} color={(data.openNotices ?? 0) > 0 ? 'text-amber-500' : 'text-slate-400'} sub="Require attention" onClick={() => navigate('/procurement/notices')} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-stat p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Contracts by Status</h3>
            <FileSignature className="w-4 h-4 text-slate-400" />
          </div>
          {contractsByStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={contractsByStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name" label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {contractsByStatus.map((_: any, idx: number) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-xs text-slate-400">No contract data available</div>
          )}
        </div>

        <div className="card-stat p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Contracts by Type</h3>
            <BarChart3 className="w-4 h-4 text-slate-400" />
          </div>
          {contractsByType.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={contractsByType}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-xs text-slate-400">No contract data available</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-stat overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Contracts Expiring Soon</h3>
            <ShieldAlert className="w-4 h-4 text-slate-400" />
          </div>
          {expiringSoon.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No contracts expiring within 30 days</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {expiringSoon.map((c: any, i: number) => (
                <div key={c.id ?? i} className="p-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{c.title}</p>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${riskBadge(c.aiAssessedRiskLevel)}`}>{c.aiAssessedRiskLevel || 'N/A'}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{c.contractNumber} · {c.vendorName || c.counterParty}</p>
                  <p className="text-[10px] text-rose-500 mt-0.5 font-mono">Ends {c.endDate}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-stat overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Renewal Alerts</h3>
            <CalendarClock className="w-4 h-4 text-slate-400" />
          </div>
          {renewalAlerts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No renewal decisions due</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {renewalAlerts.map((c: any, i: number) => (
                <button key={c.id ?? i} onClick={() => navigate('/procurement/contracts')} className="w-full text-left p-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{c.title}</p>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">RENEW</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{c.contractNumber} · {c.vendorName || c.counterParty}</p>
                  <p className="text-[10px] text-amber-500 mt-0.5 font-mono">Notice by {c.renewalNoticeDate}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-stat overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Recently Updated Contracts</h3>
            <FileSignature className="w-4 h-4 text-slate-400" />
          </div>
          {recentlyUpdated.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No contracts yet</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentlyUpdated.map((c: any, i: number) => (
                <button key={c.id ?? i} onClick={() => navigate('/procurement/contracts')} className="w-full text-left p-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{c.title}</p>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{(c.status || '').replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{c.contractNumber} · {c.vendorName || c.counterParty || '—'}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card-stat overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Vendor Performance</h3>
            <Gauge className="w-4 h-4 text-slate-400" />
          </div>
          {vendorPerformance.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No performance data yet</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {vendorPerformance.map((v: any, i: number) => (
                <button key={v.id ?? i} onClick={() => navigate('/procurement/vendors')} className="w-full text-left p-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{v.name}</p>
                    <span className={`text-sm font-bold ${perfColor(v.performanceScore)}`}>{v.performanceScore ?? '—'}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{v.vendorCode} · SLA {v.slaComplianceRate != null ? `${v.slaComplianceRate}%` : '—'}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel p-3 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center space-x-2">
          <Activity className="w-3.5 h-3.5 text-emerald-600" />
          <span>All data sourced from live backend database</span>
        </span>
        <span className="flex items-center space-x-3">
          <span className="flex items-center space-x-1"><ScrollText className="w-3.5 h-3.5" /><span>{data.recentAuditEvents ?? 0} audit events (7d)</span></span>
          <button onClick={() => setRetry(r => r + 1)} className="flex items-center space-x-1 text-emerald-600 hover:underline">
            <RefreshCw className="w-3 h-3" /><span>Refresh</span>
          </button>
        </span>
      </div>
    </div>
  );
};
