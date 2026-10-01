import type { AnalyticsData } from '../../types';

export type EnterpriseOverviewData = NonNullable<AnalyticsData['enterprise']>['overview'];

export function enterpriseMetrics(overview: EnterpriseOverviewData) {
  return {
    current: [
      { label: 'Active Accounts', value: overview.currentState.activeUsers },
      { label: 'Facilities', value: overview.currentState.facilities },
      { label: 'Documents', value: overview.currentState.documents },
      { label: 'Active Contracts', value: overview.currentState.activeContracts },
      { label: 'Open Requests', value: overview.currentState.openRequests },
      { label: 'Open Legal Matters', value: overview.currentState.openLegalMatters },
      { label: 'Open Compliance Issues', value: overview.currentState.openComplianceIssues },
    ],
    period: [
      { label: 'Recorded Activity', value: overview.selectedPeriod.recordedActivity },
      { label: 'Audit Events', value: overview.selectedPeriod.auditEvents },
      { label: 'Registered Visitors', value: overview.selectedPeriod.visitors },
      { label: 'Documents Uploaded', value: overview.selectedPeriod.documentsUploaded },
    ],
  };
}

export function EnterpriseOverview({ overview, periodLabel }: { overview: EnterpriseOverviewData; periodLabel: string }) {
  const metrics = enterpriseMetrics(overview);
  return <section className="card-stat p-5 space-y-4">
    <h2 className="text-lg font-bold text-slate-900">Enterprise Analytics</h2>
    {[{ label: 'Current State', values: metrics.current }, { label: periodLabel, values: metrics.period }].map(({ label, values }) => (
      <div key={label}>
        <h3 className="text-sm font-semibold mb-3">{label}</h3>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {values.map((metric) => <div key={metric.label}>
            <dt className="text-xs text-slate-500">{metric.label}</dt><dd className="text-xl font-bold">{metric.value}</dd>
          </div>)}
        </dl>
      </div>
    ))}
  </section>;
}
