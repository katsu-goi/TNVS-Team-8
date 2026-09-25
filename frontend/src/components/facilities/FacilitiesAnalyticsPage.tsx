import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarCheck, Clock3, Gauge, Wrench } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { exportAnalyticsCsv, fetchAnalytics } from '../../api/analyticsService';
import { useAuthStore } from '../../stores/authStore';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import type { AnalyticsData, AnalyticsTrend } from '../../types';
import { downloadPdfReport } from '../../utils/pdfReport';
import { PortalLoadingOverlay } from '../ui/PortalLoadingOverlay';
import { EmptyState, ErrorState, LoadingState, ResponsiveTableContainer } from '../ui/SharedUI';
import {
  AnalyticsChartCard, AnalyticsMetricCard, AnalyticsPageHeader,
} from '../analytics/AnalyticsPrimitives';
import { facilitiesAnalyticsPdfReport } from '../analytics/analyticsPdfReports';
import { type AnalyticsRangeKey, buildAnalyticsQuery, formatManilaDate, formatManilaInclusiveEnd, validateAnalyticsRange } from '../analytics/analyticsUtils';

type DailyValue = { date: string; value: number };
type FacilityUsage = { facility: string; reservations: number; occupiedMinutes: number };
type FacilitiesMetrics = {
  submitted?: number;
  submittedTrend?: AnalyticsTrend;
  officerReviewed?: number;
  managerApproved?: number;
  rejected?: number;
  cancelled?: number;
  completed?: number;
  conflicts?: number;
  maintenanceRelatedRejections?: number;
  occupiedMinutes?: number;
  availableOperatingMinutes?: number;
  utilizationPercent?: number | null;
  maintenanceRestrictions?: number;
  dailySubmitted?: DailyValue[];
  frequentlyUsedFacilities?: FacilityUsage[];
};

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;

function trendText(trend?: AnalyticsTrend): string {
  if (!trend || trend.kind === 'N_A') return 'Previous-period comparison unavailable';
  if (trend.kind === 'NEW') return 'New activity vs an empty prior period';
  if (trend.percent == null) return 'Previous-period comparison unavailable';
  return `${trend.percent > 0 ? '+' : ''}${trend.percent}% vs previous equal period`;
}

type Props = { title: string; subtitle: string };

