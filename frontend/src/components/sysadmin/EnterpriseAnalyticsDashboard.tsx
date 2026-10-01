import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Archive, Building2, CalendarClock, ClipboardCheck, FileCheck2, FileText,
  FolderArchive, Gavel, KeyRound, Landmark, LockKeyhole, Scale, ShieldAlert, ShieldCheck,
  UserCheck, UserCog, UserRoundX, Users, UsersRound, Wrench,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { exportAnalyticsCsv, fetchAnalytics } from '../../api/analyticsService';
import { useAuthStore } from '../../stores/authStore';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import type {
  AnalyticsData, EnterpriseAnalytics, EnterpriseAnalyticsSection, EnterpriseLabeledValue,
  EnterpriseMetricGroup, EnterpriseTrendPoint,
} from '../../types';
import { downloadPdfReport } from '../../utils/pdfReport';
import { AnalyticsChartCard, AnalyticsMetricCard, AnalyticsPageHeader } from '../analytics/AnalyticsPrimitives';
import { enterpriseAnalyticsPdfReport } from '../analytics/analyticsPdfReports';
import { type AnalyticsRangeKey, buildAnalyticsQuery, formatManilaDate, validateAnalyticsRange } from '../analytics/analyticsUtils';
import { PortalLoadingOverlay } from '../ui/PortalLoadingOverlay';
import { EmptyState, ErrorState, LoadingState, ResponsiveTableContainer } from '../ui/SharedUI';

type TabKey = 'overview' | 'facilities' | 'visitors' | 'documents' | 'recordsCompliance' | 'legal' | 'contracts' | 'usersGovernance';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'facilities', label: 'Facilities' },
  { key: 'visitors', label: 'Visitors' },
  { key: 'documents', label: 'Documents' },
  { key: 'recordsCompliance', label: 'Records & Compliance' },
  { key: 'legal', label: 'Legal' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'usersGovernance', label: 'Users & Governance' },
];

type MetricDefinition = {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  format?: 'percent';
};

const metric = (group: EnterpriseMetricGroup | undefined, key: string): number | null | undefined => group?.[key];
const valueLabel = (value: number | null | undefined, format?: 'percent') => value == null ? 'Data unavailable' : format === 'percent' ? `${value}%` : value.toLocaleString('en-PH');
const humanize = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const distributionRows = (values?: Record<string, number>): EnterpriseLabeledValue[] => Object.entries(values ?? {}).map(([label, value]) => ({ label: humanize(label), value }));
const hasChartData = (rows: EnterpriseLabeledValue[] | EnterpriseTrendPoint[]) => rows.some((row) => row.value > 0);

const MetricGrid: React.FC<{ group: EnterpriseMetricGroup; definitions: MetricDefinition[]; semantics: 'Current State' | 'Selected Period' }> = ({ group, definitions, semantics }) => (
  <section aria-label={`${semantics} metrics`} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {definitions.map((definition) => (
      <AnalyticsMetricCard
        key={definition.key}
        label={definition.label}
        value={valueLabel(metric(group, definition.key), definition.format)}
        sub={semantics}
        icon={definition.icon}
        color={definition.color}
      />
    ))}
  </section>
);

