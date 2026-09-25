import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, Loader2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import { governanceService, WorkspacePayload } from '../../api/governanceService';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { OversightPanel } from '../oversight';
import { RecordsDisposalConsole } from '../records/RecordsDisposalConsole';
import { ComplianceOfficerDashboard } from '../compliance/ComplianceOfficerDashboard';
import {
  CoComplianceAlertsPage, CoContractsPage, CoDisposalApprovalsPage,
  CoDocumentsPage, CoRetentionPoliciesPage, CoAuditLogsPage,
} from '../compliance/ComplianceOfficerPages';
import { ReasonDialog } from '../ui/SharedUI';
import { PortalLoadingOverlay } from '../ui/PortalLoadingOverlay';
import { DashboardHero } from '../ui/DashboardPrimitives';
import { DataTable, DataTableMobileCard, DataTableStatusBadge, type DataTableColumn } from '../ui/data-table';
import type { WorkspaceConfig } from './workspaceConfig';

const toneClass = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
};

const prettify = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const workspaceDate = (value: unknown) => {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
};

function rowTitle(row: Record<string, any>): string {
  return row.item_title || row.request_title || row.title || row.contract?.title || row.document?.title ||
    row.incident_reference || row.request_reference || row.signoff_reference || row.approval_reference ||
    row.setting_key || row.external_reference || row.permit_type || row.code || 'Workspace Record';
}

function rowStatus(row: Record<string, any>): string | null {
  return row.state || row.status || row.archive_status || row.review_status || row.risk_level || null;
}

function rowDetails(row: Record<string, any>): Array<[string, string]> {
  const values: Array<[string, unknown]> = [
    ['Reference', row.request_reference || row.signoff_reference || row.approval_reference || row.incident_reference || row.contract?.contract_number || row.permit_number],
    ['Type', row.item_type || row.request_type || row.violation_category || row.contract?.type || row.data_category || row.permit_type],
    ['Owner', row.submittedByName || row.requester_name || row.owner_email || row.submitted_by],
    ['Hub / Department', row.hub_name || row.facility_name || row.department_name || row.contract?.counter_party],
    ['Due / Expiry', row.due_at || row.notification_due_at || row.statutory_deadline || row.expiration_date || row.retention_expires_at],
    ['Comments', row.counsel_comments || row.manager_comments || row.decision_comments || row.remediation_directives || row.description],
  ];
  if (row.raw_pii_json) values.push(['Protected Data', JSON.stringify(row.raw_pii_json)]);
  if (row.setting_value) values.push(['Configuration', JSON.stringify(row.setting_value)]);
  return values
    .filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== undefined && entry[1] !== '')
    .map(([label, value]) => [label, String(value)]);
}

export const RoleWorkspacePage: React.FC<{ config: WorkspaceConfig; section: string }> = ({ config, section }) => {
  if (config.slug === 'records' && section === 'disposal') return <RecordsDisposalConsole />;
  if (config.slug === 'compliance') {
    if (section === 'dashboard') return <ComplianceOfficerDashboard />;
    if (section === 'documents') return <CoDocumentsPage />;
    if (section === 'contracts') return <CoContractsPage />;
    if (section === 'retention') return <CoRetentionPoliciesPage />;
    if (section === 'alerts') return <CoComplianceAlertsPage />;
    if (section === 'disposal') return <CoDisposalApprovalsPage />;
    if (section === 'audit') return <CoAuditLogsPage />;
  }
  return <GenericRoleWorkspacePage config={config} section={section} />;
};

