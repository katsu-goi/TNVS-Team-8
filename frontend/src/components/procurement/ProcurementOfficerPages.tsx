import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle, RefreshCw, FileText, FileSignature, Building2,
  ScrollText, CheckCircle2, Trash2, Plus,
  X, BellRing, Bell, ShieldAlert, Ban, Gavel, Send, PlayCircle,
  RotateCcw, Pencil, ChevronRight, Gauge, CalendarClock,
} from 'lucide-react';
import { safeFetchJson } from '../../api/client';
import { ContractAiPanel } from '../contracts/ContractAiPanel';
import { Modal as SharedModal } from '../ui/SharedUI';
import { DashboardHero } from '../ui/DashboardPrimitives';
import { DataTable, DataTableRowActions, DataTableStatusBadge, type DataTableColumn } from '../ui/data-table';

// POST/PUT helper that preserves the API envelope and propagates failures.
const mutate = async (url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) => {
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
  primary: 'bg-[#B5121B] text-white border-[#B5121B] hover:bg-[#98131B]',
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

const inputCls = 'mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200';
const labelCls = 'text-[11px] font-semibold text-slate-500 uppercase';

const contractStatusBadge = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE': return 'bg-emerald-50 text-emerald-600';
    case 'APPROVED': return 'bg-teal-50 text-teal-600';
    case 'UNDER_REVIEW': return 'bg-amber-50 text-amber-600';
    case 'DRAFT': return 'bg-blue-50 text-blue-600';
    case 'EXPIRED': return 'bg-rose-50 text-rose-600';
    case 'RENEWED': return 'bg-purple-50 text-purple-600';
    case 'TERMINATED': return 'bg-slate-100 text-slate-500';
    default: return 'bg-blue-50 text-blue-600';
  }
};

const vendorStatusBadge = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE': return 'bg-emerald-50 text-emerald-600';
    case 'PENDING_APPROVAL': return 'bg-amber-50 text-amber-600';
    case 'SUSPENDED': return 'bg-rose-50 text-rose-600';
    case 'INACTIVE': return 'bg-slate-100 text-slate-500';
    default: return 'bg-slate-100 text-slate-500';
  }
};

const obligationStatusBadge = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'COMPLETED': return 'bg-emerald-50 text-emerald-600';
    case 'IN_PROGRESS': return 'bg-blue-50 text-blue-600';
    case 'PENDING': return 'bg-amber-50 text-amber-600';
    case 'OVERDUE': return 'bg-rose-50 text-rose-600';
    default: return 'bg-slate-100 text-slate-500';
  }
};

const riskBadge = (level?: string) => {
  switch ((level || '').toUpperCase()) {
    case 'LOW': return 'bg-emerald-50 text-emerald-600';
    case 'MEDIUM': return 'bg-amber-50 text-amber-600';
    case 'HIGH': return 'bg-orange-50 text-orange-600';
    case 'CRITICAL': return 'bg-rose-50 text-rose-600';
    default: return 'bg-slate-100 text-slate-500';
  }
};

