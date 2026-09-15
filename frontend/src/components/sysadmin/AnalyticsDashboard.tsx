import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, BellRing, Clock3, Database, Download, Loader2, Radio, RefreshCw, Server, Workflow } from 'lucide-react';
import { exportAnalyticsCsv, fetchAnalytics, type AnalyticsQuery } from '../../api/analyticsService';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import type { AnalyticsData, RuntimeHealthCheck } from '../../types';

type RangeKey = 'today' | 'last_7_days' | 'last_30_days' | 'this_month' | 'previous_month' | 'custom';

const PRESETS: Array<{ key: RangeKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'previous_month', label: 'Previous month' },
];

const STATUS_STYLE: Record<RuntimeHealthCheck['status'], string> = {
  LIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EMPTY: 'bg-amber-50 text-amber-700 border-amber-200',
  DISCONNECTED: 'bg-rose-50 text-rose-700 border-rose-200',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
}

const MetricCard: React.FC<{ label: string; value: React.ReactNode; detail: string; icon: React.ElementType; danger?: boolean }> = ({ label, value, detail, icon: Icon, danger }) => (
  <div className="card-stat p-5">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-semibold text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold ${danger ? 'text-rose-600' : 'text-slate-900'}`}>{value}</p></div>
      <span className="rounded-xl border border-slate-200 bg-slate-50 p-2"><Icon className="h-5 w-5 text-emerald-600" /></span>
    </div>
    <p className="mt-2 text-xs text-slate-500">{detail}</p>
  </div>
);

export const AnalyticsPage: React.FC = () => {
  const [range, setRange] = useState<RangeKey>('last_30_days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const revision = useRealtimeSyncStore((state) => state.revision);

  const query = useMemo<AnalyticsQuery>(() => range === 'custom'
    ? { preset: 'custom', from: customFrom || undefined, to: customTo || undefined }
    : { preset: range }, [range, customFrom, customTo]);

  const load = useCallback(async () => {
    if (range === 'custom' && (!customFrom || !customTo)) return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAnalytics(query));
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Unable to load operational analytics.');
    } finally {
      setLoading(false);
    }
  }, [query, range, customFrom, customTo, retry]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (revision > 0) void load(); }, [revision, load]);

  const download = async () => {
    setExporting(true);
    setError(null);
    try { await exportAnalyticsCsv(query); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || requestError?.message || 'Unable to export this report.'); }
    finally { setExporting(false); }
  };

  if (loading && !data) return <div className="glass-panel p-8 flex items-center gap-3 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" />Loading operational analytics…</div>;
  if (error && !data) return <div className="card-stat p-10 text-center"><AlertCircle className="mx-auto h-10 w-10 text-rose-500" /><h2 className="mt-3 font-bold text-slate-900">Analytics unavailable</h2><p className="mt-1 text-sm text-slate-500">{error}</p><button onClick={() => setRetry((value) => value + 1)} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white">Retry</button></div>;
  if (!data) return null;

  const operational = data.operational;
  const trend = operational?.failedEventsTrend;
  const trendText = !trend || trend.kind === 'N_A' ? 'N/A — both periods are empty'
    : trend.kind === 'NEW' ? 'New — comparison period was zero'
    : `${trend.percent != null && trend.percent > 0 ? '+' : ''}${trend.percent}% vs previous equal period`;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3"><span className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5"><Activity className="h-5 w-5 text-emerald-600" /></span><div><h1 className="text-2xl font-bold text-slate-900">System Operational Analytics</h1><p className="text-sm text-slate-500">Technical health only · Asia/Manila display · UTC persistence</p></div></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap rounded-xl bg-slate-100 p-1">{PRESETS.map((preset) => <button key={preset.key} onClick={() => setRange(preset.key)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${range === preset.key ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{preset.label}</button>)}<button onClick={() => setRange('custom')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${range === 'custom' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600'}`}>Custom</button></div>
            <button onClick={() => setRetry((value) => value + 1)} aria-label="Refresh analytics" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
            <button onClick={download} disabled={exporting || (range === 'custom' && (!customFrom || !customTo))} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Export CSV</button>
          </div>
        </div>
        {range === 'custom' && <div className="mt-4 flex flex-wrap items-center gap-2"><label className="text-xs font-semibold text-slate-600">From <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5" /></label><label className="text-xs font-semibold text-slate-600">To <input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)} className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5" /></label></div>}
        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Refresh failed: {error}. The values below are the last successful response.</div>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Failed operational events" value={operational?.failedEvents ?? 0} detail={trendText} icon={AlertCircle} danger={(operational?.failedEvents ?? 0) > 0} />
        <MetricCard label="Active sessions" value={operational?.activeSessions ?? 0} detail="Current authoritative session state" icon={Clock3} />
        <MetricCard label="Automation failures" value={operational?.automation.failedRuns ?? 0} detail={`${operational?.automation.successfulRuns ?? 0} successful in selected period`} icon={Workflow} danger={(operational?.automation.failedRuns ?? 0) > 0} />
        <MetricCard label="Notification delivery failures" value={operational?.notificationDeliveryFailures ?? 0} detail="Pending durable delivery failures" icon={BellRing} danger={(operational?.notificationDeliveryFailures ?? 0) > 0} />
      </div>

      <div className="card-stat overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold text-slate-900">Live dependency checks</h2><p className="text-xs text-slate-500">Statuses are produced by request-time probes, never fixed labels.</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${data.systemHealth?.overallStatus === 'LIVE' ? STATUS_STYLE.LIVE : data.systemHealth?.overallStatus === 'EMPTY' ? STATUS_STYLE.EMPTY : STATUS_STYLE.DISCONNECTED}`}>{data.systemHealth?.overallStatus ?? 'DISCONNECTED'}</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Dependency</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Latency</th><th className="px-5 py-3">Evidence</th></tr></thead><tbody className="divide-y divide-slate-100">{(data.systemHealth?.checks ?? []).map((check) => <tr key={check.name}><td className="px-5 py-4 font-semibold text-slate-900">{check.name}</td><td className="px-5 py-4"><span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${STATUS_STYLE[check.status]}`}>{check.status}</span></td><td className="px-5 py-4 font-mono text-xs text-slate-600">{check.latencyMs} ms</td><td className="px-5 py-4 text-xs text-slate-500">{check.detail}</td></tr>)}</tbody></table></div>
        {(data.systemHealth?.checks.length ?? 0) === 0 && <div className="p-8 text-center text-sm text-slate-500">No dependency checks were returned.</div>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Realtime change markers" value={operational?.realtimeMarkers ?? 0} detail="Sanitized markers in selected period" icon={Radio} />
        <MetricCard label="Last automation run" value={operational?.automation.lastRunAt ? formatDate(operational.automation.lastRunAt) : 'No runs'} detail="Authoritative lifecycle run history" icon={Server} />
        <MetricCard label="Analytics range" value={`${formatDate(data.period.from)} — ${formatDate(data.period.toExclusive)}`} detail="Inclusive start; exclusive end" icon={Database} />
      </div>
    </div>
  );
};

export default AnalyticsPage;
