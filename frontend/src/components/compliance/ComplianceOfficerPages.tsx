import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle, RefreshCw, Archive,
  ScrollText, Settings, CheckCircle2, Trash2, Plus,
  X, BellRing, Bell, ShieldAlert, Ban,
} from 'lucide-react';
import { safeFetchJson } from '../../api/client';
import { ReasonDialog } from '../ui/SharedUI';
import { DashboardHero } from '../ui/DashboardPrimitives';
import { DataTable, DataTableRowActions, DataTableStatusBadge, type DataTableColumn, type DataTableRowAction } from '../ui/data-table';

// POST/PUT helper that preserves the API envelope and propagates failures.
const mutate = async (url: string, method: 'POST' | 'PUT', body?: unknown) => {
  const json = await safeFetchJson(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (json === null) throw new Error('Request failed. Please try again.');
  return (json as any)?.data;
};
const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="glass-panel p-5 animate-pulse"><div className="h-5 w-56 bg-slate-200 rounded" /></div>
    <div className="glass-panel p-5 animate-pulse"><div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-4 w-full bg-slate-200 rounded" />)}</div></div>
  </div>
);

const EmptyState: React.FC<{ icon: React.ElementType; title: string; desc: string }> = ({ icon: Icon, title, desc }) => (
  <div className="card-stat p-12 flex flex-col items-center justify-center text-center space-y-4">
    <div className="p-4 rounded-2xl bg-slate-100"><Icon className="w-10 h-10 text-slate-400" /></div>
    <p className="text-lg font-bold text-slate-700">{title}</p>
    <p className="text-sm text-slate-500 max-w-md">{desc}</p>
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="card-stat p-8 flex flex-col items-center justify-center text-center space-y-3">
    <AlertCircle className="w-10 h-10 text-rose-400" />
    <p className="text-sm text-slate-600">{message}</p>
    <button type="button" onClick={onRetry} className="inline-flex items-center space-x-2 rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">
      <RefreshCw className="w-4 h-4" /><span>Retry</span>
    </button>
  </div>
);

const Badge: React.FC<{ text?: string; className: string }> = ({ text, className }) => (
  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${className}`}>{text || '-'}</span>
);

type ActionVariant = 'primary' | 'neutral' | 'danger';
const actionClasses: Record<ActionVariant, string> = {
  primary: 'bg-brand-500 text-white border-brand-500 hover:bg-brand-700',
  neutral: 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50',
  danger: 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50',
};
const ActionButton: React.FC<{
  onClick: () => void; icon?: React.ElementType; children: React.ReactNode;
  variant?: ActionVariant; disabled?: boolean;
}> = ({ onClick, icon: Icon, children, variant = 'neutral', disabled }) => (
  <button onClick={onClick} disabled={disabled}
    className={`inline-flex items-center space-x-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${actionClasses[variant]}`}>
    {Icon && <Icon className="w-3.5 h-3.5" />}<span>{children}</span>
  </button>
);

const Toast: React.FC<{ message: string; kind: 'ok' | 'err'; onClose: () => void }> = ({ message, kind, onClose }) => (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center space-x-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
    kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
  }`}>
    {kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
    <span>{message}</span>
    <button onClick={onClose} className="ml-2 opacity-80 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
  </div>
);