const perfColor = (score?: number | null) => {
  if (score == null) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-500';
  return 'text-rose-500';
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

const CONTRACT_TYPES = ['LEASE', 'VENDOR_SERVICE', 'MAINTENANCE_SLA', 'PROCUREMENT', 'EMPLOYMENT', 'NON_DISCLOSURE', 'PARTNERSHIP'];
const RISK_LEVELS = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VENDOR_CATEGORIES = ['IT_SERVICES', 'FACILITIES', 'PROFESSIONAL_SERVICES', 'SUPPLIES', 'LOGISTICS', 'MAINTENANCE', 'OTHER'];
const VENDOR_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_APPROVAL'];
const OBLIGATION_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'];

const Modal: React.FC<{ title: string; icon: React.ElementType; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => (
  <SharedModal open title={title} onClose={onClose} size={wide ? 'lg' : 'md'}>{children}</SharedModal>
);

// ============================================================= Contracts

export const PoContractsPage: React.FC = () => {
  const [contracts, setContracts] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null); // null=closed, {}=new, {...}=edit
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const [json, vJson] = await Promise.all([
        safeFetchJson(`/api/v1/procurement/contracts${qs}`),
        safeFetchJson('/api/v1/procurement/vendors'),
      ]);
      setContracts(json?.data ?? []);
      setVendors(vJson?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (id: string, path: string, label: string, body?: unknown) => {
    setBusyId(id);
    try {
      await mutate(`/api/v1/procurement/contracts/${id}/${path}`, 'POST', body);
      show(label);
      await load();
    } catch (err: any) {
      show(err?.message || 'Action failed', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const openNew = () => {
    setForm({ title: '', type: 'VENDOR_SERVICE', vendorId: '', counterParty: '', contractValue: '', startDate: '', endDate: '', renewalNoticeDate: '', aiAssessedRiskLevel: '', aiRiskSummary: '' });
    setEditing({});
  };
  const openEdit = (c: any) => {
    setForm({
      title: c.title ?? '', type: c.type ?? 'VENDOR_SERVICE', vendorId: c.vendorId ?? '', counterParty: c.counterParty ?? '',
      contractValue: c.contractValue ?? '', startDate: c.startDate ?? '', endDate: c.endDate ?? '',
      renewalNoticeDate: c.renewalNoticeDate ?? '', aiAssessedRiskLevel: c.aiAssessedRiskLevel ?? '',
      aiRiskSummary: c.aiRiskSummary ?? '',
    });
    setEditing(c);
  };

  const save = async () => {
    if (!form.title?.trim()) { show('Contract title is required', 'err'); return; }
    setSaving(true);
    try {
      const isEdit = editing && editing.id;
      const payload: Record<string, unknown> = {
        title: form.title.trim(), type: form.type,
        vendorId: form.vendorId || null,
        counterParty: form.counterParty?.trim() || null,
        contractValue: form.contractValue === '' ? null : form.contractValue,
        startDate: form.startDate || null, endDate: form.endDate || null,
        renewalNoticeDate: form.renewalNoticeDate || null,
      };
      const url = isEdit ? `/api/v1/procurement/contracts/${editing.id}` : '/api/v1/procurement/contracts';
      await mutate(url, isEdit ? 'PUT' : 'POST', payload);
      show(isEdit ? 'Contract updated' : 'Contract created');
      setEditing(null);
      await load();
    } catch (err: any) {
      show(err?.message || 'Save failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const statuses = ['', 'DRAFT', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'EXPIRED', 'RENEWED', 'TERMINATED'];

  if (loading && contracts.length === 0) return <LoadingSkeleton />;
  if (error && contracts.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      {toastNode}
      <DashboardHero title="Contracts" subtitle="Draft, review, approve, and manage the full contract lifecycle" actions={
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton onClick={openNew} icon={Plus} variant="primary">New Contract</ActionButton>
          <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh contracts"><RefreshCw className="h-4 w-4" /></button>
        </div>
      } />

      <DataTable
        data={contracts}
        columns={[
          { id: 'contract', header: 'Contract', sortable: true, sortValue: (c: any) => c.title, searchableValue: (c: any) => `${c.title} ${c.contractNumber} ${c.type}`, cell: (c: any) => <div><p className="font-semibold text-slate-900">{c.title || 'Untitled contract'}</p><p className="mt-1 text-xs text-slate-500">{c.contractNumber || 'No contract number'} · {(c.type || 'Not specified').replace(/_/g, ' ')}</p></div> },
          { id: 'party', header: 'Vendor / Counterparty', sortable: true, accessor: (c: any) => c.vendorName || c.counterParty || 'Not provided', sortValue: (c: any) => c.vendorName || c.counterParty },
          { id: 'value', header: 'Value', sortable: true, align: 'right', accessor: (c: any) => formatCurrency(c.contractValue), sortValue: (c: any) => Number(c.contractValue || 0) },
          { id: 'end', header: 'Expiration', sortable: true, accessor: (c: any) => c.endDate || 'Not provided', sortValue: (c: any) => c.endDate },
          { id: 'risk', header: 'AI risk', sortable: true, cell: (c: any) => <DataTableStatusBadge value={c.aiAssessedRiskLevel || 'NOT_ASSESSED'} />, sortValue: (c: any) => c.aiAssessedRiskLevel },
          { id: 'status', header: 'Status', sortable: true, cell: (c: any) => <DataTableStatusBadge value={c.status} />, sortValue: (c: any) => c.status },
        ] satisfies DataTableColumn<any>[]}
        rowKey={(c: any) => c.id}
        caption="Procurement contracts"
        loading={loading}
        error={error}
        onRetry={load}
        onRefresh={load}
        searchableText={(c: any) => `${c.title} ${c.contractNumber} ${c.type} ${c.vendorName} ${c.counterParty} ${c.status} ${c.aiAssessedRiskLevel}`}
        searchPlaceholder="Search contracts..."
        filters={<select aria-label="Contract status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-control border border-slate-300 bg-white px-3 text-sm text-slate-700">{statuses.map((status) => <option key={status || 'ALL'} value={status}>{status ? status.replace(/_/g, ' ') : 'All statuses'}</option>)}</select>}
        activeFilters={statusFilter ? [{ id: 'status', label: 'Status', value: statusFilter.replace(/_/g, ' '), onRemove: () => setStatusFilter('') }] : []}
        onClearFilters={() => setStatusFilter('')}
        emptyTitle="No contracts"
        emptyDescription="No procurement contracts are available."
        filteredEmptyTitle="No contracts match the current filters"
        rowActions={(c: any) => {
          const status = String(c.status || '').toUpperCase();
          const busy = busyId === c.id;
          return <DataTableRowActions row={c} label={`Actions for ${c.title || 'contract'}`} actions={[
            { id: 'details', label: 'View details', icon: ChevronRight, disabled: busy, onSelect: () => setDetail(c) },
            { id: 'edit', label: 'Edit contract', icon: Pencil, disabled: busy, onSelect: () => openEdit(c) },
            { id: 'submit', label: 'Submit for review', icon: Send, hidden: status !== 'DRAFT', disabled: busy, onSelect: () => runAction(c.id, 'submit-review', 'Submitted for review') },
            { id: 'activate', label: 'Activate contract', icon: PlayCircle, hidden: status !== 'APPROVED', disabled: busy, onSelect: () => runAction(c.id, 'activate', 'Contract activated') },
            { id: 'renew', label: 'Renew contract', icon: RotateCcw, hidden: !['ACTIVE', 'EXPIRED'].includes(status), disabled: busy, onSelect: () => runAction(c.id, 'renew', 'Contract renewed') },
            { id: 'terminate', label: 'Terminate contract', icon: Ban, hidden: status === 'TERMINATED', destructive: true, disabled: busy, onSelect: () => runAction(c.id, 'terminate', 'Contract terminated') },
          ]} />;
        }}
      />

      {editing && (
        <Modal title={editing.id ? 'Edit Contract' : 'New Contract'} icon={FileSignature} onClose={() => !saving && setEditing(null)} wide>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className={labelCls}>Title</label>
              <input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <select value={form.type} onChange={e => setForm((f: any) => ({ ...f, type: e.target.value }))} className={`${inputCls} bg-white`}>
                {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Vendor</label>
              <select value={form.vendorId} onChange={e => setForm((f: any) => ({ ...f, vendorId: e.target.value }))} className={`${inputCls} bg-white`}>
                <option value="">— none —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Counterparty</label>
              <input value={form.counterParty} onChange={e => setForm((f: any) => ({ ...f, counterParty: e.target.value }))} className={inputCls} placeholder="Free-text if no vendor linked" />
            </div>
            <div>
              <label className={labelCls}>Value (USD)</label>
              <input type="number" min={0} value={form.contractValue} onChange={e => setForm((f: any) => ({ ...f, contractValue: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Start Date</label>
              <input type="date" value={form.startDate} onChange={e => setForm((f: any) => ({ ...f, startDate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <input type="date" value={form.endDate} onChange={e => setForm((f: any) => ({ ...f, endDate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Renewal Notice Date</label>
              <input type="date" value={form.renewalNoticeDate} onChange={e => setForm((f: any) => ({ ...f, renewalNoticeDate: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-1">
            <ActionButton onClick={() => setEditing(null)} disabled={saving}>Cancel</ActionButton>
            <ActionButton onClick={save} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</ActionButton>
          </div>
        </Modal>
      )}

      {detail && <ContractDetailDrawer contract={detail} onClose={() => setDetail(null)} onChanged={load} show={show} />}
    </div>
  );
};

const ContractDetailDrawer: React.FC<{ contract: any; onClose: () => void; onChanged: () => void; show: (m: string, k?: 'ok' | 'err') => void }> = ({ contract, onClose, onChanged, show }) => {
  const [full, setFull] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [clauseForm, setClauseForm] = useState<any | null>(null); // null=closed, {}=new, {...}=edit
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const json = await safeFetchJson(`/api/v1/procurement/contracts/${contract.id}`);
    setFull(json?.data ?? null);
    setLoading(false);
  }, [contract.id]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ clauseType: '', content: '', riskLevel: '', aiAnalysisNotes: '' }); setClauseForm({}); };
  const openEdit = (cl: any) => { setForm({ clauseType: cl.clauseType ?? '', content: cl.content ?? '', riskLevel: cl.riskLevel ?? '', aiAnalysisNotes: cl.aiAnalysisNotes ?? '' }); setClauseForm(cl); };

  const saveClause = async () => {
    if (!form.clauseType?.trim() || !form.content?.trim()) { show('Clause type and content are required', 'err'); return; }
    setSaving(true);
    try {
      const payload = { clauseType: form.clauseType.trim(), content: form.content.trim(), riskLevel: form.riskLevel || null, aiAnalysisNotes: form.aiAnalysisNotes?.trim() || null };
      if (clauseForm.id) await mutate(`/api/v1/procurement/clauses/${clauseForm.id}`, 'PUT', payload);
      else await mutate(`/api/v1/procurement/contracts/${contract.id}/clauses`, 'POST', payload);
      show(clauseForm.id ? 'Clause updated' : 'Clause added');
      setClauseForm(null);
      await load();
      onChanged();
    } catch (err: any) {
      show(err?.message || 'Save failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const removeClause = async (cl: any) => {
    setBusyId(cl.id);
    try {
      await mutate(`/api/v1/procurement/clauses/${cl.id}`, 'DELETE');
      show('Clause deleted');
      await load();
      onChanged();
    } catch (err: any) {
      show(err?.message || 'Delete failed', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const clauses: any[] = full?.clauses ?? [];

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto p-6 space-y-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{contract.title}</h3>
            <p className="text-xs text-slate-400 font-mono">{contract.contractNumber} · {contract.type}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className={labelCls}>Status</p><Badge text={contract.status} className={contractStatusBadge(contract.status)} /></div>
          <div><p className={labelCls}>Risk</p><Badge text={contract.aiAssessedRiskLevel} className={riskBadge(contract.aiAssessedRiskLevel)} /></div>
          <div><p className={labelCls}>Vendor</p><p className="text-slate-700">{contract.vendorName || '-'}</p></div>
          <div><p className={labelCls}>Counterparty</p><p className="text-slate-700">{contract.counterParty || '-'}</p></div>
          <div><p className={labelCls}>Value</p><p className="text-slate-700 font-mono">{formatCurrency(contract.contractValue)}</p></div>
          <div><p className={labelCls}>End</p><p className="text-slate-700 font-mono text-xs">{contract.endDate || '-'}</p></div>
        </div>
        {contract.aiRiskSummary && <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3">{contract.aiRiskSummary}</p>}

        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-slate-900">Clauses</h4>
            <ActionButton onClick={openNew} icon={Plus} variant="primary">Add Clause</ActionButton>
          </div>
          {loading ? (
            <p className="text-xs text-slate-400">Loading clauses…</p>
          ) : clauses.length === 0 ? (
            <p className="text-xs text-slate-400">No clauses recorded for this contract.</p>
          ) : (
            <div className="space-y-2">
              {clauses.map((cl: any) => (
                <div key={cl.id} className="border border-slate-100 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-semibold text-slate-800">{cl.clauseType}</p>
                      <Badge text={cl.riskLevel} className={riskBadge(cl.riskLevel)} />
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <ActionButton onClick={() => openEdit(cl)} icon={Pencil} disabled={busyId === cl.id}>Edit</ActionButton>
                      <ActionButton onClick={() => removeClause(cl)} icon={Trash2} variant="danger" disabled={busyId === cl.id}>Delete</ActionButton>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600">{cl.content}</p>
                  {cl.aiAnalysisNotes && <p className="text-[11px] text-slate-400 italic">{cl.aiAnalysisNotes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <ContractAiPanel
          contractId={contract.id}
          associatedDocumentId={full?.associatedDocumentId ?? contract.associatedDocumentId}
          onChanged={() => { void load(); onChanged(); }}
        />

        {clauseForm && (
          <Modal title={clauseForm.id ? 'Edit Clause' : 'Add Clause'} icon={FileText} onClose={() => !saving && setClauseForm(null)}>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Clause Type</label>
                <input value={form.clauseType} onChange={e => setForm((f: any) => ({ ...f, clauseType: e.target.value }))} className={inputCls} placeholder="e.g. Indemnification" />
              </div>
              <div>
                <label className={labelCls}>Content</label>
                <textarea value={form.content} onChange={e => setForm((f: any) => ({ ...f, content: e.target.value }))} rows={3} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Risk Level</label>
                <select value={form.riskLevel} onChange={e => setForm((f: any) => ({ ...f, riskLevel: e.target.value }))} className={`${inputCls} bg-white`}>
                  {RISK_LEVELS.map(r => <option key={r || 'none'} value={r}>{r || '— none —'}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Analysis Notes</label>
                <textarea value={form.aiAnalysisNotes} onChange={e => setForm((f: any) => ({ ...f, aiAnalysisNotes: e.target.value }))} rows={2} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-1">
              <ActionButton onClick={() => setClauseForm(null)} disabled={saving}>Cancel</ActionButton>
              <ActionButton onClick={saveClause} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</ActionButton>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
};

// ============================================================= Vendors

export const PoVendorsPage: React.FC = () => {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const json = await safeFetchJson(`/api/v1/procurement/vendors${qs}`);
      setVendors(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ name: '', category: 'OTHER', status: 'ACTIVE', contactName: '', contactEmail: '', contactPhone: '', address: '', notes: '' });
    setEditing({});
  };
  const openEdit = (v: any) => {
    setForm({
      name: v.name ?? '', category: v.category ?? 'OTHER', status: v.status ?? 'ACTIVE',
      contactName: v.contactName ?? '', contactEmail: v.contactEmail ?? '', contactPhone: v.contactPhone ?? '',
      address: v.address ?? '', notes: v.notes ?? '',
    });
    setEditing(v);
  };

  const save = async () => {
    if (!form.name?.trim()) { show('Vendor name is required', 'err'); return; }
    setSaving(true);
    try {
      const isEdit = editing && editing.id;
      const payload: Record<string, unknown> = {
        name: form.name.trim(), category: form.category,
        contactName: form.contactName?.trim() || null, contactEmail: form.contactEmail?.trim() || null,
        contactPhone: form.contactPhone?.trim() || null, address: form.address?.trim() || null,
        notes: form.notes?.trim() || null,
      };
      if (!isEdit) payload.status = form.status;
      const url = isEdit ? `/api/v1/procurement/vendors/${editing.id}` : '/api/v1/procurement/vendors';
      await mutate(url, isEdit ? 'PUT' : 'POST', payload);
      show(isEdit ? 'Vendor updated' : 'Vendor created');
      setEditing(null);
      await load();
    } catch (err: any) {
      show(err?.message || 'Save failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const statuses = ['', ...VENDOR_STATUSES];

  if (loading && vendors.length === 0) return <LoadingSkeleton />;
  if (error && vendors.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      {toastNode}
      <DashboardHero title="Vendors" subtitle="Supplier registry with performance & SLA tracking" actions={
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton onClick={openNew} icon={Plus} variant="primary">New Vendor</ActionButton>
          <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh vendors"><RefreshCw className="h-4 w-4" /></button>
        </div>
      } />

      <DataTable
        data={vendors}
        columns={[
          { id: 'vendor', header: 'Vendor', sortable: true, sortValue: (v: any) => v.name, searchableValue: (v: any) => `${v.name} ${v.vendorCode}`, cell: (v: any) => <div><p className="font-semibold text-slate-900">{v.name || 'Unnamed vendor'}</p><p className="mt-1 text-xs text-slate-500">{v.vendorCode || 'No vendor code'}</p></div> },
          { id: 'category', header: 'Category', sortable: true, accessor: (v: any) => (v.category || 'Not specified').replace(/_/g, ' '), sortValue: (v: any) => v.category },
          { id: 'performance', header: 'Performance', sortable: true, align: 'right', accessor: (v: any) => v.performanceScore ?? 'Not rated', sortValue: (v: any) => v.performanceScore ?? -1 },
          { id: 'sla', header: 'SLA', sortable: true, align: 'right', accessor: (v: any) => v.slaComplianceRate != null ? `${v.slaComplianceRate}%` : 'Not provided', sortValue: (v: any) => v.slaComplianceRate ?? -1 },
          { id: 'status', header: 'Status', sortable: true, cell: (v: any) => <DataTableStatusBadge value={v.status} />, sortValue: (v: any) => v.status },
        ] satisfies DataTableColumn<any>[]}
        rowKey={(v: any) => v.id}
        caption="Procurement vendors"
        loading={loading}
        error={error}
        onRetry={load}
        onRefresh={load}
        searchableText={(v: any) => `${v.name} ${v.vendorCode} ${v.category} ${v.status}`}
        searchPlaceholder="Search vendors..."
        filters={<select aria-label="Vendor status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-control border border-slate-300 bg-white px-3 text-sm text-slate-700">{statuses.map((status) => <option key={status || 'ALL'} value={status}>{status ? status.replace(/_/g, ' ') : 'All statuses'}</option>)}</select>}
        activeFilters={statusFilter ? [{ id: 'status', label: 'Status', value: statusFilter.replace(/_/g, ' '), onRemove: () => setStatusFilter('') }] : []}
        onClearFilters={() => setStatusFilter('')}
        emptyTitle="No vendors"
        emptyDescription="No vendors are available."
        filteredEmptyTitle="No vendors match the current filters"
        rowActions={(v: any) => <DataTableRowActions row={v} label={`Actions for ${v.name || 'vendor'}`} actions={[
          { id: 'manage', label: 'Manage vendor', icon: ChevronRight, onSelect: () => setDetail(v) },
          { id: 'edit', label: 'Edit vendor', icon: Pencil, onSelect: () => openEdit(v) },
        ]} />}
      />

      {editing && (
        <Modal title={editing.id ? 'Edit Vendor' : 'New Vendor'} icon={Building2} onClose={() => !saving && setEditing(null)} wide>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className={labelCls}>Name</label>
              <input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select value={form.category} onChange={e => setForm((f: any) => ({ ...f, category: e.target.value }))} className={`${inputCls} bg-white`}>
                {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            {!editing.id && (
              <div>
                <label className={labelCls}>Initial Status</label>
                <select value={form.status} onChange={e => setForm((f: any) => ({ ...f, status: e.target.value }))} className={`${inputCls} bg-white`}>
                  {VENDOR_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelCls}>Contact Name</label>
              <input value={form.contactName} onChange={e => setForm((f: any) => ({ ...f, contactName: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Contact Email</label>
              <input value={form.contactEmail} onChange={e => setForm((f: any) => ({ ...f, contactEmail: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Contact Phone</label>
              <input value={form.contactPhone} onChange={e => setForm((f: any) => ({ ...f, contactPhone: e.target.value }))} className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Address</label>
              <input value={form.address} onChange={e => setForm((f: any) => ({ ...f, address: e.target.value }))} className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-1">
            <ActionButton onClick={() => setEditing(null)} disabled={saving}>Cancel</ActionButton>
            <ActionButton onClick={save} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</ActionButton>
          </div>
        </Modal>
      )}

      {detail && <VendorDetailDrawer vendor={detail} onClose={() => setDetail(null)} onChanged={load} show={show} />}
    </div>
  );
};

const VendorDetailDrawer: React.FC<{ vendor: any; onClose: () => void; onChanged: () => void; show: (m: string, k?: 'ok' | 'err') => void }> = ({ vendor, onClose, onChanged, show }) => {
  const [full, setFull] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [oblForm, setOblForm] = useState<any | null>(null); // null=closed, {}=new, {...}=edit
  const [form, setForm] = useState<any>({});
  const [perfOpen, setPerfOpen] = useState(false);
  const [perfForm, setPerfForm] = useState<{ performanceScore: string; slaComplianceRate: string; notes: string }>({ performanceScore: '', slaComplianceRate: '', notes: '' });
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusVal, setStatusVal] = useState('ACTIVE');

  const load = useCallback(async () => {
    setLoading(true);
    const json = await safeFetchJson(`/api/v1/procurement/vendors/${vendor.id}`);
    setFull(json?.data ?? null);
    setLoading(false);
  }, [vendor.id]);

  useEffect(() => { load(); }, [load]);

  const openNewObl = () => { setForm({ title: '', description: '', dueDate: '', status: 'PENDING', notes: '' }); setOblForm({}); };
  const openEditObl = (o: any) => { setForm({ title: o.title ?? '', description: o.description ?? '', dueDate: o.dueDate ?? '', status: o.status ?? 'PENDING', notes: o.notes ?? '' }); setOblForm(o); };

  const saveObl = async () => {
    if (!form.title?.trim()) { show('Obligation title is required', 'err'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(), description: form.description?.trim() || null,
        dueDate: form.dueDate || null, notes: form.notes?.trim() || null,
      };
      if (!oblForm.id) payload.status = form.status;
      if (oblForm.id) await mutate(`/api/v1/procurement/obligations/${oblForm.id}`, 'PUT', payload);
      else await mutate(`/api/v1/procurement/vendors/${vendor.id}/obligations`, 'POST', payload);
      show(oblForm.id ? 'Obligation updated' : 'Obligation added');
      setOblForm(null);
      await load();
      onChanged();
    } catch (err: any) {
      show(err?.message || 'Save failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const changeOblStatus = async (o: any, status: string) => {
    setBusyId(o.id);
    try {
      await mutate(`/api/v1/procurement/obligations/${o.id}/status`, 'POST', { status });
      show('Obligation status updated');
      await load();
      onChanged();
    } catch (err: any) {
      show(err?.message || 'Update failed', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const removeObl = async (o: any) => {
    setBusyId(o.id);
    try {
      await mutate(`/api/v1/procurement/obligations/${o.id}`, 'DELETE');
      show('Obligation deleted');
      await load();
      onChanged();
    } catch (err: any) {
      show(err?.message || 'Delete failed', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const openPerf = () => {
    setPerfForm({
      performanceScore: full?.performanceScore != null ? String(full.performanceScore) : '',
      slaComplianceRate: full?.slaComplianceRate != null ? String(full.slaComplianceRate) : '',
      notes: '',
    });
    setPerfOpen(true);
  };
  const savePerf = async () => {
    setSaving(true);
    try {
      await mutate(`/api/v1/procurement/vendors/${vendor.id}/performance`, 'POST', {
        performanceScore: perfForm.performanceScore === '' ? null : Number(perfForm.performanceScore),
        slaComplianceRate: perfForm.slaComplianceRate === '' ? null : Number(perfForm.slaComplianceRate),
        notes: perfForm.notes?.trim() || null,
      });
      show('Performance recorded');
      setPerfOpen(false);
      await load();
      onChanged();
    } catch (err: any) {
      show(err?.message || 'Save failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const openStatus = () => { setStatusVal(full?.status ?? 'ACTIVE'); setStatusOpen(true); };
  const saveStatus = async () => {
    setSaving(true);
    try {
      await mutate(`/api/v1/procurement/vendors/${vendor.id}/status`, 'POST', { status: statusVal });
      show('Vendor status updated');
      setStatusOpen(false);
      await load();
      onChanged();
    } catch (err: any) {
      show(err?.message || 'Update failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const obligations: any[] = full?.obligations ?? [];
  const contracts: any[] = full?.contracts ?? [];

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto p-6 space-y-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{vendor.name}</h3>
            <p className="text-xs text-slate-400 font-mono">{vendor.vendorCode} · {(vendor.category || '').replace(/_/g, ' ')}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className={labelCls}>Status</p><Badge text={full?.status ?? vendor.status} className={vendorStatusBadge(full?.status ?? vendor.status)} /></div>
          <div><p className={labelCls}>Performance</p><p className={`text-sm font-bold ${perfColor(full?.performanceScore)}`}>{full?.performanceScore ?? '—'}</p></div>
          <div><p className={labelCls}>SLA Compliance</p><p className="text-slate-700 font-mono">{full?.slaComplianceRate != null ? `${full.slaComplianceRate}%` : '-'}</p></div>
          <div><p className={labelCls}>Contact</p><p className="text-slate-700 text-xs">{full?.contactName || '-'}</p></div>
        </div>
        {full?.contactEmail && <p className="text-xs text-slate-500 font-mono">{full.contactEmail}{full.contactPhone ? ` · ${full.contactPhone}` : ''}</p>}
        {full?.notes && <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3">{full.notes}</p>}

        <div className="flex items-center space-x-2">
          <ActionButton onClick={openPerf} icon={Gauge} variant="primary">Record Performance</ActionButton>
          <ActionButton onClick={openStatus} icon={ChevronRight}>Change Status</ActionButton>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Linked Contracts</h4>
          {loading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : contracts.length === 0 ? (
            <p className="text-xs text-slate-400">No contracts linked to this vendor.</p>
          ) : (
            <div className="space-y-2">
              {contracts.map((c: any) => (
                <div key={c.id} className="border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{c.title}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{c.contractNumber} · {formatCurrency(c.contractValue)}</p>
                  </div>
                  <Badge text={c.status} className={contractStatusBadge(c.status)} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-slate-900">Obligations &amp; Deliverables</h4>
            <ActionButton onClick={openNewObl} icon={Plus} variant="primary">Add</ActionButton>
          </div>
          {loading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : obligations.length === 0 ? (
            <p className="text-xs text-slate-400">No obligations recorded for this vendor.</p>
          ) : (
            <div className="space-y-2">
              {obligations.map((o: any) => (
                <div key={o.id} className="border border-slate-100 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-semibold text-slate-800">{o.title}</p>
                      <Badge text={o.status} className={obligationStatusBadge(o.status)} />
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <ActionButton onClick={() => openEditObl(o)} icon={Pencil} disabled={busyId === o.id}>Edit</ActionButton>
                      <ActionButton onClick={() => removeObl(o)} icon={Trash2} variant="danger" disabled={busyId === o.id}>Delete</ActionButton>
                    </div>
                  </div>
                  {o.description && <p className="text-xs text-slate-600">{o.description}</p>}
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-slate-400 font-mono flex items-center space-x-1"><CalendarClock className="w-3 h-3" /><span>{o.dueDate || 'no due date'}</span></p>
                    {(o.status || '').toUpperCase() !== 'COMPLETED' && (
                      <ActionButton onClick={() => changeOblStatus(o, 'COMPLETED')} icon={CheckCircle2} disabled={busyId === o.id}>Mark Complete</ActionButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {oblForm && (
          <Modal title={oblForm.id ? 'Edit Obligation' : 'Add Obligation'} icon={CalendarClock} onClose={() => !saving && setOblForm(null)}>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Title</label>
                <input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} rows={2} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => setForm((f: any) => ({ ...f, dueDate: e.target.value }))} className={inputCls} />
              </div>
              {!oblForm.id && (
                <div>
                  <label className={labelCls}>Initial Status</label>
                  <select value={form.status} onChange={e => setForm((f: any) => ({ ...f, status: e.target.value }))} className={`${inputCls} bg-white`}>
                    {OBLIGATION_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-1">
              <ActionButton onClick={() => setOblForm(null)} disabled={saving}>Cancel</ActionButton>
              <ActionButton onClick={saveObl} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</ActionButton>
            </div>
          </Modal>
        )}

        {perfOpen && (
          <Modal title="Record Performance" icon={Gauge} onClose={() => !saving && setPerfOpen(false)}>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Performance Score (0–100)</label>
                <input type="number" min={0} max={100} value={perfForm.performanceScore} onChange={e => setPerfForm(f => ({ ...f, performanceScore: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>SLA Compliance Rate (%)</label>
                <input type="number" min={0} max={100} step="0.1" value={perfForm.slaComplianceRate} onChange={e => setPerfForm(f => ({ ...f, slaComplianceRate: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea value={perfForm.notes} onChange={e => setPerfForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-1">
              <ActionButton onClick={() => setPerfOpen(false)} disabled={saving}>Cancel</ActionButton>
              <ActionButton onClick={savePerf} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</ActionButton>
            </div>
          </Modal>
        )}

        {statusOpen && (
          <Modal title="Change Vendor Status" icon={Building2} onClose={() => !saving && setStatusOpen(false)}>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>New Status</label>
                <select value={statusVal} onChange={e => setStatusVal(e.target.value)} className={`${inputCls} bg-white`}>
                  {VENDOR_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-1">
              <ActionButton onClick={() => setStatusOpen(false)} disabled={saving}>Cancel</ActionButton>
              <ActionButton onClick={saveStatus} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Update'}</ActionButton>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
};

// ============================================================= Notices

export const PoNoticesPage: React.FC = () => {
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/procurement/notices');
      setNotices(json?.data ?? []);
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
      await mutate(`/api/v1/procurement/notices/${id}/${path}`, 'POST');
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

  if (loading && notices.length === 0) return <LoadingSkeleton />;
  if (error && notices.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      {toastNode}
      <DashboardHero title="Alerts & Notices" subtitle="Renewal, expiry, SLA, performance, and obligation alerts" actions={
        <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh procurement notices"><RefreshCw className="h-4 w-4" /></button>
      } />

      {notices.length === 0 ? (
        <EmptyState icon={BellRing} title="No Active Notices" desc="You're all caught up — no open or acknowledged procurement notices." />
      ) : (
        <div className="space-y-3">
          {notices.map((a: any) => {
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
                      <ActionButton onClick={() => runAction(a.id, 'acknowledge', 'Notice acknowledged')} icon={CheckCircle2} variant="primary" disabled={busyId === a.id}>Acknowledge</ActionButton>
                    )}
                    <ActionButton onClick={() => runAction(a.id, 'dismiss', 'Notice dismissed')} icon={X} disabled={busyId === a.id}>Dismiss</ActionButton>
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

// ============================================================= Documents

export const PoDocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const json = await safeFetchJson(`/api/v1/procurement/documents${qs}`);
      setDocuments(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      await mutate(`/api/v1/procurement/documents/${id}/approve`, 'POST');
      show('Document approved');
      await load();
    } catch (err: any) {
      show(err?.message || 'Action failed', 'err');
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
      <DashboardHero title="Documents" subtitle="Contract document oversight — review and approve records" actions={
        <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh contract documents"><RefreshCw className="h-4 w-4" /></button>
      } />

      <DataTable
        data={documents}
        columns={[
          { id: 'document', header: 'Document', sortable: true, sortValue: (d: any) => d.title, searchableValue: (d: any) => `${d.title} ${d.fileName}`, cell: (d: any) => <div><p className="font-semibold text-slate-900">{d.title || 'Untitled document'}</p><p className="mt-1 max-w-52 truncate text-xs text-slate-500" title={d.fileName}>{d.fileName || 'No file name'}</p></div> },
          { id: 'classification', header: 'Classification', sortable: true, cell: (d: any) => <DataTableStatusBadge value={d.classificationLevel || 'UNCLASSIFIED'} />, sortValue: (d: any) => d.classificationLevel },
          { id: 'version', header: 'Version', align: 'right', optional: true, accessor: (d: any) => `v${d.versionNumber ?? 1}` },
          { id: 'size', header: 'Size', align: 'right', optional: true, accessor: (d: any) => formatSize(d.fileSize) },
          { id: 'status', header: 'Status', sortable: true, cell: (d: any) => <DataTableStatusBadge value={d.status} />, sortValue: (d: any) => d.status },
        ] satisfies DataTableColumn<any>[]}
        rowKey={(d: any) => d.id}
        caption="Procurement documents"
        loading={loading}
        error={error}
        onRetry={load}
        onRefresh={load}
        searchableText={(d: any) => `${d.title} ${d.fileName} ${d.classificationLevel} ${d.status}`}
        searchPlaceholder="Search procurement documents..."
        filters={<select aria-label="Document status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-control border border-slate-300 bg-white px-3 text-sm text-slate-700">{statuses.map((status) => <option key={status || 'ALL'} value={status}>{status ? status.replace(/_/g, ' ') : 'All statuses'}</option>)}</select>}
        activeFilters={statusFilter ? [{ id: 'status', label: 'Status', value: statusFilter.replace(/_/g, ' '), onRemove: () => setStatusFilter('') }] : []}
        onClearFilters={() => setStatusFilter('')}
        emptyTitle="No documents"
        emptyDescription="No procurement documents are available."
        filteredEmptyTitle="No documents match the current filters"
        rowActions={(d: any) => String(d.status || '').toUpperCase() === 'PENDING_REVIEW' ? <DataTableRowActions row={d} label={`Actions for ${d.title || 'document'}`} actions={[{ id: 'approve', label: 'Approve document', icon: CheckCircle2, disabled: busyId === d.id, onSelect: () => approve(d.id) }]} /> : <span className="text-xs font-semibold text-slate-500">No actions</span>}
      />
    </div>
  );
};

// ============================================================= Legal cases (read-only)

export const PoLegalCasesPage: React.FC = () => {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/procurement/legal-cases');
      setCases(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  if (loading && cases.length === 0) return <LoadingSkeleton />;
  if (error && cases.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <DashboardHero title="Legal Cases" subtitle="Read-only visibility into legal matters (limited access)" actions={
        <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh legal cases"><RefreshCw className="h-4 w-4" /></button>
      } />

      <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <Gavel className="w-4 h-4 text-purple-500" />
        <span>Read-only view of legal cases managed by the Legal Officer</span>
      </div>

      <DataTable
        data={cases}
        columns={[
          { id: 'case', header: 'Case', sortable: true, sortValue: (c: any) => c.title, searchableValue: (c: any) => `${c.title} ${c.caseNumber} ${c.courtName}`, cell: (c: any) => <div><p className="font-semibold text-slate-900">{c.title || 'Untitled case'}</p><p className="mt-1 text-xs text-slate-500">{c.caseNumber || 'No case number'}{c.courtName ? ` · ${c.courtName}` : ''}</p></div> },
          { id: 'type', header: 'Category', sortable: true, accessor: (c: any) => (c.caseType || 'Not specified').replace(/_/g, ' '), sortValue: (c: any) => c.caseType },
          { id: 'opposing', header: 'Opposing party', optional: true, accessor: (c: any) => c.opposingParty || 'Not provided' },
          { id: 'priority', header: 'Risk / Priority', sortable: true, cell: (c: any) => <DataTableStatusBadge value={c.priority || 'NOT_SET'} />, sortValue: (c: any) => c.priority },
          { id: 'status', header: 'Status', sortable: true, cell: (c: any) => <DataTableStatusBadge value={c.status} />, sortValue: (c: any) => c.status },
        ] satisfies DataTableColumn<any>[]}
        rowKey={(c: any) => c.id}
        caption="Read-only legal cases"
        loading={loading}
        error={error}
        onRetry={load}
        onRefresh={load}
        searchableText={(c: any) => `${c.title} ${c.caseNumber} ${c.courtName} ${c.caseType} ${c.opposingParty} ${c.priority} ${c.status}`}
        searchPlaceholder="Search visible legal cases..."
        emptyTitle="No legal cases"
        emptyDescription="No legal cases are available in the authorized procurement view."
        filteredEmptyTitle="No legal cases match your search"
      />
    </div>
  );
};

// ============================================================= Audit logs (read-only)

export const PoAuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/procurement/audit-logs');
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
      <DashboardHero title="Audit Trail" subtitle="Read-only procurement audit events (last 30 days)" actions={
        <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh procurement audit trail"><RefreshCw className="h-4 w-4" /></button>
      } />

      <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <ScrollText className="w-4 h-4 text-amber-500" />
        <span>Read-only view of system audit events for contract &amp; procurement oversight</span>
      </div>

      <DataTable
        data={logs}
        columns={[
          { id: 'time', header: 'Timestamp', sortable: true, sortValue: (a: any) => a.createdAt, accessor: (a: any) => a.createdAt ? new Date(a.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '—' },
          { id: 'actor', header: 'Actor', sortable: true, accessor: (a: any) => a.userEmail || 'Unknown actor', sortValue: (a: any) => a.userEmail },
          { id: 'action', header: 'Action', sortable: true, accessor: (a: any) => <span className="font-semibold text-slate-900">{a.action || 'Not provided'}</span>, sortValue: (a: any) => a.action },
          { id: 'module', header: 'Module', sortable: true, accessor: (a: any) => a.module || '—', sortValue: (a: any) => a.module },
          { id: 'entity', header: 'Entity', optional: true, cell: (a: any) => <div><p>{a.entityName || a.entityType || 'Not provided'}</p>{a.entityType && <p className="mt-1 text-[10px] text-slate-500">{a.entityType}</p>}</div> },
          { id: 'severity', header: 'Severity', sortable: true, cell: (a: any) => <DataTableStatusBadge value={a.severity || 'INFO'} />, sortValue: (a: any) => a.severity },
        ] satisfies DataTableColumn<any>[]}
        rowKey={(a: any) => a.id}
        caption="Procurement audit trail"
        loading={loading}
        error={error}
        onRetry={load}
        onRefresh={load}
        searchableText={(a: any) => `${a.action} ${a.entityName} ${a.entityType} ${a.module} ${a.userEmail} ${a.severity}`}
        searchPlaceholder="Search procurement audit events..."
        emptyTitle="No audit events"
        emptyDescription="No procurement audit events were recorded in the last 30 days."
        filteredEmptyTitle="No audit events match your search"
      />
    </div>
  );
};
