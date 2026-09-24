import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, FileSignature, Archive, CheckCircle2,
  RefreshCw, AlertCircle, Activity,
  Clock, ScrollText, ShieldAlert, BarChart3,
  BellRing, Trash2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { safeFetchJson } from '../../api/client';
import { DashboardHero, DashboardMetricCard } from '../ui/DashboardPrimitives';
import { ErrorState, PageContainer } from '../ui/SharedUI';
import { PortalLoadingOverlay } from '../ui/PortalLoadingOverlay';

const PIE_COLORS = ['#10B981', '#F59E0B', '#EF4444', '#6B7280', '#3B82F6', '#8B5CF6'];

const riskBadge = (level?: string) => {
  switch ((level || '').toUpperCase()) {
    case 'LOW': return 'bg-emerald-50 text-emerald-600';
    case 'MEDIUM': return 'bg-amber-50 text-amber-600';
    case 'HIGH': return 'bg-orange-50 text-orange-600';
    case 'CRITICAL': return 'bg-rose-50 text-rose-600';
    default: return 'bg-slate-100 text-slate-500';
  }
};

const docStatusBadge = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED': return 'bg-emerald-50 text-emerald-600';
    case 'PENDING_REVIEW': return 'bg-amber-50 text-amber-600';
    case 'ARCHIVED': return 'bg-slate-100 text-slate-500';
    case 'REJECTED': return 'bg-rose-50 text-rose-600';
    default: return 'bg-blue-50 text-blue-600';
  }
};

const toChartData = (dist: Record<string, number> = {}) =>
  Object.entries(dist).map(([name, value]) => ({ name, value, count: value }));

