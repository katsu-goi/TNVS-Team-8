import type { AnalyticsData, AnalyticsTrend, RuntimeHealthCheck, User } from '../../types';
import type { PdfReportDefinition } from '../../utils/pdfReport';
import { enterpriseMetrics } from './EnterpriseOverview';
import { formatManilaDate, formatManilaDateTime, formatManilaInclusiveEnd } from './analyticsUtils';

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

function actorName(user: User | null): string {
  return user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Authenticated user';
}

function periodFilePart(data: AnalyticsData): string {
  const from = data.period.from.slice(0, 10);
  const inclusiveEnd = new Date(new Date(data.period.toExclusive).getTime() - 1).toISOString().slice(0, 10);
  return `${from}-to-${inclusiveEnd}`;
}

function periodLabel(data: AnalyticsData): string {
  return `${formatManilaDate(data.period.from)} - ${formatManilaInclusiveEnd(data.period.toExclusive)}`;
}

function trendDetail(trend?: AnalyticsTrend): string {
  if (!trend || trend.kind === 'N_A') return 'Previous-period comparison unavailable';
  if (trend.kind === 'NEW') return 'New activity compared with an empty prior period';
  if (trend.percent == null) return 'Previous-period comparison unavailable';
  return `${trend.percent > 0 ? '+' : ''}${trend.percent}% versus previous equal period`;
}

export function facilitiesAnalyticsPdfReport(
  title: string,
  data: AnalyticsData,
  user: User | null,
): PdfReportDefinition {
  const metrics = (data.facilities ?? {}) as FacilitiesMetrics;
  const submitted = number(metrics.submitted);
  const approved = number(metrics.managerApproved);
  const rejected = number(metrics.rejected);
  const cancelled = number(metrics.cancelled);
  const completed = number(metrics.completed);
  const decisions = approved + rejected;
  const facilities = Array.isArray(metrics.frequentlyUsedFacilities) ? metrics.frequentlyUsedFacilities : [];
  const daily = Array.isArray(metrics.dailySubmitted) ? metrics.dailySubmitted : [];
  const statusData = [
    { label: 'Approved', value: approved },
    { label: 'Rejected', value: rejected },
    { label: 'Cancelled', value: cancelled },
    { label: 'Completed', value: completed },
  ];
  const isReportsPage = title.toLowerCase().includes('report');

  return {
    fileName: `hirna-${isReportsPage ? 'facility-reports' : 'facilities-analytics'}-${periodFilePart(data)}.pdf`,
    title,
    reportType: 'Facility Performance Analytics Report',
    generatedAt: data.generatedAt,
    generatedBy: actorName(user),
    generatedByRole: 'Facilities Manager',
    periodLabel: periodLabel(data),
    scopeLabel: 'Authorized facilities analytics scope',
    classification: 'INTERNAL',
    summary: [
      { label: 'Total reservations', value: submitted, detail: trendDetail(metrics.submittedTrend) },
      { label: 'Approved', value: approved, detail: `${decisions} manager decisions` },
      { label: 'Rejected', value: rejected },
      { label: 'Cancelled', value: cancelled },
      { label: 'Completed', value: completed },
      { label: 'Approval rate', value: decisions ? `${Math.round((approved * 1000) / decisions) / 10}%` : 'N/A' },
      { label: 'Utilization rate', value: metrics.utilizationPercent == null ? 'N/A' : `${metrics.utilizationPercent}%` },
      { label: 'Occupied minutes', value: number(metrics.occupiedMinutes), detail: `${number(metrics.availableOperatingMinutes)} available minutes` },
    ],
    charts: [
      {
        title: 'Reservation Trend',
        description: 'Daily reservation requests during the selected period.',
        kind: 'line',
        data: daily.map((row) => ({ label: formatManilaDate(`${row.date}T00:00:00+08:00`), value: number(row.value) })),
        color: [202, 34, 48],
      },
      {
        title: 'Reservation Status',
        description: 'Manager decisions and completed workflow outcomes.',
        kind: 'bar',
        data: statusData,
        color: [168, 18, 29],
      },
      {
        title: 'Facility Utilization',
        description: 'Authorized reservation volume by facility.',
        kind: 'bar',
        data: facilities.map((row) => ({ label: row.facility, value: number(row.reservations) })),
        color: [226, 75, 91],
      },
      {
        title: 'Maintenance Indicators',
        description: 'Maintenance restrictions, related rejections, and conflicts.',
        kind: 'bar',
        data: [
          { label: 'Restrictions', value: number(metrics.maintenanceRestrictions) },
          { label: 'Related rejections', value: number(metrics.maintenanceRelatedRejections) },
          { label: 'Conflicts', value: number(metrics.conflicts) },
        ],
        color: [148, 20, 31],
      },
    ],
    tables: [{
      title: 'Detailed Facility Records',
      description: 'Exact facility totals returned by the authorized analytics endpoint.',
      columns: [
        { label: 'Facility', weight: 2.2 },
        { label: 'Reservations', align: 'right' },
        { label: 'Occupied Minutes', align: 'right' },
        { label: 'Share', align: 'right' },
      ],
      rows: facilities.map((row) => [
        row.facility,
        number(row.reservations),
        number(row.occupiedMinutes),
        submitted ? `${Math.round((number(row.reservations) * 1000) / submitted) / 10}%` : 'N/A',
      ]),
    }],
    notes: [
      'This report contains only data returned for the authenticated Facilities Manager scope.',
      'All dates and times are presented in Asia/Manila.',
      'Hourly peak usage is omitted because the authorized endpoint does not provide hourly history.',
    ],
  };
}