export const FacilitiesAnalyticsPage: React.FC<Props> = ({ title, subtitle }) => {
  const user = useAuthStore((state) => state.user);
  const [range, setRange] = useState<AnalyticsRangeKey>('last_30_days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
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
    catch (requestError: any) { setError(requestError?.response?.data?.message || requestError?.message || 'Unable to load facility analytics.'); }
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

  const exportPdf = async () => {
    if (validationError || !data) return;
    setExportingPdf(true);
    setError(null);
    try { await downloadPdfReport(facilitiesAnalyticsPdfReport(title, data, user)); }
    catch (requestError) {
      console.error('Unable to generate the facilities PDF report', requestError);
      setError('PDF report generation failed. Please try again.');
    } finally { setExportingPdf(false); }
  };

  if (loading && !data) return <PortalLoadingOverlay message="Loading facility analytics..." />;
  if (error && !data) return <ErrorState title="Unable to load analytics" message={error} onRetry={() => setRetry((value) => value + 1)} />;
  if (!data) return null;

  const metrics = (data.facilities ?? {}) as FacilitiesMetrics;
  const daily = Array.isArray(metrics.dailySubmitted) ? metrics.dailySubmitted.map((row) => ({ ...row, label: formatManilaDate(`${row.date}T00:00:00+08:00`) })) : [];
  const facilities = Array.isArray(metrics.frequentlyUsedFacilities) ? metrics.frequentlyUsedFacilities : [];
  const statusData = [
    { name: 'Approved', value: number(metrics.managerApproved) },
    { name: 'Rejected', value: number(metrics.rejected) },
    { name: 'Cancelled', value: number(metrics.cancelled) },
    { name: 'Completed', value: number(metrics.completed) },
  ];
  const maintenanceData = [
    { name: 'Restrictions', value: number(metrics.maintenanceRestrictions) },
    { name: 'Related rejections', value: number(metrics.maintenanceRelatedRejections) },
    { name: 'Conflicts', value: number(metrics.conflicts) },
  ];
  const decisions = number(metrics.managerApproved) + number(metrics.rejected);
  const approvalRate = decisions > 0 ? `${Math.round(number(metrics.managerApproved) * 1000 / decisions) / 10}%` : 'N/A';
  const hasTrend = daily.some((row) => number(row.value) > 0);
  const hasStatuses = statusData.some((row) => row.value > 0);
  const hasMaintenance = maintenanceData.some((row) => row.value > 0);
  const highestFacility = facilities[0];

  return (
    <main className="analytics-report space-y-6">
      <AnalyticsPageHeader title={title} subtitle={`${subtitle} · authorized facilities scope · Asia/Manila`} range={range} customFrom={customFrom} customTo={customTo} validationError={validationError} loading={loading} exportingCsv={exportingCsv} exportingPdf={exportingPdf} onRangeChange={setRange} onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} onRefresh={() => setRetry((value) => value + 1)} onExportCsv={() => void exportCsv()} onExportPdf={() => void exportPdf()} />
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Refresh failed: {error}. Showing the last successful response.</div>}
      {loading && <LoadingState className="min-h-16" label="Refreshing analytics..." />}

      <section aria-label="Facility KPI summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetricCard label="Total reservations" value={number(metrics.submitted)} sub={trendText(metrics.submittedTrend)} icon={CalendarCheck} color="text-emerald-600" />
        <AnalyticsMetricCard label="Approval rate" value={approvalRate} sub={decisions ? `${decisions} manager decisions` : 'No decisions in this period'} icon={BarChart3} color="text-blue-600" />
        <AnalyticsMetricCard label="Room utilization" value={metrics.utilizationPercent == null ? 'N/A' : `${metrics.utilizationPercent}%`} sub={`${number(metrics.occupiedMinutes)} of ${number(metrics.availableOperatingMinutes)} operating minutes`} icon={Gauge} color="text-violet-600" />
        <AnalyticsMetricCard label="Peak usage" value="N/A" sub="Hourly usage is not available from the authorized endpoint" icon={Clock3} color="text-slate-500" />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AnalyticsChartCard title="Reservation Trend" description="Daily reservation requests during the selected period." footer={`Total submitted: ${number(metrics.submitted)}`}>
          {hasTrend ? <div className="h-72" role="img" aria-label="Line chart of daily reservation requests"><ResponsiveContainer width="100%" height="100%"><LineChart data={daily} margin={{ left: -20, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={24} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Line type="monotone" dataKey="value" name="Reservations" stroke="#059669" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div> : <EmptyState title="No reservation trend" description="No reservation requests were recorded for the selected period." />}
        </AnalyticsChartCard>
        <AnalyticsChartCard title="Reservation Status" description="Manager decisions and completed workflow outcomes.">
          {hasStatuses ? <div className="h-72" role="img" aria-label="Bar chart of reservation status outcomes"><ResponsiveContainer width="100%" height="100%"><BarChart data={statusData} margin={{ left: -20, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="value" name="Reservations" fill="#2563eb" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState title="No status outcomes" description="No reservation status outcomes are available for this period." />}
        </AnalyticsChartCard>
        <AnalyticsChartCard title="Facility Utilization" description="Authorized bookings and occupied minutes by facility." footer={highestFacility ? `${highestFacility.facility} has the most reservations in this period.` : undefined}>
          {facilities.length ? <div className="h-72" role="img" aria-label="Bar chart of reservations by facility"><ResponsiveContainer width="100%" height="100%"><BarChart data={facilities.slice(0, 10)} layout="vertical" margin={{ left: 20, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="facility" width={90} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="reservations" name="Reservations" fill="#7c3aed" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState title="No facility utilization data" description="No authorized facility usage rows are available for this period." />}
        </AnalyticsChartCard>
        <AnalyticsChartCard title="Maintenance Activity" description="Scheduling restrictions, maintenance-related rejections, and conflicts.">
          {hasMaintenance ? <div className="h-72" role="img" aria-label="Bar chart of maintenance and scheduling activity"><ResponsiveContainer width="100%" height="100%"><BarChart data={maintenanceData} margin={{ left: -20, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="value" name="Events" fill="#d97706" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState title="No maintenance activity" description="No restrictions, related rejections, or conflicts were recorded for this period." />}
        </AnalyticsChartCard>
      </section>

      <section className="card-stat overflow-hidden">
        <header className="border-b border-slate-100 p-5"><h2 className="font-heading font-bold text-slate-950">Detailed Facility Data</h2><p className="mt-1 text-xs text-slate-500">Exact authorized totals behind the facility ranking chart.</p></header>
        {facilities.length ? <ResponsiveTableContainer className="rounded-none border-0"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Facility</th><th className="px-5 py-3">Reservations</th><th className="px-5 py-3">Occupied minutes</th><th className="px-5 py-3">Share of submitted</th></tr></thead><tbody className="divide-y divide-slate-100">{facilities.map((row) => <tr key={row.facility}><td className="px-5 py-4 font-semibold text-slate-900">{row.facility}</td><td className="px-5 py-4">{row.reservations}</td><td className="px-5 py-4">{row.occupiedMinutes}</td><td className="px-5 py-4">{number(metrics.submitted) ? `${Math.round(row.reservations * 1000 / number(metrics.submitted)) / 10}%` : 'N/A'}</td></tr>)}</tbody></table></ResponsiveTableContainer> : <EmptyState className="m-5" title="No detailed rows" description="No facility usage rows are available for the selected period." />}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AnalyticsMetricCard label="Maintenance restrictions" value={number(metrics.maintenanceRestrictions)} sub="Overlapping the selected period" icon={Wrench} color="text-amber-600" />
        <AnalyticsMetricCard label="Available capacity" value={number(metrics.availableOperatingMinutes)} sub="Configured active-room operating minutes" icon={Gauge} color="text-emerald-600" />
        <AnalyticsMetricCard label="Generated range" value={`${formatManilaDate(data.period.from)} – ${formatManilaInclusiveEnd(data.period.toExclusive)}`} sub="Selected Manila calendar dates" icon={Clock3} color="text-slate-500" />
      </section>
    </main>
  );
};

export default FacilitiesAnalyticsPage;