const GenericRoleWorkspacePage: React.FC<{ config: WorkspaceConfig; section: string }> = ({ config, section }) => {
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [revealed, setRevealed] = useState<Record<string, Record<string, any>>>({});
  const [reasonBusy, setReasonBusy] = useState(false);
  const [reasonAction, setReasonAction] = useState<null | {
    title: string;
    description?: string;
    label?: string;
    confirmLabel: string;
    tone?: 'primary' | 'danger' | 'success';
    submit: (reason: string) => Promise<boolean>;
  }>(null);
  const revision = useRealtimeSyncStore((state) => state.revision);
  const item = useMemo(() => config.nav.find((navItem) => navItem.section === section) || config.nav[0], [config, section]);

  const load = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      setPayload(await governanceService.getWorkspace(config.slug, section));
    } catch (reason) {
      console.error('Unable to load governance workspace records', reason);
      setError('Unable to load workspace records. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [config.slug, section]);

  useEffect(() => { load(); }, [load, revision]);

  const perform = async (id: string, action: () => Promise<void>): Promise<boolean> => {
    setBusyId(id);
    setError('');
    try {
      await action();
      await load();
      return true;
    } catch (reason) {
      setError(extractErrorMessage(reason));
      return false;
    } finally {
      setBusyId('');
    }
  };

  const renderActions = (row: Record<string, any>) => {
    if (config.slug === 'legal-counsel' && section === 'approvals' && row.state === 'PENDING_COUNSEL_REVIEW') {
      return (
        <div className="flex gap-2">
          <button onClick={() => perform(row.id, () => governanceService.decideLegalContract(row.id, 'COUNSEL_APPROVED'))} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Approve & Execute</button>
          <button onClick={() => setReasonAction({ title: 'Return contract for revision', description: 'Explain the changes required before this contract can be approved.', label: 'Review comments', confirmLabel: 'Return for revision', tone: 'danger', submit: (comments) => perform(row.id, () => governanceService.decideLegalContract(row.id, 'REJECTED_REVISION', comments)) })} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700">Return for Revision</button>
        </div>
      );
    }
    if (config.slug === 'compliance-management' && section === 'signoffs' && row.status === 'AWAITING_MANAGER_SIGNOFF') {
      return (
        <div className="flex gap-2">
          <button onClick={() => perform(row.id, () => governanceService.decideManagerSignoff(row.id, true))} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Authorize</button>
          <button onClick={() => setReasonAction({ title: 'Reject management sign-off', description: 'Provide the revision comments that will be sent back with this item.', label: 'Revision comments', confirmLabel: 'Reject and return', tone: 'danger', submit: (comments) => perform(row.id, () => governanceService.decideManagerSignoff(row.id, false, comments)) })} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">Reject & Return</button>
        </div>
      );
    }
    if (config.slug === 'department' && section === 'approvals' && row.status === 'PENDING_DEPARTMENT_HEAD') {
      return (
        <div className="flex gap-2">
          <button onClick={() => perform(row.id, () => governanceService.decideDepartmentApproval(row.id, 'APPROVED'))} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Approve</button>
          <button onClick={() => setReasonAction({ title: 'Return department approval', description: 'Explain why this item is being returned for further work.', label: 'Return comments', confirmLabel: 'Return item', tone: 'primary', submit: (comments) => perform(row.id, () => governanceService.decideDepartmentApproval(row.id, 'RETURNED', comments)) })} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white">Return</button>
        </div>
      );
    }
    if (config.slug === 'privacy' && ['inventory', 'visitors', 'biometrics'].includes(section)) {
      return (
        <button onClick={() => setReasonAction({
          title: 'Reveal protected data', description: 'This access is audited. State the business reason for viewing the protected values.', label: 'Access justification', confirmLabel: 'Reveal data', tone: 'primary',
          submit: async (justification) => {
            setBusyId(row.id);
            try {
              const result = await governanceService.revealPrivacyLog(row.id, justification);
              setRevealed((current) => ({ ...current, [row.id]: result.rawPii }));
              return true;
            } catch (reason) {
              setError(extractErrorMessage(reason));
              return false;
            } finally { setBusyId(''); }
          },
        })} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Eye className="h-4 w-4" />Reveal</button>
      );
    }
    if (config.slug === 'privacy' && section === 'cctv' && row.status === 'PENDING_PRIVACY_APPROVAL') {
      return (
        <div className="flex gap-2">
          {[true, false].map((approve) => (
            <button key={String(approve)} onClick={() => setReasonAction({ title: `${approve ? 'Approve' : 'Deny'} CCTV export`, description: 'Record the justification for this privacy decision.', label: 'Decision justification', confirmLabel: approve ? 'Approve export' : 'Deny export', tone: approve ? 'success' : 'danger', submit: (justification) => perform(row.id, () => governanceService.decideCctvExport(row.id, approve, justification)) })} className={`rounded-lg px-3 py-2 text-xs font-bold text-white ${approve ? 'bg-emerald-600' : 'bg-rose-600'}`}>{approve ? 'Approve Export' : 'Deny'}</button>
          ))}
        </div>
      );
    }
    if (config.slug === 'records' && section === 'ingestion' && row.archive_status === 'PENDING_VALIDATION') {
      return <button onClick={() => perform(row.id, () => governanceService.vaultArchive(row.id))} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Validate & Vault</button>;
    }
    return null;
  };

  const columns: DataTableColumn<Record<string, any>>[] = [
    { id: 'record', header: 'Record', sortable: true, sortValue: rowTitle, searchableValue: rowTitle, cell: (row) => <div><p className="font-semibold text-slate-900">{rowTitle(row)}</p>{row.description && <p className="mt-1 max-w-sm truncate text-xs text-slate-500" title={String(row.description)}>{String(row.description)}</p>}</div> },
    { id: 'reference', header: 'Reference', sortable: true, optional: true, sortValue: (row) => row.request_reference || row.signoff_reference || row.approval_reference || row.incident_reference || row.contract?.contract_number || row.permit_number || '', accessor: (row) => row.request_reference || row.signoff_reference || row.approval_reference || row.incident_reference || row.contract?.contract_number || row.permit_number || '—' },
    { id: 'type', header: 'Type', optional: true, searchableValue: (row) => row.item_type || row.request_type || row.violation_category || row.contract?.type || row.data_category || row.permit_type, accessor: (row) => prettify(String(row.item_type || row.request_type || row.violation_category || row.contract?.type || row.data_category || row.permit_type || 'Not provided')) },
    { id: 'owner', header: 'Owner', optional: true, searchableValue: (row) => row.submittedByName || row.requester_name || row.owner_email || row.submitted_by, accessor: (row) => row.submittedByName || row.requester_name || row.owner_email || row.submitted_by || 'Not assigned' },
    { id: 'scope', header: 'Hub / Department', optional: true, accessor: (row) => row.hub_name || row.facility_name || row.department_name || row.contract?.counter_party || '—' },
    { id: 'due', header: 'Due / Expiry', sortable: true, optional: true, sortValue: (row) => row.due_at || row.notification_due_at || row.statutory_deadline || row.expiration_date || row.retention_expires_at, accessor: (row) => workspaceDate(row.due_at || row.notification_due_at || row.statutory_deadline || row.expiration_date || row.retention_expires_at) },
    { id: 'status', header: 'Status', sortable: true, sortValue: (row) => rowStatus(row), searchableValue: rowStatus, cell: (row) => rowStatus(row) ? <DataTableStatusBadge value={rowStatus(row)} /> : <span className="text-slate-500">Not provided</span> },
  ];

  if (!payload && !error) return <PortalLoadingOverlay message={`Loading ${item.label.toLowerCase()}...`} />;

  return (
    <div className="space-y-6">
      <DashboardHero eyebrow={config.portalLabel} title={item.label} subtitle={config.description} actions={
          <>
            {config.slug === 'privacy' && section === 'retention' && (
              <button onClick={() => perform('retention', async () => { await governanceService.runRetention(); })} className="rounded-control bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700">Run Retention Enforcement</button>
            )}
            <button onClick={load} title="Refresh" className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /></button>
          </>
      } />

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="h-5 w-5 shrink-0" />{error}
        </div>
      )}

      {payload?.metrics?.length ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {payload.metrics.map((metric) => (
            <div key={metric.label} className={`workspace-metric-card card-stat p-5 ${toneClass[metric.tone || 'info']}`}>
              <p className="text-xs font-semibold">{metric.label}</p>
              <p className="mt-3 text-3xl font-bold text-slate-950">{metric.value}{metric.suffix}</p>
            </div>
          ))}
        </section>
      ) : null}

      {config.slug === 'compliance-management' && section === 'team-supervision' && <OversightPanel />}

      <div>
        <div className="mb-3">
          <h2 className="text-sm font-bold text-slate-900">Live Workspace Records</h2>
          <p className="mt-1 text-xs text-slate-500">Supabase cloud data · updated {payload?.generatedAt ? workspaceDate(payload.generatedAt) : '—'} · Asia/Manila</p>
        </div>
        <DataTable
          data={payload?.rows ?? []}
          columns={columns}
          rowKey={(row) => row.id || rowTitle(row)}
          caption={`${item.label} records`}
          loading={refreshing}
          error={error || undefined}
          onRetry={load}
          onRefresh={load}
          searchPlaceholder={`Search ${item.label.toLowerCase()}...`}
          searchableText={(row) => `${rowTitle(row)} ${rowDetails(row).map((entry) => entry[1]).join(' ')} ${rowStatus(row) ?? ''}`}
          emptyTitle={`No ${item.label.toLowerCase()} records`}
          emptyDescription="No records are currently available for this workspace."
          filteredEmptyTitle={`No ${item.label.toLowerCase()} records match your search`}
          rowActions={(row) => busyId === row.id ? <Loader2 className="h-5 w-5 animate-spin text-brand-500" aria-label="Updating record" /> : renderActions(row)}
          renderMobileCard={(row) => <DataTableMobileCard title={rowTitle(row)} badge={rowStatus(row) ? <DataTableStatusBadge value={rowStatus(row)} /> : undefined} fields={rowDetails(row).slice(0, 5).map(([label, value]) => ({ label, value: revealed[row.id] && label === 'Protected Data' ? JSON.stringify(revealed[row.id]) : value }))} actions={busyId === row.id ? <Loader2 className="h-5 w-5 animate-spin text-brand-500" aria-label="Updating record" /> : renderActions(row)} />}
        />
      </div>

      {payload?.alerts?.length ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 text-amber-900"><ShieldAlert className="h-5 w-5" /><h2 className="text-sm font-bold">Priority Alerts</h2></div>
          <div className="mt-4 divide-y divide-amber-200">
            {payload.alerts.map((alert) => (
              <div key={alert.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                <div><p className="font-semibold text-amber-950">{rowTitle(alert)}</p><p className="mt-1 text-xs text-amber-800">{rowDetails(alert)[0]?.[1]}</p></div>
                {config.slug === 'records' && section === 'custody' && alert.status === 'PENDING_CUSTODY_APPROVAL' && (
                  <div className="flex gap-2">
                    <button onClick={() => perform(alert.id, () => governanceService.decideCctvCustody(alert.id, true))} title="Approve" className="rounded-lg bg-emerald-600 p-2 text-white"><CheckCircle2 className="h-4 w-4" /></button>
                    <button onClick={() => perform(alert.id, () => governanceService.decideCctvCustody(alert.id, false))} title="Reject" className="rounded-lg bg-rose-600 p-2 text-white"><XCircle className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <ReasonDialog
        open={Boolean(reasonAction)}
        title={reasonAction?.title || ''}
        description={reasonAction?.description}
        label={reasonAction?.label}
        confirmLabel={reasonAction?.confirmLabel}
        tone={reasonAction?.tone}
        busy={reasonBusy}
        onClose={() => setReasonAction(null)}
        onConfirm={async (reason) => {
          if (!reasonAction) return;
          setReasonBusy(true);
          try {
            const succeeded = await reasonAction.submit(reason);
            if (succeeded) setReasonAction(null);
            else throw new Error('The action failed. Your reason has been preserved.');
          }
          finally { setReasonBusy(false); }
        }}
      />
    </div>
  );
};