export function systemAnalyticsPdfReport(data: AnalyticsData, user: User | null): PdfReportDefinition {
  if (data.scope === 'SUPER_ADMIN') {
    if (!data.enterprise?.overview) throw new Error('Enterprise analytics are missing');
    const metrics = enterpriseMetrics(data.enterprise.overview);
    return {
      fileName: `enterprise-analytics-${periodFilePart(data)}.pdf`,
      title: 'Enterprise Analytics',
      reportType: 'ENTERPRISE_ANALYTICS_GOVERNANCE',
      generatedAt: data.generatedAt,
      generatedBy: actorName(user),
      generatedByRole: data.scope,
      periodLabel: periodLabel(data),
      summary: metrics.current.map((metric) => ({ ...metric, detail: 'Current state' })),
      tables: [{
        title: 'Selected Period (Asia/Manila)',
        columns: [{ label: 'Metric' }, { label: 'Value', align: 'right' }],
        rows: metrics.period.map((metric) => [metric.label, metric.value]),
      }],
    };
  }
  const operational = data.operational;
  const checks: RuntimeHealthCheck[] = data.systemHealth?.checks ?? [];
  const trend = operational?.failedEventsTrend;
  const trendData = trend && trend.kind !== 'N_A' ? [
    { label: 'Previous', value: number(trend.previous) },
    { label: 'Selected', value: number(trend.current) },
  ] : [];

  return {
    fileName: `hirna-system-operational-analytics-${periodFilePart(data)}.pdf`,
    title: 'System Operational Analytics',
    reportType: 'System Operational Analytics Report',
    generatedAt: data.generatedAt,
    generatedBy: actorName(user),
    generatedByRole: user?.assignedRoles?.includes('SUPER_ADMIN') || user?.roles?.includes('SUPER_ADMIN') ? 'Super Administrator' : 'System Administrator',
    periodLabel: periodLabel(data),
    scopeLabel: 'Authorized technical and system-health scope',
    classification: 'RESTRICTED',
    summary: [
      { label: 'Failed operational events', value: operational?.failedEvents ?? 0, detail: trendDetail(trend) },
      { label: 'Active sessions', value: operational?.activeSessions ?? 0, detail: 'Current authoritative session state' },
      { label: 'Successful automation', value: operational?.automation.successfulRuns ?? 0 },
      { label: 'Automation failures', value: operational?.automation.failedRuns ?? 0 },
      { label: 'Notification failures', value: operational?.notificationDeliveryFailures ?? 0 },
      { label: 'Blocked IPs', value: operational?.blockedIps ?? 0 },
      { label: 'Active security alerts', value: operational?.activeSecurityAlerts ?? 0 },
      { label: 'Unread notifications', value: operational?.unreadNotifications ?? 0 },
    ],
    charts: [
      { title: 'Failed Events Comparison', description: 'Selected period compared with the equivalent preceding period.', kind: 'line', data: trendData, color: [202, 34, 48] },
      {
        title: 'Automation Performance',
        description: 'Lifecycle automation outcomes in the selected period.',
        kind: 'bar',
        data: [
          { label: 'Successful', value: operational?.automation.successfulRuns ?? 0 },
          { label: 'Failed', value: operational?.automation.failedRuns ?? 0 },
        ],
        color: [168, 18, 29],
      },
      {
        title: 'Current Dependency Latency',
        description: 'Request-time dependency probes at report generation.',
        kind: 'bar',
        data: checks.map((check) => ({ label: check.name, value: number(check.latencyMs) })),
        valueSuffix: ' ms',
        color: [226, 75, 91],
      },
    ],
    tables: [{
      title: 'Live Dependency Checks',
      description: `Overall status: ${data.systemHealth?.overallStatus ?? 'DISCONNECTED'} | Checked ${data.systemHealth?.checkedAt ? formatManilaDateTime(data.systemHealth.checkedAt) : 'not available'}`,
      columns: [
        { label: 'Dependency', weight: 1.6 },
        { label: 'Status' },
        { label: 'Latency', align: 'right' },
        { label: 'Evidence', weight: 2.6 },
      ],
      rows: checks.map((check) => [check.name, check.status, `${check.latencyMs} ms`, check.detail]),
    }],
    notes: [
      'This report contains technical operational data only and excludes general employee or business activity.',
      'Dependency latency is a request-time snapshot, not a historical time series.',
      'All dates and times are presented in Asia/Manila.',
    ],
  };
}