export const ComplianceOfficerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/compliance/dashboard/summary');
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
    return <PortalLoadingOverlay message="Loading compliance dashboard..." />;
  }

  if (error && !data) {
    return <ErrorState title="Connection error" message={error} onRetry={() => setRetry(r => r + 1)} />;
  }

  if (!data) return null;

  const documentsByStatus = toChartData(data.documentsByStatus);
  const contractsByStatus = toChartData(data.contractsByStatus);
  const expiringSoon: any[] = data.expiringSoon ?? [];
  const recentDocuments: any[] = data.recentDocuments ?? [];

  return (
    <PageContainer>
      <DashboardHero title="Compliance Officer" subtitle="Records &amp; Compliance Oversight" actions={
        <>
          <div className="flex items-center px-3 py-1.5 rounded-lg border bg-emerald-50 border-emerald-200">
            <Activity className="w-4 h-4 mr-2 text-emerald-600" />
            <span className="text-xs font-mono font-semibold text-emerald-600">ONLINE</span>
          </div>
          <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition text-slate-400 hover:text-slate-700" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </>
      } />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard label="Total Documents" value={data.totalDocuments ?? 0} icon={FileText} color="text-emerald-600" sub="In records" onClick={() => navigate('/compliance/documents')} />
        <DashboardMetricCard label="Pending Review" value={data.pendingReview ?? 0} icon={Clock} color={(data.pendingReview ?? 0) > 0 ? 'text-amber-500' : 'text-slate-400'} sub="Awaiting approval" onClick={() => navigate('/compliance/documents')} />
        <DashboardMetricCard label="Active Contracts" value={data.activeContracts ?? 0} icon={FileSignature} color="text-blue-500" sub={`${data.totalContracts ?? 0} total`} onClick={() => navigate('/compliance/contracts')} />
        <DashboardMetricCard label="Expiring Soon" value={data.expiringContracts ?? 0} icon={ShieldAlert} color={(data.expiringContracts ?? 0) > 0 ? 'text-rose-500' : 'text-slate-400'} sub="Within 30 days" onClick={() => navigate('/compliance/contracts')} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DashboardMetricCard label="Open Alerts" value={data.openAlerts ?? 0} icon={BellRing} color={(data.openAlerts ?? 0) > 0 ? 'text-amber-500' : 'text-slate-400'} sub="Require attention" onClick={() => navigate('/compliance/alerts')} />
        <DashboardMetricCard label="Pending Disposals" value={data.pendingDisposals ?? 0} icon={Trash2} color={(data.pendingDisposals ?? 0) > 0 ? 'text-rose-500' : 'text-slate-400'} sub="Awaiting decision" onClick={() => navigate('/compliance/disposal')} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <DashboardMetricCard label="Policy Required" value={data.retentionPolicyRequired ?? 0} icon={AlertCircle} color={(data.retentionPolicyRequired ?? 0) > 0 ? 'text-rose-500' : 'text-slate-400'} sub="Needs classification match" onClick={() => navigate('/compliance/documents')} />
        <DashboardMetricCard label="Retention Upcoming" value={data.retentionExpiring ?? 0} icon={Clock} color="text-amber-500" sub="Automated windows" onClick={() => navigate('/compliance/alerts')} />
        <DashboardMetricCard label="Disposal Eligible" value={data.retentionExpired ?? 0} icon={Trash2} color="text-rose-500" sub="Human review required" onClick={() => navigate('/compliance/disposal')} />
        <DashboardMetricCard label="Legal Holds" value={data.activeLegalHolds ?? 0} icon={ShieldAlert} color="text-purple-500" sub="Disposal blocked" onClick={() => navigate('/compliance/documents')} />
        <DashboardMetricCard label="Overdue Obligations" value={data.overdueObligations ?? 0} icon={FileSignature} color="text-rose-500" sub="Reviewed obligations" onClick={() => navigate('/compliance/contracts')} />
      </div>

      <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Lifecycle automation health</p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {data.automationHealth?.status ?? 'AWAITING FIRST RUN'}
            {data.automationHealth?.lastCompletedAt ? ` · ${new Date(data.automationHealth.lastCompletedAt).toLocaleString()}` : ''}
          </p>
        </div>
        <div className="flex gap-4 text-[11px] font-mono text-slate-500">
          <span>Processed {data.automationHealth?.processedCount ?? 0}</span>
          <span>Alerts {data.automationHealth?.generatedAlerts ?? 0}</span>
          <span>Notifications {data.automationHealth?.generatedNotifications ?? 0}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard label="Approved Documents" value={data.approvedDocuments ?? 0} icon={CheckCircle2} color="text-emerald-600" sub="Finalized" onClick={() => navigate('/compliance/documents')} />
        <DashboardMetricCard label="Archived Documents" value={data.archivedDocuments ?? 0} icon={Archive} color="text-slate-400" sub="Retained" onClick={() => navigate('/compliance/documents')} />
        <DashboardMetricCard label="Retention Policies" value={data.retentionPolicies ?? 0} icon={Archive} color="text-purple-500" sub="Active policies" onClick={() => navigate('/compliance/retention')} />
        <DashboardMetricCard label="Audit Events (7d)" value={data.recentAuditEvents ?? 0} icon={ScrollText} color="text-blue-500" sub="Last 7 days" onClick={() => navigate('/compliance/audit')} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-stat p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Documents by Status</h3>
            <BarChart3 className="w-4 h-4 text-slate-400" />
          </div>
          {documentsByStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={documentsByStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-xs text-slate-400">No document data available</div>
          )}
        </div>

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
                  <p className="text-xs text-slate-500 mt-0.5">{c.contractNumber} · {c.counterParty}</p>
                  <p className="text-[10px] text-rose-500 mt-0.5 font-mono">Ends {c.endDate}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-stat overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Recent Documents</h3>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          {recentDocuments.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No recent documents</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentDocuments.map((d: any, i: number) => (
                <div key={d.id ?? i} className="p-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{d.title}</p>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${docStatusBadge(d.status)}`}>{d.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{d.fileName} · v{d.versionNumber}</p>
                </div>
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
        <button onClick={() => setRetry(r => r + 1)} className="flex items-center space-x-1 text-emerald-600 hover:underline">
          <RefreshCw className="w-3 h-3" /><span>Refresh</span>
        </button>
      </div>
    </PageContainer>
  );
};