// Lightweight toast state hook shared across the write-capable pages.
const useToast = () => {
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'err' } | null>(null);
  const show = useCallback((message: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 3200);
  }, []);
  const node = toast ? <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} /> : null;
  return { show, node };
};
const formatSize = (bytes?: number) => {
  if (!bytes && bytes !== 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatCurrency = (value?: number | string) => {
  if (value === null || value === undefined || value === '') return '-';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '-';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

export const CoDocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [disposalDoc, setDisposalDoc] = useState<any | null>(null);
  const [disposalReason, setDisposalReason] = useState('');
  const [classificationCategories, setClassificationCategories] = useState<any[]>([]);
  const [reviewDoc, setReviewDoc] = useState<any | null>(null);
  const [reviewCategoryId, setReviewCategoryId] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [legalHoldDoc, setLegalHoldDoc] = useState<any | null>(null);
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const [json, categoriesJson] = await Promise.all([
        safeFetchJson(`/api/v1/compliance/documents${qs}`),
        safeFetchJson('/api/v1/documents/classification-categories'),
      ]);
      setDocuments(json?.data ?? []);
      setClassificationCategories(categoriesJson?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (id: string, path: string, label: string, body?: unknown): Promise<boolean> => {
    setBusyId(id);
    try {
      await mutate(`/api/v1/compliance/documents/${id}/${path}`, 'POST', body);
      show(label);
      await load();
      return true;
    } catch (err: any) {
      show(err?.message || 'Action failed', 'err');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const submitDisposal = async () => {
    if (!disposalDoc) return;
    const reason = disposalReason.trim();
    if (!reason) { show('A disposal reason is required', 'err'); return; }
    const doc = disposalDoc;
    const succeeded = await runAction(doc.id, 'disposal', 'Disposal requested', { reason });
    if (!succeeded) return;
    setDisposalDoc(null);
    setDisposalReason('');
  };

  const reviewClassification = async (doc: any, decision: 'APPROVE' | 'CORRECT' | 'REJECT', categoryId?: string, notes?: string) => {
    setBusyId(doc.id);
    try {
      await mutate(`/api/v1/documents/${doc.id}/classification-review`, 'POST', {
        decision,
        ...(categoryId ? { categoryId } : {}),
        ...(notes?.trim() ? { notes: notes.trim() } : {}),
      });
      show(decision === 'APPROVE' ? 'AI classification approved' : decision === 'CORRECT' ? 'Classification corrected and approved' : 'AI suggestion rejected');
      setReviewDoc(null);
      setReviewCategoryId('');
      setReviewNotes('');
      await load();
    } catch (err: any) {
      show(err?.message || 'Classification review failed', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const statuses = ['', 'PENDING_REVIEW', 'APPROVED', 'ARCHIVED', 'REJECTED'];

  if (loading && documents.length === 0) return <LoadingSkeleton />;
  if (error && documents.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      {toastNode}
      <DashboardHero title="Retention Records" subtitle="Records repository — approve, archive, and request disposal" actions={
        <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh retention records"><RefreshCw className="h-4 w-4" /></button>
      } />

      <DataTable
        data={documents}
        columns={[
          { id: 'document', header: 'Document', sortable: true, sortValue: (d: any) => d.title, searchableValue: (d: any) => `${d.title} ${d.fileName}`, cell: (d: any) => <div><p className="font-semibold text-slate-900">{d.title || 'Untitled document'}</p><p className="mt-1 max-w-52 truncate text-xs text-slate-500" title={d.fileName}>{d.fileName || 'No file name'}</p></div> },
          { id: 'classification', header: 'Classification', sortable: true, sortValue: (d: any) => d.finalClassification || d.aiPredictedCategory, cell: (d: any) => <div><p className="text-xs font-semibold text-slate-700">{(d.finalClassification || d.aiPredictedCategory || 'UNCLASSIFIED').replace(/_/g, ' ')}</p><p className="mt-1 text-[10px] text-slate-500">{d.confidenceScore == null ? 'No confidence' : `${Math.round(Number(d.confidenceScore) * 100)}% confidence`} · {d.classificationLevel || 'No security label'}</p></div> },
          { id: 'version', header: 'Version', align: 'right', optional: true, accessor: (d: any) => `v${d.versionNumber ?? 1}` },
          { id: 'size', header: 'Size', align: 'right', optional: true, accessor: (d: any) => formatSize(d.fileSize) },
          { id: 'status', header: 'Status', sortable: true, sortValue: (d: any) => d.status, cell: (d: any) => <DataTableStatusBadge value={d.status} /> },
          { id: 'retention', header: 'Retention', sortable: true, sortValue: (d: any) => d.retentionExpiresAt || '', cell: (d: any) => <div><DataTableStatusBadge value={d.retentionStatus || 'UNASSIGNED'} /><p className="mt-1 text-[10px] text-slate-500">{d.retentionExpiresAt ? `Due ${d.retentionExpiresAt}` : 'No deadline'}</p></div> },
        ] satisfies DataTableColumn<any>[]}
        rowKey={(d: any) => d.id}
        caption="Compliance retention records"
        loading={loading}
        error={error}
        onRetry={load}
        onRefresh={load}
        searchableText={(d: any) => `${d.title} ${d.fileName} ${d.finalClassification} ${d.aiPredictedCategory} ${d.classificationLevel} ${d.status} ${d.retentionStatus}`}
        searchPlaceholder="Search retention records..."
        filters={<select aria-label="Document status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-control border border-slate-300 bg-white px-3 text-sm text-slate-700">{statuses.map((status) => <option key={status || 'ALL'} value={status}>{status ? status.replace(/_/g, ' ') : 'All statuses'}</option>)}</select>}
        activeFilters={statusFilter ? [{ id: 'status', label: 'Status', value: statusFilter.replace(/_/g, ' '), onRemove: () => setStatusFilter('') }] : []}
        onClearFilters={() => setStatusFilter('')}
        emptyTitle="No documents"
        emptyDescription="No retention records are available."
        filteredEmptyTitle="No documents match the current filters"
        rowActions={(d: any) => {
          const status = String(d.status || '').toUpperCase();
          const busy = busyId === d.id;
          const actions: DataTableRowAction<any>[] = [];
          if (status === 'PENDING_REVIEW') actions.push(
            { id: 'approve-ai', label: 'Approve AI classification', icon: CheckCircle2, disabled: busy, onSelect: () => reviewClassification(d, 'APPROVE') },
            { id: 'correct-ai', label: 'Correct classification', disabled: busy, onSelect: () => { setReviewDoc(d); setReviewCategoryId(classificationCategories.find(c => c.name === d.aiPredictedCategory)?.id || classificationCategories[0]?.id || ''); setReviewNotes(''); } },
            { id: 'reject-ai', label: 'Reject AI suggestion', icon: Ban, destructive: true, disabled: busy, onSelect: () => reviewClassification(d, 'REJECT') },
          );
          if (status !== 'ARCHIVED' && status !== 'DELETED') actions.push({ id: 'archive', label: 'Archive document', icon: Archive, disabled: busy, onSelect: () => runAction(d.id, 'archive', 'Document archived') });
          if (d.retentionStatus === 'ELIGIBLE_FOR_DISPOSAL' && status !== 'DELETED') actions.push({ id: 'dispose', label: 'Request disposal', icon: Trash2, destructive: true, disabled: busy, onSelect: () => { setDisposalDoc(d); setDisposalReason(''); } });
          if (d.retentionStatus !== 'LEGAL_HOLD' && status !== 'DELETED') actions.push({ id: 'hold', label: 'Place legal hold', icon: ShieldAlert, disabled: busy, onSelect: () => setLegalHoldDoc(d) });
          if (d.retentionStatus === 'LEGAL_HOLD') actions.push({ id: 'release-hold', label: 'Release legal hold', icon: CheckCircle2, disabled: busy, onSelect: () => runAction(d.id, 'legal-hold/release', 'Legal hold released', { reason: 'Released after authorized review' }) });
          return <DataTableRowActions row={d} label={`Actions for ${d.title || 'document'}`} actions={actions} />;
        }}
      />

      {disposalDoc && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => setDisposalDoc(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-rose-50 border border-rose-100"><Trash2 className="w-4 h-4 text-rose-500" /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Request Disposal</h3>
                  <p className="text-[11px] text-slate-400">{disposalDoc.title}</p>
                </div>
              </div>
              <button onClick={() => setDisposalDoc(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500">Submit this document for disposal approval. The request will appear in the Disposal Approvals queue for a final decision.</p>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase">Reason</label>
              <textarea value={disposalReason} onChange={e => setDisposalReason(e.target.value)} rows={3}
                placeholder="Why should this document be disposed of?"
                className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div className="flex justify-end space-x-2 pt-1">
              <ActionButton onClick={() => setDisposalDoc(null)}>Cancel</ActionButton>
              <ActionButton onClick={submitDisposal} icon={Trash2} variant="danger">Submit Request</ActionButton>
            </div>
          </div>
        </div>
      )}

      {reviewDoc && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => setReviewDoc(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Correct AI Classification</h3>
                <p className="text-xs text-slate-500 mt-1">{reviewDoc.title}</p>
              </div>
              <button onClick={() => setReviewDoc(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
              <p><span className="font-semibold">AI suggestion:</span> {(reviewDoc.aiPredictedCategory || 'UNCLASSIFIED').replace(/_/g, ' ')}</p>
              <p><span className="font-semibold">Confidence:</span> {Math.round(Number(reviewDoc.confidenceScore ?? 0) * 100)}%</p>
              {reviewDoc.aiClassificationReason && <p><span className="font-semibold">Reason:</span> {reviewDoc.aiClassificationReason}</p>}
              <p><span className="font-semibold">Provenance:</span> {reviewDoc.aiProviderName || 'Unknown'} / {reviewDoc.aiModel || 'Unknown'}</p>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase">Final category</label>
              <select value={reviewCategoryId} onChange={event => setReviewCategoryId(event.target.value)} className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2">
                {classificationCategories.map(category => <option key={category.id} value={category.id}>{category.name.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase">Review notes (optional)</label>
              <textarea value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} rows={3} maxLength={1000} className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2" />
            </div>
            <div className="flex justify-end gap-2">
              <ActionButton onClick={() => setReviewDoc(null)}>Cancel</ActionButton>
              <ActionButton onClick={() => reviewClassification(reviewDoc, 'CORRECT', reviewCategoryId, reviewNotes)} icon={CheckCircle2} variant="primary" disabled={!reviewCategoryId || busyId === reviewDoc.id}>Save corrected classification</ActionButton>
            </div>
          </div>
        </div>
      )}
      <ReasonDialog
        open={Boolean(legalHoldDoc)}
        title="Place legal hold"
        description={legalHoldDoc ? `Explain why “${legalHoldDoc.title}” must be protected from disposal.` : undefined}
        label="Legal hold reason"
        confirmLabel="Place hold"
        tone="primary"
        busy={Boolean(legalHoldDoc && busyId === legalHoldDoc.id)}
        onClose={() => setLegalHoldDoc(null)}
        onConfirm={async (reason) => {
          if (!legalHoldDoc) return;
          const doc = legalHoldDoc;
          const succeeded = await runAction(doc.id, 'legal-hold', 'Legal hold placed', { reason });
          if (succeeded) setLegalHoldDoc(null);
          else throw new Error('The legal hold failed. Your reason has been preserved.');
        }}
      />
    </div>
  );
};

export const CoContractsPage: React.FC = () => {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const json = await safeFetchJson(`/api/v1/compliance/contracts${qs}`);
      setContracts(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const statuses = ['', 'ACTIVE', 'UNDER_REVIEW', 'EXPIRED', 'TERMINATED'];

  if (loading && contracts.length === 0) return <LoadingSkeleton />;
  if (error && contracts.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <DashboardHero title="Contract Deadlines" subtitle="Contract register with AI-assessed risk levels" actions={
        <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh contract deadlines"><RefreshCw className="h-4 w-4" /></button>
      } />

      <DataTable
        data={contracts}
        columns={[
          { id: 'contract', header: 'Contract', sortable: true, sortValue: (c: any) => c.title, searchableValue: (c: any) => `${c.title} ${c.contractNumber} ${c.type}`, cell: (c: any) => <div><p className="font-semibold text-slate-900">{c.title || 'Untitled contract'}</p><p className="mt-1 text-xs text-slate-500">{c.contractNumber || 'No contract number'} · {c.type || 'Not specified'}</p></div> },
          { id: 'party', header: 'Counterparty', sortable: true, accessor: (c: any) => c.counterParty || 'Not provided', sortValue: (c: any) => c.counterParty },
          { id: 'value', header: 'Value', sortable: true, align: 'right', accessor: (c: any) => formatCurrency(c.contractValue), sortValue: (c: any) => Number(c.contractValue || 0) },
          { id: 'end', header: 'Expiration', sortable: true, accessor: (c: any) => c.endDate || 'Not provided', sortValue: (c: any) => c.endDate },
          { id: 'risk', header: 'AI risk', sortable: true, cell: (c: any) => <DataTableStatusBadge value={c.aiAssessedRiskLevel || 'NOT_ASSESSED'} />, sortValue: (c: any) => c.aiAssessedRiskLevel },
          { id: 'status', header: 'Status', sortable: true, cell: (c: any) => <DataTableStatusBadge value={c.status} />, sortValue: (c: any) => c.status },
        ] satisfies DataTableColumn<any>[]}
        rowKey={(c: any) => c.id}
        caption="Compliance contract deadlines"
        loading={loading}
        error={error}
        onRetry={load}
        onRefresh={load}
        searchableText={(c: any) => `${c.title} ${c.contractNumber} ${c.counterParty} ${c.type} ${c.status} ${c.aiAssessedRiskLevel}`}
        searchPlaceholder="Search contracts..."
        filters={<select aria-label="Contract status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-control border border-slate-300 bg-white px-3 text-sm text-slate-700">{statuses.map((status) => <option key={status || 'ALL'} value={status}>{status ? status.replace(/_/g, ' ') : 'All statuses'}</option>)}</select>}
        activeFilters={statusFilter ? [{ id: 'status', label: 'Status', value: statusFilter.replace(/_/g, ' '), onRemove: () => setStatusFilter('') }] : []}
        onClearFilters={() => setStatusFilter('')}
        emptyTitle="No contracts"
        emptyDescription="No contracts are available in the authorized compliance scope."
        filteredEmptyTitle="No contracts match the current filters"
      />
    </div>
  );
};
export const CoRetentionPoliciesPage: React.FC = () => {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null); // null=closed, {}=new, {...}=edit
  const [form, setForm] = useState({ name: '', description: '', retentionPeriodDays: 365, actionOnExpiry: 'REVIEW', classificationName: '', applicableDepartment: '', triggerBasis: 'FINAL_APPROVAL', alertWindows: '90,30,7', active: true });
  const [saving, setSaving] = useState(false);
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/compliance/retention-policies');
      setPolicies(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  const formatDays = (days?: number) => {
    if (!days && days !== 0) return '-';
    if (days >= 365) return `${(days / 365).toFixed(1)} yrs (${days}d)`;
    return `${days} days`;
  };

  const openNew = () => {
    setForm({ name: '', description: '', retentionPeriodDays: 365, actionOnExpiry: 'REVIEW', classificationName: '', applicableDepartment: '', triggerBasis: 'FINAL_APPROVAL', alertWindows: '90,30,7', active: true });
    setEditing({});
  };
  const openEdit = (p: any) => {
    setForm({
      name: p.name ?? '', description: p.description ?? '',
      retentionPeriodDays: p.retentionPeriodDays ?? 365,
      actionOnExpiry: p.actionOnExpiry ?? 'REVIEW',
      classificationName: p.classificationName ?? '', applicableDepartment: p.applicableDepartment ?? '',
      triggerBasis: p.triggerBasis ?? 'FINAL_APPROVAL', alertWindows: (p.alertWindowsDays ?? [90, 30, 7]).join(','), active: !!p.active,
    });
    setEditing(p);
  };

  const save = async () => {
    if (!form.name.trim()) { show('Policy name is required', 'err'); return; }
    setSaving(true);
    try {
      const isEdit = editing && editing.id;
      const url = isEdit ? `/api/v1/compliance/retention-policies/${editing.id}` : '/api/v1/compliance/retention-policies';
      await mutate(url, isEdit ? 'PUT' : 'POST', {
        name: form.name.trim(), description: form.description.trim(),
        retentionPeriodDays: Number(form.retentionPeriodDays) || 0,
        actionOnExpiry: form.actionOnExpiry, classificationName: form.classificationName.trim() || null,
        applicableDepartment: form.applicableDepartment.trim() || null, triggerBasis: form.triggerBasis,
        alertWindowsDays: form.alertWindows.split(',').map(value => Number(value.trim())).filter(Number.isFinite), active: form.active,
      });
      show(isEdit ? 'Policy updated' : 'Policy created');
      setEditing(null);
      await load();
    } catch (err: any) {
      show(err?.message || 'Save failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: any) => {
    setBusyId(p.id);
    try {
      await mutate(`/api/v1/compliance/retention-policies/${p.id}/toggle`, 'POST');
      show(`Policy ${p.active ? 'deactivated' : 'activated'}`);
      await load();
    } catch (err: any) {
      show(err?.message || 'Toggle failed', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const actions = ['ARCHIVE', 'PERMANENT_DELETE', 'REVIEW', 'TRANSFER'];

  if (loading && policies.length === 0) return <LoadingSkeleton />;
  if (error && policies.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      {toastNode}
      <DashboardHero title="Retention Policies" subtitle="Data retention rules and expiry actions" actions={
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton onClick={openNew} icon={Plus} variant="primary">New Policy</ActionButton>
          <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh retention policies"><RefreshCw className="h-4 w-4" /></button>
        </div>
      } />

      <DataTable
        data={policies}
        rowKey={(row: any) => row.id}
        caption="Compliance retention policies"
        loading={loading}
        error={error}
        onRetry={() => setRetry(value => value + 1)}
        columns={[
          { id: 'policy', header: 'Policy', searchableValue: (row: any) => `${row.name ?? ''} ${row.description ?? ''}`, cell: (row: any) => <><p className="font-semibold text-slate-900">{row.name}</p><p className="mt-1 max-w-sm truncate text-xs text-slate-500" title={row.description}>{row.description || 'No description'}</p></>, sortable: true },
          { id: 'scope', header: 'Classification / department', searchableValue: (row: any) => `${row.classificationName ?? ''} ${row.applicableDepartment ?? ''}`, cell: (row: any) => <><p>{row.classificationName || 'Unmapped'}</p><p className="text-xs text-slate-500">{row.applicableDepartment || 'All applicable departments'} · v{row.policyVersion ?? 1}</p></>, sortable: true },
          { id: 'retention', header: 'Retention', accessor: (row: any) => formatDays(row.retentionPeriodDays), sortValue: (row: any) => row.retentionPeriodDays ?? 0, sortable: true, align: 'right' },
          { id: 'expiry', header: 'On expiry', accessor: (row: any) => String(row.actionOnExpiry || '—').replace(/_/g, ' '), sortable: true },
          { id: 'trigger', header: 'Trigger', accessor: (row: any) => String(row.triggerBasis || '—').replace(/_/g, ' '), sortable: true, optional: true },
          { id: 'status', header: 'Status', accessor: (row: any) => <DataTableStatusBadge value={row.active ? 'ACTIVE' : 'INACTIVE'} />, sortValue: (row: any) => row.active ? 1 : 0, sortable: true },
        ] satisfies DataTableColumn<any>[]}
        searchableText={(row: any) => `${row.name ?? ''} ${row.description ?? ''} ${row.classificationName ?? ''} ${row.applicableDepartment ?? ''} ${row.actionOnExpiry ?? ''} ${row.triggerBasis ?? ''}`}
        searchPlaceholder="Search retention policies…"
        onRefresh={() => setRetry(value => value + 1)}
        rowActions={(row: any) => <DataTableRowActions row={row} label={`Actions for ${row.name || 'retention policy'}`} actions={[{ id: 'edit', label: 'Edit policy', icon: Settings, onSelect: () => openEdit(row) }, { id: 'toggle', label: row.active ? 'Deactivate policy' : 'Activate policy', icon: row.active ? Ban : CheckCircle2, destructive: row.active, disabled: busyId === row.id, onSelect: () => toggle(row) }]} />}
        emptyTitle="No retention policies"
        emptyDescription="No retention policies have been defined."
      />

      {editing && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => !saving && setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-purple-50 border border-purple-100"><Archive className="w-4 h-4 text-purple-500" /></div>
                <h3 className="text-sm font-bold text-slate-900">{editing.id ? 'Edit Retention Policy' : 'New Retention Policy'}</h3>
              </div>
              <button onClick={() => setEditing(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Retention (days)</label>
                  <input type="number" min={0} value={form.retentionPeriodDays}
                    onChange={e => setForm(f => ({ ...f, retentionPeriodDays: Number(e.target.value) }))}
                    className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">On Expiry</label>
                  <select value={form.actionOnExpiry} onChange={e => setForm(f => ({ ...f, actionOnExpiry: e.target.value }))}
                    className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200">
                    {actions.map(a => <option key={a} value={a}>{a.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Final classification</label>
                  <input value={form.classificationName} onChange={e => setForm(f => ({ ...f, classificationName: e.target.value }))} placeholder="FINANCIAL_RECORD"
                    className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Department (optional)</label>
                  <input value={form.applicableDepartment} onChange={e => setForm(f => ({ ...f, applicableDepartment: e.target.value }))}
                    className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Trigger basis</label>
                  <select value={form.triggerBasis} onChange={e => setForm(f => ({ ...f, triggerBasis: e.target.value }))}
                    className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white">
                    {['FINAL_APPROVAL', 'CREATION', 'CONTRACT_EXPIRATION', 'FISCAL_YEAR_END'].map(value => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Alert windows (days)</label>
                  <input value={form.alertWindows} onChange={e => setForm(f => ({ ...f, alertWindows: e.target.value }))} placeholder="90,30,7"
                    className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2" />
                </div>
              </div>
              <label className="flex items-center space-x-2 text-sm text-slate-600">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-200" />
                <span>Active</span>
              </label>
            </div>
            <div className="flex justify-end space-x-2 pt-1">
              <ActionButton onClick={() => setEditing(null)} disabled={saving}>Cancel</ActionButton>
              <ActionButton onClick={save} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const CoAuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/compliance/audit-logs');
      setLogs(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  if (loading && logs.length === 0) return <LoadingSkeleton />;
  if (error && logs.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <DashboardHero title="Audit Logs" subtitle="Read-only compliance audit events (last 30 days)" actions={
        <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh compliance audit logs"><RefreshCw className="h-4 w-4" /></button>
      } />

      <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <ScrollText className="w-4 h-4 text-amber-500" />
        <span>Read-only view of system audit events for compliance oversight</span>
      </div>

      <DataTable
        data={logs}
        columns={[
          { id: 'time', header: 'Timestamp', sortable: true, sortValue: (a: any) => a.createdAt, accessor: (a: any) => a.createdAt ? new Date(a.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '—' },
          { id: 'actor', header: 'Actor', sortable: true, accessor: (a: any) => a.userEmail || 'Unknown actor', sortValue: (a: any) => a.userEmail },
          { id: 'action', header: 'Action', sortable: true, accessor: (a: any) => <span className="font-semibold text-slate-900">{a.action || 'Not provided'}</span>, sortValue: (a: any) => a.action },
          { id: 'module', header: 'Module', sortable: true, accessor: (a: any) => a.module || '—', sortValue: (a: any) => a.module },
          { id: 'entity', header: 'Entity', optional: true, cell: (a: any) => <div><p className="text-xs text-slate-700">{a.entityName || a.entityType || 'Not provided'}</p>{a.entityType && <p className="mt-1 text-[10px] text-slate-500">{a.entityType}</p>}</div> },
          { id: 'severity', header: 'Severity', sortable: true, cell: (a: any) => <DataTableStatusBadge value={a.severity || 'INFO'} />, sortValue: (a: any) => a.severity },
        ] satisfies DataTableColumn<any>[]}
        rowKey={(a: any) => a.id}
        caption="Compliance audit logs"
        loading={loading}
        error={error}
        onRetry={load}
        onRefresh={load}
        searchableText={(a: any) => `${a.action} ${a.entityName} ${a.entityType} ${a.module} ${a.userEmail} ${a.severity}`}
        searchPlaceholder="Search compliance audit events..."
        emptyTitle="No audit events"
        emptyDescription="No audit events were recorded in the last 30 days."
        filteredEmptyTitle="No audit events match your search"
      />
    </div>
  );
};

export const CoDisposalApprovalsPage: React.FC = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [decision, setDecision] = useState<{ req: any; approve: boolean } | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const json = await safeFetchJson(`/api/v1/compliance/disposals${qs}`);
      setRequests(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!decision) return;
    const { req, approve } = decision;
    setSaving(true);
    try {
      await mutate(`/api/v1/compliance/disposals/${req.id}/${approve ? 'approve' : 'reject'}`, 'POST', { notes: notes.trim() });
      show(approve ? 'Disposal approved — document deleted' : 'Disposal rejected');
      setDecision(null);
      setNotes('');
      await load();
    } catch (err: any) {
      show(err?.message || 'Decision failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const statuses = ['', 'PENDING', 'APPROVED', 'REJECTED'];

  if (loading && requests.length === 0) return <LoadingSkeleton />;
  if (error && requests.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      {toastNode}
      <DashboardHero title="Disposal Review" subtitle="Review and decide document disposal requests" actions={
        <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh disposal review"><RefreshCw className="h-4 w-4" /></button>
      } />

      <DataTable
        data={requests}
        columns={[
          { id: 'document', header: 'Document', sortable: true, accessor: (r: any) => <span className="font-semibold text-slate-900">{r.documentTitle || 'Untitled document'}</span>, sortValue: (r: any) => r.documentTitle },
          { id: 'reason', header: 'Reason', optional: true, cell: (r: any) => <p className="max-w-sm truncate text-xs text-slate-700" title={r.reason}>{r.reason || 'Not provided'}</p> },
          { id: 'requested', header: 'Requested', sortable: true, sortValue: (r: any) => r.createdAt, accessor: (r: any) => r.createdAt ? new Date(r.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '—' },
          { id: 'decision', header: 'Decision', optional: true, cell: (r: any) => r.decidedBy ? <div><p className="text-xs text-slate-700">{r.decidedBy}</p>{r.decisionNotes && <p className="mt-1 max-w-xs truncate text-[10px] text-slate-500" title={r.decisionNotes}>{r.decisionNotes}</p>}</div> : 'Not decided' },
          { id: 'status', header: 'Status', sortable: true, cell: (r: any) => <DataTableStatusBadge value={r.status} />, sortValue: (r: any) => r.status },
        ] satisfies DataTableColumn<any>[]}
        rowKey={(r: any) => r.id}
        caption="Compliance disposal review"
        loading={loading}
        error={error}
        onRetry={load}
        onRefresh={load}
        searchableText={(r: any) => `${r.documentTitle} ${r.reason} ${r.decidedBy} ${r.decisionNotes} ${r.status}`}
        searchPlaceholder="Search disposal requests..."
        filters={<select aria-label="Disposal status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-control border border-slate-300 bg-white px-3 text-sm text-slate-700">{statuses.map((status) => <option key={status || 'ALL'} value={status}>{status || 'All statuses'}</option>)}</select>}
        activeFilters={statusFilter ? [{ id: 'status', label: 'Status', value: statusFilter, onRemove: () => setStatusFilter('') }] : []}
        onClearFilters={() => setStatusFilter('')}
        emptyTitle="No disposal requests"
        emptyDescription="No disposal requests are available."
        filteredEmptyTitle="No disposal requests match the current filters"
        rowActions={(r: any) => String(r.status || '').toUpperCase() === 'PENDING' ? <DataTableRowActions row={r} label={`Actions for ${r.documentTitle || 'disposal request'}`} actions={[
          { id: 'approve', label: 'Approve disposal', icon: CheckCircle2, onSelect: () => { setDecision({ req: r, approve: true }); setNotes(''); } },
          { id: 'reject', label: 'Reject disposal', icon: Ban, destructive: true, onSelect: () => { setDecision({ req: r, approve: false }); setNotes(''); } },
        ]} /> : <span className="text-xs font-semibold text-slate-500">Decided</span>}
      />

      {decision && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => !saving && setDecision(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className={`p-2 rounded-xl border ${decision.approve ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                  {decision.approve ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Ban className="w-4 h-4 text-rose-500" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{decision.approve ? 'Approve Disposal' : 'Reject Disposal'}</h3>
                  <p className="text-[11px] text-slate-400">{decision.req.documentTitle}</p>
                </div>
              </div>
              <button onClick={() => setDecision(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            {decision.approve && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                Approving will permanently soft-delete the document. This cannot be undone from this screen.
              </p>
            )}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase">Decision Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div className="flex justify-end space-x-2 pt-1">
              <ActionButton onClick={() => setDecision(null)} disabled={saving}>Cancel</ActionButton>
              <ActionButton onClick={submit} icon={decision.approve ? CheckCircle2 : Ban}
                variant={decision.approve ? 'primary' : 'danger'} disabled={saving}>
                {saving ? 'Submitting…' : (decision.approve ? 'Approve' : 'Reject')}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const CoComplianceAlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/compliance/alerts');
      setAlerts(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (id: string, path: string, label: string) => {
    setBusyId(id);
    try {
      await mutate(`/api/v1/compliance/alerts/${id}/${path}`, 'POST');
      show(label);
      await load();
    } catch (err: any) {
      show(err?.message || 'Action failed', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const sevStyle = (sev?: string) => {
    switch ((sev || '').toUpperCase()) {
      case 'CRITICAL': return { bar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-600', icon: ShieldAlert, iconColor: 'text-rose-500' };
      case 'WARNING': return { bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-600', icon: BellRing, iconColor: 'text-amber-500' };
      default: return { bar: 'bg-blue-500', chip: 'bg-blue-50 text-blue-600', icon: Bell, iconColor: 'text-blue-500' };
    }
  };

  if (loading && alerts.length === 0) return <LoadingSkeleton />;
  if (error && alerts.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      {toastNode}
      <DashboardHero title="Compliance Alerts" subtitle="Actionable alerts across contracts, documents, and disposals" actions={
        <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh compliance alerts"><RefreshCw className="h-4 w-4" /></button>
      } />

      {alerts.length === 0 ? (
        <EmptyState icon={BellRing} title="No Active Alerts" desc="You're all caught up — no open or acknowledged compliance alerts." />
      ) : (
        <div className="space-y-3">
          {alerts.map((a: any) => {
            const s = sevStyle(a.severity);
            const Icon = s.icon;
            const acknowledged = (a.status || '').toUpperCase() === 'ACKNOWLEDGED';
            return (
              <div key={a.id} className="card-stat overflow-hidden flex">
                <div className={`w-1.5 ${s.bar}`} />
                <div className="flex-1 p-4 flex items-start justify-between space-x-4">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100"><Icon className={`w-4 h-4 ${s.iconColor}`} /></div>
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <p className="text-sm font-bold text-slate-900">{a.title}</p>
                        <Badge text={a.severity} className={s.chip} />
                        {acknowledged && <Badge text="ACKNOWLEDGED" className="bg-slate-100 text-slate-500" />}
                      </div>
                      <p className="text-xs text-slate-500">{a.message}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {(a.type || '').replace(/_/g, ' ')} · {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}
                        {a.acknowledgedBy ? ` · ack by ${a.acknowledgedBy}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    {!acknowledged && (
                      <ActionButton onClick={() => runAction(a.id, 'acknowledge', 'Alert acknowledged')} icon={CheckCircle2} variant="primary" disabled={busyId === a.id}>Acknowledge</ActionButton>
                    )}
                    <ActionButton onClick={() => runAction(a.id, 'dismiss', 'Alert dismissed')} icon={X} disabled={busyId === a.id}>Dismiss</ActionButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
// End of compliance officer pages.