const DistributionChart: React.FC<{ title: string; description: string; rows: EnterpriseLabeledValue[] }> = ({ title, description, rows }) => (
  <AnalyticsChartCard title={title} description={description}>
    {hasChartData(rows) ? (
      <div className="h-72 min-w-0" role="img" aria-label={`${title} chart`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 36 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" angle={-25} textAnchor="end" interval={0} height={70} tick={{ fontSize: 10 }} tickFormatter={(label) => String(label).slice(0, 18)} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="value" fill="#c82230" radius={[6, 6, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    ) : <EmptyState className="min-h-72" title="No recorded activity" description={description} />}
  </AnalyticsChartCard>
);

const TrendChart: React.FC<{ title: string; description: string; rows?: EnterpriseTrendPoint[] }> = ({ title, description, rows = [] }) => (
  <AnalyticsChartCard title={title} description={description}>
    {hasChartData(rows) ? (
      <div className="h-72 min-w-0" role="img" aria-label={`${title} chart`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: -18, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(date) => formatManilaDate(`${date}T00:00:00+08:00`)} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip labelFormatter={(date) => formatManilaDate(`${String(date)}T00:00:00+08:00`)} />
            <Line type="monotone" dataKey="value" stroke="#c82230" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    ) : <EmptyState className="min-h-72" title="No activity in this period" description={description} />}
  </AnalyticsChartCard>
);

const SectionHeading: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <header>
    <h2 className="font-heading text-xl font-bold text-slate-950">{title}</h2>
    <p className="mt-1 text-sm text-slate-500">{description}</p>
  </header>
);

const CurrentAndPeriodSection: React.FC<{
  section: EnterpriseAnalyticsSection;
  title: string;
  description: string;
  current: MetricDefinition[];
  period: MetricDefinition[];
  children: React.ReactNode;
}> = ({ section, title, description, current, period, children }) => (
  <div className="space-y-6">
    <SectionHeading title={title} description={description} />
    <MetricGrid group={section.currentState} definitions={current} semantics="Current State" />
    <MetricGrid group={section.selectedPeriod} definitions={period} semantics="Selected Period" />
    {children}
  </div>
);

function OverviewTab({ enterprise }: { enterprise: EnterpriseAnalytics }) {
  const overview = enterprise.overview;
  const current: MetricDefinition[] = [
    { key: 'activeUsers', label: 'Active Users', icon: UserCheck, color: 'text-emerald-600' },
    { key: 'openRequests', label: 'Open Requests', icon: ClipboardCheck, color: 'text-amber-600' },
    { key: 'facilities', label: 'Facilities', icon: Building2, color: 'text-blue-600' },
    { key: 'documents', label: 'Documents', icon: FileText, color: 'text-violet-600' },
    { key: 'activeContracts', label: 'Active Contracts', icon: FileCheck2, color: 'text-cyan-600' },
    { key: 'openLegalMatters', label: 'Open Legal Matters', icon: Scale, color: 'text-rose-600' },
    { key: 'openComplianceIssues', label: 'Compliance Issues', icon: ShieldAlert, color: 'text-orange-600' },
  ];
  const period: MetricDefinition[] = [
    { key: 'recordedActivity', label: 'Recorded Activity', icon: Activity, color: 'text-brand-600' },
    { key: 'auditEvents', label: 'Audit Events', icon: ShieldCheck, color: 'text-slate-700' },
    { key: 'visitors', label: 'Visitors Registered', icon: UsersRound, color: 'text-fuchsia-600' },
    { key: 'documentsUploaded', label: 'Documents Uploaded', icon: FileText, color: 'text-indigo-600' },
  ];
  const activity = overview.moduleActivity.map((row) => ({ label: row.module, value: row.count }));
  return <div className="space-y-6">
    <SectionHeading title="Enterprise Overview" description="Current organizational state and selected-period activity are reported separately." />
    <MetricGrid group={overview.currentState} definitions={current} semantics="Current State" />
    <MetricGrid group={overview.selectedPeriod} definitions={period} semantics="Selected Period" />
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <DistributionChart title="Enterprise Module Activity" description="Recorded activity from authoritative module events in the selected period." rows={activity} />
      <ResponsiveTableContainer>
        <table className="min-w-full text-sm">
          <caption className="px-5 py-4 text-left font-heading text-base font-bold text-slate-950">Activity measurement basis</caption>
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Module</th><th className="px-5 py-3">Recorded activity</th><th className="px-5 py-3">Authoritative basis</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{overview.moduleActivity.map((row) => <tr key={row.module}><th scope="row" className="px-5 py-3 text-left font-semibold text-slate-800">{row.module}</th><td className="px-5 py-3 font-mono text-slate-700">{row.count.toLocaleString('en-PH')}</td><td className="px-5 py-3 text-slate-500">{row.basis}</td></tr>)}</tbody>
        </table>
      </ResponsiveTableContainer>
    </div>
  </div>;
}

function AnalyticsTab({ tab, enterprise }: { tab: Exclude<TabKey, 'overview' | 'usersGovernance'>; enterprise: EnterpriseAnalytics }) {
  if (tab === 'facilities') {
    const section = enterprise.facilities;
    return <CurrentAndPeriodSection section={section} title="Facilities" description="Enterprise facilities capacity and selected-period reservation activity; operational actions remain in Facilities Management." current={[
      { key: 'totalFacilities', label: 'Total Facilities', icon: Building2, color: 'text-blue-600' }, { key: 'activeFacilities', label: 'Active Facilities', icon: Building2, color: 'text-emerald-600' },
      { key: 'totalRooms', label: 'Rooms & Spaces', icon: Landmark, color: 'text-indigo-600' }, { key: 'availableRooms', label: 'Available Rooms', icon: FileCheck2, color: 'text-cyan-600' },
      { key: 'availableCapacity', label: 'Available Capacity', icon: Users, color: 'text-violet-600' }, { key: 'activeMaintenance', label: 'Active Maintenance', icon: Wrench, color: 'text-amber-600' },
    ]} period={[
      { key: 'reservations', label: 'Reservations', icon: CalendarClock, color: 'text-brand-600' }, { key: 'approvedReservations', label: 'Approved Reservations', icon: ClipboardCheck, color: 'text-emerald-600' },
      { key: 'pendingReservations', label: 'Pending Reservations', icon: CalendarClock, color: 'text-amber-600' }, { key: 'maintenanceActivities', label: 'Maintenance Activity', icon: Wrench, color: 'text-slate-600' },
      { key: 'utilizationPercent', label: 'Facility Utilization', icon: Activity, color: 'text-rose-600', format: 'percent' },
    ]}><div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><TrendChart title="Reservation Trend" description="Reservations created during the selected period." rows={section.reservationTrend} /><DistributionChart title="Reservation Status Distribution" description="Reservation workflow status for records created in the selected period." rows={distributionRows(section.reservationStatusDistribution)} /></div></CurrentAndPeriodSection>;
  }
  if (tab === 'visitors') {
    const section = enterprise.visitors;
    return <CurrentAndPeriodSection section={section} title="Visitors" description="Current on-site state and visitor activity recorded during the selected period." current={[
      { key: 'currentlyCheckedIn', label: 'Currently Checked In', icon: UserCheck, color: 'text-emerald-600' },
    ]} period={[
      { key: 'registeredVisitors', label: 'Registered Visitors', icon: UsersRound, color: 'text-brand-600' }, { key: 'expectedVisitors', label: 'Expected Visitors', icon: CalendarClock, color: 'text-blue-600' },
      { key: 'checkedInVisitors', label: 'Checked-In Visitors', icon: UserCheck, color: 'text-emerald-600' }, { key: 'completedVisits', label: 'Completed Visits', icon: ClipboardCheck, color: 'text-cyan-600' },
      { key: 'cancelledOrRejected', label: 'Cancelled / Rejected', icon: UserRoundX, color: 'text-rose-600' },
    ]}><div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><TrendChart title="Visitor Trend" description="Visitor registrations recorded during the selected period." rows={section.visitorTrend} /><DistributionChart title="Visitor Status Distribution" description="Statuses for visitors registered during the selected period." rows={distributionRows(section.statusDistribution)} /></div></CurrentAndPeriodSection>;
  }
  if (tab === 'documents') {
    const section = enterprise.documents;
    return <CurrentAndPeriodSection section={section} title="Documents" description="Managed document state and stored upload/classification activity." current={[
      { key: 'totalDocuments', label: 'Total Documents', icon: FileText, color: 'text-blue-600' }, { key: 'archivedDocuments', label: 'Archived Documents', icon: Archive, color: 'text-slate-600' },
      { key: 'retentionDue', label: 'Retention Due', icon: CalendarClock, color: 'text-amber-600' }, { key: 'retentionOverdue', label: 'Retention Overdue', icon: ShieldAlert, color: 'text-rose-600' },
      { key: 'aiPendingReview', label: 'AI Results Pending Review', icon: ClipboardCheck, color: 'text-violet-600' },
    ]} period={[
      { key: 'uploadedDocuments', label: 'Documents Uploaded', icon: FileText, color: 'text-brand-600' }, { key: 'aiClassifications', label: 'Stored AI Classifications', icon: FileCheck2, color: 'text-indigo-600' },
    ]}><div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><TrendChart title="Document Upload Trend" description="Document records created during the selected period." rows={section.uploadTrend} /><DistributionChart title="Classification Distribution" description="Current managed documents by authoritative classification level." rows={distributionRows(section.classificationDistribution)} /></div></CurrentAndPeriodSection>;
  }
  if (tab === 'recordsCompliance') {
    const section = enterprise.recordsCompliance;
    return <CurrentAndPeriodSection section={section} title="Records & Compliance" description="Current records-governance exposure and selected-period compliance workload." current={[
      { key: 'totalManagedRecords', label: 'Managed Records', icon: FolderArchive, color: 'text-blue-600' }, { key: 'retentionDue', label: 'Retention Due', icon: CalendarClock, color: 'text-amber-600' },
      { key: 'retentionOverdue', label: 'Retention Overdue', icon: ShieldAlert, color: 'text-rose-600' }, { key: 'pendingDisposition', label: 'Pending Disposition', icon: Archive, color: 'text-orange-600' },
      { key: 'openComplianceIssues', label: 'Open Compliance Issues', icon: ShieldAlert, color: 'text-red-600' }, { key: 'activeLegalHolds', label: 'Active Legal Holds', icon: Gavel, color: 'text-violet-600' },
    ]} period={[
      { key: 'complianceItems', label: 'Compliance Items', icon: ShieldCheck, color: 'text-brand-600' }, { key: 'dispositionRequests', label: 'Disposition Requests', icon: ClipboardCheck, color: 'text-slate-600' },
    ]}><div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><TrendChart title="Compliance Activity Trend" description="Compliance alerts recorded during the selected period." rows={section.complianceTrend} /><DistributionChart title="Records by Retention Status" description="Current records grouped by retention status." rows={distributionRows(section.recordsByStatus)} /></div></CurrentAndPeriodSection>;
  }
  if (tab === 'legal') {
    const section = enterprise.legal;
    return <CurrentAndPeriodSection section={section} title="Legal" description="Enterprise legal-matter totals without exposing case narratives or operational controls." current={[
      { key: 'openLegalMatters', label: 'Open Legal Matters', icon: Scale, color: 'text-rose-600' }, { key: 'closedLegalMatters', label: 'Closed Matters', icon: FileCheck2, color: 'text-emerald-600' },
      { key: 'upcomingDeadlines', label: 'Upcoming Deadlines', icon: CalendarClock, color: 'text-amber-600' }, { key: 'overdueDeadlines', label: 'Overdue Deadlines', icon: ShieldAlert, color: 'text-red-600' },
    ]} period={[
      { key: 'newLegalMatters', label: 'New Legal Matters', icon: Gavel, color: 'text-brand-600' }, { key: 'closedMatters', label: 'Matters Closed', icon: FileCheck2, color: 'text-emerald-600' },
      { key: 'legalRequests', label: 'Legal Requests', icon: ClipboardCheck, color: 'text-violet-600' },
    ]}><div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><DistributionChart title="Cases by Status" description="Current legal matters grouped by status." rows={distributionRows(section.statusDistribution)} /><DistributionChart title="Cases by Category" description="Current legal matters grouped by authoritative case type." rows={distributionRows(section.categoryDistribution)} /></div></CurrentAndPeriodSection>;
  }
  const section = enterprise.contracts;
  return <CurrentAndPeriodSection section={section} title="Contracts" description="Enterprise contract lifecycle and stored AI analysis coverage; detailed contract handling remains role-scoped." current={[
    { key: 'activeContracts', label: 'Active Contracts', icon: FileCheck2, color: 'text-emerald-600' }, { key: 'expiringWithin90Days', label: 'Expiring Within 90 Days', icon: CalendarClock, color: 'text-amber-600' },
    { key: 'expiredContracts', label: 'Expired Contracts', icon: Archive, color: 'text-rose-600' }, { key: 'pendingReview', label: 'Pending Review', icon: ClipboardCheck, color: 'text-orange-600' },
    { key: 'renewalsDue', label: 'Renewals Due', icon: CalendarClock, color: 'text-violet-600' }, { key: 'aiPendingReview', label: 'AI Results Pending Review', icon: ShieldCheck, color: 'text-indigo-600' },
  ]} period={[
    { key: 'newContracts', label: 'New Contracts', icon: FileText, color: 'text-brand-600' }, { key: 'aiAnalyses', label: 'Stored AI Analyses', icon: FileCheck2, color: 'text-blue-600' },
  ]}><div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><DistributionChart title="Contracts by Status" description="Current contracts grouped by lifecycle status." rows={distributionRows(section.statusDistribution)} /><DistributionChart title="Contracts by Type" description="Current contracts grouped by authoritative type." rows={distributionRows(section.typeDistribution)} /></div></CurrentAndPeriodSection>;
}

function UsersGovernanceTab({ enterprise }: { enterprise: EnterpriseAnalytics }) {
  const section = enterprise.usersGovernance;
  return <CurrentAndPeriodSection section={section} title="Users & Governance" description="Super Administrator-specific user, RBAC, administrative-action, and organization-wide audit oversight." current={[
    { key: 'totalUsers', label: 'Total Users', icon: Users, color: 'text-blue-600' }, { key: 'activeUsers', label: 'Active Users', icon: UserCheck, color: 'text-emerald-600' },
    { key: 'inactiveUsers', label: 'Inactive Users', icon: UserRoundX, color: 'text-slate-600' }, { key: 'lockedAccounts', label: 'Locked Accounts', icon: LockKeyhole, color: 'text-rose-600' },
    { key: 'multiRoleUsers', label: 'Multi-Role Users', icon: UsersRound, color: 'text-violet-600' }, { key: 'roleAssignments', label: 'Role Assignments', icon: UserCog, color: 'text-cyan-600' },
    { key: 'privilegedRoleAssignments', label: 'Privileged Assignments', icon: KeyRound, color: 'text-amber-600' },
  ]} period={[
    { key: 'accountsCreated', label: 'Accounts Created', icon: UserCheck, color: 'text-brand-600' }, { key: 'auditEvents', label: 'Audit Events', icon: ShieldCheck, color: 'text-slate-700' },
    { key: 'administrativeActions', label: 'Administrative Actions', icon: UserCog, color: 'text-indigo-600' }, { key: 'rolePermissionChanges', label: 'Role / Permission Changes', icon: KeyRound, color: 'text-violet-600' },
    { key: 'passwordResetActivity', label: 'Password Reset Activity', icon: LockKeyhole, color: 'text-cyan-600' }, { key: 'sessionRevocations', label: 'Session Revocations', icon: ShieldAlert, color: 'text-orange-600' },
    { key: 'highRiskSecurityEvents', label: 'High-Risk Security Events', icon: ShieldAlert, color: 'text-rose-600' },
  ]}><div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><DistributionChart title="Users by Role" description="Current active role assignments by role." rows={section.usersByRole} /><TrendChart title="Audit Events Over Time" description="Authorized organization-wide audit events in the selected period." rows={section.auditTrend} /><DistributionChart title="Actions by Module" description="Authorized audit events grouped by module in the selected period." rows={section.auditByModule} /><DistributionChart title="Actions by Administrator" description="Top authorized audit actors in the selected period; raw audit rows are not returned." rows={section.actionsByAdministrator} /></div></CurrentAndPeriodSection>;
}

export const EnterpriseAnalyticsPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const revision = useRealtimeSyncStore((state) => state.revision);
  const [range, setRange] = useState<AnalyticsRangeKey>('last_30_days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const validationError = validateAnalyticsRange(range, customFrom, customTo);
  const query = useMemo(() => buildAnalyticsQuery(range, customFrom, customTo), [range, customFrom, customTo]);

  const load = useCallback(async () => {
    if (validationError) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try { setData(await fetchAnalytics(query)); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || requestError?.message || 'Unable to load enterprise analytics.'); }
    finally { setLoading(false); }
  }, [query, validationError]);

  useEffect(() => { void load(); }, [load, retry]);
  useEffect(() => { if (revision > 0) setRetry((value) => value + 1); }, [revision]);

  const exportCsv = async () => {
    if (validationError) return;
    setExportingCsv(true); setError(null);
    try { await exportAnalyticsCsv(query); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || requestError?.message || 'CSV export failed.'); }
    finally { setExportingCsv(false); }
  };

  const exportPdf = async () => {
    if (validationError || !data?.enterprise) return;
    setExportingPdf(true); setError(null);
    try { await downloadPdfReport(enterpriseAnalyticsPdfReport(data, user)); }
    catch (requestError) { console.error('Unable to generate the enterprise PDF report', requestError); setError('PDF report generation failed. Please try again.'); }
    finally { setExportingPdf(false); }
  };

  if (loading && !data) return <PortalLoadingOverlay message="Loading enterprise analytics..." />;
  if (error && !data) return <ErrorState title="Enterprise analytics unavailable" message={error} onRetry={() => setRetry((value) => value + 1)} />;
  if (!data?.enterprise) return <ErrorState title="Enterprise analytics unavailable" message="The authorized enterprise aggregate was not returned. No substitute or estimated data is shown." onRetry={() => setRetry((value) => value + 1)} />;

  const enterprise = data.enterprise;
  return <main className="analytics-report space-y-6">
    <AnalyticsPageHeader title="Enterprise Analytics & Governance" subtitle="Organization-wide analytics, administration, and governance oversight · Asia/Manila" range={range} customFrom={customFrom} customTo={customTo} validationError={validationError} loading={loading} exportingCsv={exportingCsv} exportingPdf={exportingPdf} onRangeChange={setRange} onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} onRefresh={() => setRetry((value) => value + 1)} onExportCsv={() => void exportCsv()} onExportPdf={() => void exportPdf()} />
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Refresh failed: {error}. Showing the last authorized response.</div>}
    {loading && <LoadingState className="min-h-16" label="Refreshing enterprise analytics..." />}
    <nav aria-label="Enterprise analytics sections" className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
      <div role="tablist" className="flex min-w-max gap-1">
        {TABS.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} aria-controls={`enterprise-panel-${tab.key}`} id={`enterprise-tab-${tab.key}`} onClick={() => setActiveTab(tab.key)} className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === tab.key ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}>{tab.label}</button>)}
      </div>
    </nav>
    <section role="tabpanel" id={`enterprise-panel-${activeTab}`} aria-labelledby={`enterprise-tab-${activeTab}`} tabIndex={0}>
      {activeTab === 'overview' ? <OverviewTab enterprise={enterprise} /> : activeTab === 'usersGovernance' ? <UsersGovernanceTab enterprise={enterprise} /> : <AnalyticsTab tab={activeTab} enterprise={enterprise} />}
    </section>
  </main>;
};

export default EnterpriseAnalyticsPage;
