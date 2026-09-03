import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, Loader2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import { governanceService, WorkspacePayload } from '../../api/governanceService';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { OversightPanel } from '../oversight';
import { RecordsDisposalConsole } from '../records/RecordsDisposalConsole';
import type { WorkspaceConfig } from './workspaceConfig';

const toneClass = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
};

const prettify = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

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
  return <GenericRoleWorkspacePage config={config} section={section} />;
};

const GenericRoleWorkspacePage: React.FC<{ config: WorkspaceConfig; section: string }> = ({ config, section }) => {
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [revealed, setRevealed] = useState<Record<string, Record<string, any>>>({});
  const revision = useRealtimeSyncStore((state) => state.revision);
  const item = useMemo(() => config.nav.find((navItem) => navItem.section === section) || config.nav[0], [config, section]);

  const load = useCallback(async () => {
    setError('');
    try {
      setPayload(await governanceService.getWorkspace(config.slug, section));
    } catch (reason) {
      setError(extractErrorMessage(reason));
    }
  }, [config.slug, section]);

  useEffect(() => { load(); }, [load, revision]);

  const perform = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setError('');
    try {
      await action();
      await load();
    } catch (reason) {
      setError(extractErrorMessage(reason));
    } finally {
      setBusyId('');
    }
  };

  const renderActions = (row: Record<string, any>) => {
    if (config.slug === 'legal-counsel' && section === 'approvals' && row.state === 'PENDING_COUNSEL_REVIEW') {
      return (
        <div className="flex gap-2">
          <button onClick={() => perform(row.id, () => governanceService.decideLegalContract(row.id, 'COUNSEL_APPROVED'))} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Approve & Execute</button>
          <button onClick={() => {
            const comments = window.prompt('Review comments required for revision:')?.trim();
            if (comments) perform(row.id, () => governanceService.decideLegalContract(row.id, 'REJECTED_REVISION', comments));
          }} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700">Return for Revision</button>
        </div>
      );
    }
    if (config.slug === 'compliance-management' && section === 'signoffs' && row.status === 'AWAITING_MANAGER_SIGNOFF') {
      return (
        <div className="flex gap-2">
          <button onClick={() => perform(row.id, () => governanceService.decideManagerSignoff(row.id, true))} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Authorize</button>
          <button onClick={() => {
            const comments = window.prompt('Revision comments:')?.trim();
            if (comments) perform(row.id, () => governanceService.decideManagerSignoff(row.id, false, comments));
          }} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">Reject & Return</button>
        </div>
      );
    }
    if (config.slug === 'department' && section === 'approvals' && row.status === 'PENDING_DEPARTMENT_HEAD') {
      return (
        <div className="flex gap-2">
          <button onClick={() => perform(row.id, () => governanceService.decideDepartmentApproval(row.id, 'APPROVED'))} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Approve</button>
          <button onClick={() => {
            const comments = window.prompt('Return comments:')?.trim();
            if (comments) perform(row.id, () => governanceService.decideDepartmentApproval(row.id, 'RETURNED', comments));
          }} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white">Return</button>
        </div>
      );
    }
    if (config.slug === 'privacy' && ['inventory', 'visitors', 'biometrics'].includes(section)) {
      return (
        <button onClick={async () => {
          const justification = window.prompt('State the reason for revealing protected data:')?.trim();
          if (!justification) return;
          setBusyId(row.id);
          try {
            const result = await governanceService.revealPrivacyLog(row.id, justification);
            setRevealed((current) => ({ ...current, [row.id]: result.rawPii }));
          } catch (reason) {
            setError(extractErrorMessage(reason));
          } finally {
            setBusyId('');
          }
        }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Eye className="h-4 w-4" />Reveal</button>
      );
    }
    if (config.slug === 'privacy' && section === 'cctv' && row.status === 'PENDING_PRIVACY_APPROVAL') {
      return (
        <div className="flex gap-2">
          {[true, false].map((approve) => (
            <button key={String(approve)} onClick={() => {
              const justification = window.prompt(`${approve ? 'Approval' : 'Denial'} justification:`)?.trim();
              if (justification) perform(row.id, () => governanceService.decideCctvExport(row.id, approve, justification));
            }} className={`rounded-lg px-3 py-2 text-xs font-bold text-white ${approve ? 'bg-emerald-600' : 'bg-rose-600'}`}>{approve ? 'Approve Export' : 'Deny'}</button>
          ))}
        </div>
      );
    }
    if (config.slug === 'records' && section === 'ingestion' && row.archive_status === 'PENDING_VALIDATION') {
      return <button onClick={() => perform(row.id, () => governanceService.vaultArchive(row.id))} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Validate & Vault</button>;
    }
    return null;
  };

  if (!payload && !error) return <div className="h-48 animate-pulse rounded-lg bg-slate-200" />;

  return (
    <div className="space-y-6">
      <section className="border-b border-slate-200 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#D02F34]">{config.portalLabel}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">{item.label}</h1>
          </div>
          <div className="flex gap-2">
            {config.slug === 'privacy' && section === 'retention' && (
              <button onClick={() => perform('retention', async () => { await governanceService.runRetention(); })} className="rounded-lg bg-[#D02F34] px-4 py-2 text-xs font-bold text-white">Run Retention Enforcement</button>
            )}
            <button onClick={load} title="Refresh" className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /></button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="h-5 w-5 shrink-0" />{error}
        </div>
      )}

      {payload?.metrics?.length ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {payload.metrics.map((metric) => (
            <div key={metric.label} className={`rounded-lg border p-5 ${toneClass[metric.tone || 'info']}`}>
              <p className="text-xs font-semibold">{metric.label}</p>
              <p className="mt-3 text-3xl font-bold text-slate-950">{metric.value}{metric.suffix}</p>
            </div>
          ))}
        </section>
      ) : null}

      {config.slug === 'compliance-management' && section === 'team-supervision' && <OversightPanel />}

      {config.slug === 'compliance' && section === 'settings' ? (
        <section className="flex min-h-64 items-center justify-center border-y border-dashed border-slate-300 text-sm text-slate-400">
          Reserved for future profile and system settings.
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">Live Workspace Records</h2>
            <p className="mt-1 text-xs text-slate-500">Supabase cloud data · updated {payload?.generatedAt ? new Date(payload.generatedAt).toLocaleString() : ''}</p>
          </div>
          {!payload?.rows?.length ? (
            <div className="p-12 text-center text-sm text-slate-400">No records are currently available for this workspace.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {payload.rows.map((row) => {
                const status = rowStatus(row);
                return (
                  <article key={row.id || rowTitle(row)} className="p-5">
                    <div className="flex items-start justify-between gap-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-900">{rowTitle(row)}</h3>
                          {status && <span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600">{prettify(status)}</span>}
                        </div>
                        <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs md:grid-cols-2 xl:grid-cols-3">
                          {rowDetails(row).map(([label, value]) => (
                            <div key={`${label}-${value}`} className="min-w-0">
                              <dt className="font-semibold text-slate-400">{label}</dt>
                              <dd className="mt-0.5 break-words text-slate-700">{revealed[row.id] && label === 'Protected Data' ? JSON.stringify(revealed[row.id]) : value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                      <div className="shrink-0">{busyId === row.id ? <Loader2 className="h-5 w-5 animate-spin text-[#D02F34]" /> : renderActions(row)}</div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

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
    </div>
  );
};
