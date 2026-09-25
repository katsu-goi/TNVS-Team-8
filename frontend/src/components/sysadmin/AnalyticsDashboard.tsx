import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BellRing, Clock3, Database, Radio, Server, Workflow } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { exportAnalyticsCsv, fetchAnalytics } from '../../api/analyticsService';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import type { AnalyticsData, RuntimeHealthCheck } from '../../types';
import { PortalLoadingOverlay } from '../ui/PortalLoadingOverlay';
import { EmptyState, ErrorState, LoadingState, ResponsiveTableContainer } from '../ui/SharedUI';
import {
  AnalyticsChartCard, AnalyticsMetricCard, AnalyticsPageHeader, AnalyticsPrintMeta,
} from '../analytics/AnalyticsPrimitives';
import { type AnalyticsRangeKey, buildAnalyticsQuery, formatManilaDate, formatManilaDateTime, formatManilaInclusiveEnd, printAnalyticsReport, validateAnalyticsRange } from '../analytics/analyticsUtils';

const STATUS_STYLE: Record<RuntimeHealthCheck['status'], string> = {
  LIVE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  EMPTY: 'border-amber-200 bg-amber-50 text-amber-700',
  DISCONNECTED: 'border-rose-200 bg-rose-50 text-rose-700',
};

export const AnalyticsPage: React.FC = () => {
  const [range, setRange] = useState<AnalyticsRangeKey>('last_30_days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const revision = useRealtimeSyncStore((state) => state.revision);
  const validationError = validateAnalyticsRange(range, customFrom, customTo);
  const query = useMemo(() => buildAnalyticsQuery(range, customFrom, customTo), [range, customFrom, customTo]);

  const load = useCallback(async () => {
    if (validationError) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try { setData(await fetchAnalytics(query)); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || requestError?.message || 'Unable to load operational analytics.'); }
    finally { setLoading(false); }
  }, [query, validationError]);

  useEffect(() => { void load(); }, [load, retry]);
  useEffect(() => { if (revision > 0) setRetry((value) => value + 1); }, [revision]);

  const exportCsv = async () => {
    if (validationError) return;
    setExportingCsv(true);
    setError(null);
    try { await exportAnalyticsCsv(query); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || requestError?.message || 'CSV export failed.'); }
    finally { setExportingCsv(false); }
  };

  if (loading && !data) return <PortalLoadingOverlay message="Loading operational analytics..." />;
  if (error && !data) return <ErrorState title="Analytics unavailable" message={error} onRetry={() => setRetry((value) => value + 1)} />;
  if (!data) return null;

  const operational = data.operational;
  const trend = operational?.failedEventsTrend;
  const failedTrendData = trend && trend.kind !== 'N_A' ? [
    { period: 'Previous', events: trend.previous },
    { period: 'Selected', events: trend.current },
  ] : [];
  const trendText = !trend || trend.kind === 'N_A' ? 'Previous-period comparison unavailable'
    : trend.kind === 'NEW' ? 'New activity vs an empty prior period'
    : trend.percent == null ? 'Previous-period comparison unavailable'
    : `${trend.percent > 0 ? '+' : ''}${trend.percent}% vs previous equal period`;
  const automationData = [
    { name: 'Successful', value: operational?.automation.successfulRuns ?? 0 },
    { name: 'Failed', value: operational?.automation.failedRuns ?? 0 },
  ];
  const deliveryData = [{ name: 'Delivery failures', value: operational?.notificationDeliveryFailures ?? 0 }];
  const checks = data.systemHealth?.checks ?? [];
  const dependencyLatency = checks.map((check) => ({ name: check.name, latency: check.latencyMs }));
  const overall = data.systemHealth?.overallStatus ?? 'DISCONNECTED';
  const hasAutomation = automationData.some((row) => row.value > 0);

  return (
    <main className="analytics-report space-y-6">
      <AnalyticsPageHeader title="System Operational Analytics" subtitle="Technical health only · authorized system scope · Asia/Manila" range={range} customFrom={customFrom} customTo={customTo} validationError={validationError} loading={loading} exportingCsv={exportingCsv} onRangeChange={setRange} onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} onRefresh={() => setRetry((value) => value + 1)} onExportCsv={() => void exportCsv()} onExportPdf={() => printAnalyticsReport('System Operational Analytics')} />
      <AnalyticsPrintMeta title="System Operational Analytics" role="System / Super Admin · Operational analytics" from={data.period.from} toExclusive={data.period.toExclusive} generatedAt={data.generatedAt} />
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Refresh failed: {error}. Showing the last successful response.</div>}
      {loading && <LoadingState className="min-h-16" label="Refreshing operational analytics..." />}

      <section aria-label="Operational KPI summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetricCard label="Failed operational events" value={operational?.failedEvents ?? 0} sub={trendText} icon={AlertCircle} color={(operational?.failedEvents ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'} />
        <AnalyticsMetricCard label="Active sessions" value={operational?.activeSessions ?? 0} sub="Current authoritative session state" icon={Clock3} color="text-blue-600" />
        <AnalyticsMetricCard label="Automation failures" value={operational?.automation.failedRuns ?? 0} sub={`${operational?.automation.successfulRuns ?? 0} successful in the selected period`} icon={Workflow} color={(operational?.automation.failedRuns ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'} />
        <AnalyticsMetricCard label="Notification failures" value={operational?.notificationDeliveryFailures ?? 0} sub="Durable delivery failures in the selected period" icon={BellRing} color={(operational?.notificationDeliveryFailures ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AnalyticsChartCard title="Failed Events Comparison" description="Selected period compared with the equivalent immediately preceding period." footer={trendText}>
          {failedTrendData.length ? <div className="h-72" role="img" aria-label="Line chart comparing failed operational events"><ResponsiveContainer width="100%" height="100%"><LineChart data={failedTrendData} margin={{ left: -20, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="period" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Line type="linear" dataKey="events" name="Failed events" stroke="#e11d48" strokeWidth={2.5} /></LineChart></ResponsiveContainer></div> : <EmptyState title="No comparison data" description="Both the selected and previous periods are empty." />}
        </AnalyticsChartCard>
        <AnalyticsChartCard title="Active Sessions Trend" description="Historical session samples are not returned by the authorized analytics endpoint.">
          <EmptyState title="Trend unavailable" description={`Current authoritative active sessions: ${operational?.activeSessions ?? 0}. This current value is not presented as historical data.`} />
        </AnalyticsChartCard>
        <AnalyticsChartCard title="Automation Performance" description="Lifecycle automation outcomes in the selected period.">
          {hasAutomation ? <div className="h-72" role="img" aria-label="Bar chart of successful and failed automation runs"><ResponsiveContainer width="100%" height="100%"><BarChart data={automationData} margin={{ left: -20, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="value" name="Runs" fill="#059669" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState title="No automation runs" description="No lifecycle automation outcomes were recorded for this period." />}
        </AnalyticsChartCard>
        <AnalyticsChartCard title="Notification Delivery" description="Durable notification delivery failures in the selected period.">
          {(operational?.notificationDeliveryFailures ?? 0) > 0 ? <div className="h-72" role="img" aria-label="Bar chart of notification delivery failures"><ResponsiveContainer width="100%" height="100%"><BarChart data={deliveryData} margin={{ left: -20, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="value" name="Failures" fill="#d97706" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState title="No delivery failures" description="No durable notification delivery failures were recorded for this period." />}
        </AnalyticsChartCard>
      </section>

      <AnalyticsChartCard title="Current Dependency Latency" description="Request-time probes at report refresh; these values are current state, not a historical range trend." footer={`Checked ${data.systemHealth?.checkedAt ? formatManilaDateTime(data.systemHealth.checkedAt) : 'not available'}`}>
        {dependencyLatency.length ? <div className="h-72" role="img" aria-label="Bar chart of current dependency latency"><ResponsiveContainer width="100%" height="100%"><BarChart data={dependencyLatency} margin={{ left: -10, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis unit=" ms" tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="latency" name="Latency (ms)" fill="#2563eb" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState title="No dependency probes" description="The current response did not include dependency health checks." />}
      </AnalyticsChartCard>

      <section className="card-stat overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-heading font-bold text-slate-950">Live Dependency Checks</h2><p className="mt-1 text-xs text-slate-500">Request-time status and evidence; no fixed labels.</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLE[overall]}`}>{overall}</span></header>
        {checks.length ? <ResponsiveTableContainer className="rounded-none border-0"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Dependency</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Latency</th><th className="px-5 py-3">Evidence</th></tr></thead><tbody className="divide-y divide-slate-100">{checks.map((check) => <tr key={check.name}><td className="px-5 py-4 font-semibold text-slate-900">{check.name}</td><td className="px-5 py-4"><span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${STATUS_STYLE[check.status]}`}>{check.status}</span></td><td className="px-5 py-4 font-mono text-xs">{check.latencyMs} ms</td><td className="px-5 py-4 text-xs text-slate-500">{check.detail}</td></tr>)}</tbody></table></ResponsiveTableContainer> : <EmptyState className="m-5" title="No dependency checks" description="No request-time dependency checks were returned." />}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <AnalyticsMetricCard label="Realtime change markers" value={operational?.realtimeMarkers ?? 0} sub="Sanitized markers in the selected period" icon={Radio} color="text-violet-600" />
        <AnalyticsMetricCard label="Last automation run" value={operational?.automation.lastRunAt ? formatManilaDateTime(operational.automation.lastRunAt) : 'No runs'} sub="Authoritative lifecycle run history" icon={Server} color="text-emerald-600" />
        <AnalyticsMetricCard label="Analytics range" value={`${formatManilaDate(data.period.from)} – ${formatManilaInclusiveEnd(data.period.toExclusive)}`} sub="Selected Manila calendar dates" icon={Database} color="text-slate-500" />
      </section>

      <section className="card-stat p-5"><h2 className="font-heading font-bold text-slate-950">Operational Data Summary</h2><p className="mt-1 text-xs text-slate-500">Exact authorized totals returned for this range.</p><dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4"><div><dt className="text-slate-500">Blocked IPs</dt><dd className="font-bold">{operational?.blockedIps ?? 0}</dd></div><div><dt className="text-slate-500">Active security alerts</dt><dd className="font-bold">{operational?.activeSecurityAlerts ?? 0}</dd></div><div><dt className="text-slate-500">Unread notifications</dt><dd className="font-bold">{operational?.unreadNotifications ?? 0}</dd></div><div><dt className="text-slate-500">Generated</dt><dd className="font-bold">{formatManilaDateTime(data.generatedAt)}</dd></div></dl></section>
    </main>
  );
};

export default AnalyticsPage;
