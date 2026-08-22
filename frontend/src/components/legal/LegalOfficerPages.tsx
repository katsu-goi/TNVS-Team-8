import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle, RefreshCw, FileText, FileSignature, Archive,
  ScrollText, User, Settings, Filter, CheckCircle2, Trash2, Plus,
  X, BellRing, Bell, ShieldAlert, Ban, Gavel, Send, PlayCircle,
  RotateCcw, Pencil, ChevronRight,
} from 'lucide-react';
import { safeFetchJson, mutateJson } from '../../api/client';
import { ConfirmActionModal, pendingApprovalMessage } from '../governance/ConfirmActionModal';

/**
 * Every write on these pages goes through here.
 *
 * The previous body called `safeFetchJson`, which returns `null` for any non-2xx, and
 * so had nothing left to report but a single invented sentence: "Request failed.
 * Please try again." That is the worst possible thing to say in front of the approval
 * gate, because the gate's refusals are all instructions - "Delete legal clause needs
 * a written reason before it can be requested", "You raised this request, so you
 * cannot also approve it", "Your role is not permitted to approve termination of a
 * contract. Required: LEGAL_COUNSEL or DEPARTMENT_HEAD." Told to try again, the user
 * repeats the identical call and it fails identically; the control looks broken
 * instead of deliberate. `mutateJson` throws with the server's own sentence, and the
 * `catch` blocks below already surface `err.message`, so they now say something true.
 *
 * Still returns `.data`, so the ~15 callers here are untouched. The two governed sites
 * call `mutateJson` directly because they need `.message` as well as the data.
 */
const mutate = async (url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) =>
  (await mutateJson(url, method, body)).data;

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
    <button onClick={onRetry} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center space-x-2">
      <RefreshCw className="w-4 h-4" /><span>Retry</span>
    </button>
  </div>
);

const Badge: React.FC<{ text?: string; className: string }> = ({ text, className }) => (
  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${className}`}>{text || '-'}</span>
);

type ActionVariant = 'primary' | 'neutral' | 'danger';
const actionClasses: Record<ActionVariant, string> = {
  primary: 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700',
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

const docStatusBadge = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED': return 'bg-emerald-50 text-emerald-600';
    case 'PENDING_REVIEW': return 'bg-amber-50 text-amber-600';
    case 'ARCHIVED': return 'bg-slate-100 text-slate-500';
    case 'REJECTED': return 'bg-rose-50 text-rose-600';
    default: return 'bg-blue-50 text-blue-600';
  }
};

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

const caseStatusBadge = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'OPEN': return 'bg-blue-50 text-blue-600';
    case 'IN_PROGRESS': return 'bg-amber-50 text-amber-600';
    case 'PENDING_HEARING': return 'bg-orange-50 text-orange-600';
    case 'SETTLED': return 'bg-emerald-50 text-emerald-600';
    case 'CLOSED': return 'bg-slate-100 text-slate-500';
    case 'APPEALED': return 'bg-purple-50 text-purple-600';
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
const CASE_TYPES = ['LITIGATION', 'CONTRACT_DISPUTE', 'REGULATORY', 'EMPLOYMENT', 'INTELLECTUAL_PROPERTY', 'COMPLIANCE_INVESTIGATION', 'OTHER'];
const CASE_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING_HEARING', 'SETTLED', 'CLOSED', 'APPEALED'];
const CASE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const Modal: React.FC<{ title: string; icon: React.ElementType; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, icon: Icon, onClose, children, wide }) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
    <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6 space-y-4 max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100"><Icon className="w-4 h-4 text-emerald-500" /></div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      </div>
      {children}
    </div>
  </div>
);

// ============================================================= Contracts

export const LoContractsPage: React.FC = () => {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null); // null=closed, {}=new, {...}=edit
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [terminating, setTerminating] = useState<any | null>(null); // contract awaiting the reason for a termination request
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const json = await safeFetchJson(`/api/v1/legal/contracts${qs}`);
      setContracts(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Still correct for submit-review, approve, activate and renew: those four really do
  // change the contract, so a fixed label and a reload describe what happened. Terminate
  // no longer belongs here - see requestTermination.
  const runAction = async (id: string, path: string, label: string, body?: unknown) => {
    setBusyId(id);
    try {
      await mutate(`/api/v1/legal/contracts/${id}/${path}`, 'POST', body);
      show(label);
      await load();
    } catch (err: any) {
      show(err?.message || 'Action failed', 'err');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Raises a termination request. Does not terminate the contract.
   *
   * The button used to call `runAction(c.id, 'terminate', 'Contract terminated')`, which
   * was wrong twice over. It sent no body, and the gate rejects a request with no
   * justification, so the call was a guaranteed 422 the user never saw. And "Contract
   * terminated" was untrue even on a 200: CONTRACT_TERMINATE needs two approvals from
   * LEGAL_COUNSEL or DEPARTMENT_HEAD before ContractTerminateExecutor touches the status.
   */
  const requestTermination = async (reason: string) => {
    if (!terminating) return;
    const id = terminating.id;
    setBusyId(id);
    try {
      const env = await mutateJson(`/api/v1/legal/contracts/${id}/terminate`, 'POST', { reason });
      setTerminating(null);
      show(pendingApprovalMessage(env, 'Terminate contract'));
      // Reload, but expect nothing to move: the row comes back ACTIVE and still offering
      // Terminate. Faking the TERMINATED badge or hiding the button would assert an
      // outcome the approvers have not granted, and the next reload would contradict it.
      await load();
    } catch (err: any) {
      show(err?.message || 'Action failed', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const openNew = () => {
    setForm({ title: '', type: 'VENDOR_SERVICE', counterParty: '', contractValue: '', startDate: '', endDate: '', renewalNoticeDate: '', aiAssessedRiskLevel: '', aiRiskSummary: '' });
    setEditing({});
  };
  const openEdit = (c: any) => {
    setForm({
      title: c.title ?? '', type: c.type ?? 'VENDOR_SERVICE', counterParty: c.counterParty ?? '',
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
        title: form.title.trim(), type: form.type, counterParty: form.counterParty?.trim() || null,
        contractValue: form.contractValue === '' ? null : form.contractValue,
        startDate: form.startDate || null, endDate: form.endDate || null,
        renewalNoticeDate: form.renewalNoticeDate || null,
        aiAssessedRiskLevel: form.aiAssessedRiskLevel || null,
        aiRiskSummary: form.aiRiskSummary?.trim() || null,
      };
      const url = isEdit ? `/api/v1/legal/contracts/${editing.id}` : '/api/v1/legal/contracts';
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
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Contracts</h2>
          <p className="text-xs text-slate-500">Draft, review, approve, and manage the contract lifecycle</p>
        </div>
        <div className="flex items-center space-x-2">
          <ActionButton onClick={openNew} icon={Plus} variant="primary">New Contract</ActionButton>
          <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
        </div>
      </div>

      <div className="flex items-center space-x-2 flex-wrap gap-y-2">
        <Filter className="w-4 h-4 text-slate-400" />
        {statuses.map(s => (
          <button key={s || 'ALL'} onClick={() => setStatusFilter(s)}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === s ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'
            }`}>
            {s ? s.replace('_', ' ') : 'ALL'}
          </button>
        ))}
      </div>

      {contracts.length === 0 ? (
        <EmptyState icon={FileSignature} title="No Contracts" desc="No contracts match the current filter." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Contract</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Counterparty</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Value</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">End Date</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Risk</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Status</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c: any) => {
                  const status = (c.status || '').toUpperCase();
                  const busy = busyId === c.id;
                  return (
                    <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <p className="font-medium text-slate-900">{c.title}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{c.contractNumber} · {c.type}</p>
                      </td>
                      <td className="p-3 text-slate-600">{c.counterParty || '-'}</td>
                      <td className="p-3 text-slate-600 font-mono text-xs">{formatCurrency(c.contractValue)}</td>
                      <td className="p-3 text-xs text-slate-400 font-mono">{c.endDate || '-'}</td>
                      <td className="p-3"><Badge text={c.aiAssessedRiskLevel} className={riskBadge(c.aiAssessedRiskLevel)} /></td>
                      <td className="p-3"><Badge text={c.status} className={contractStatusBadge(c.status)} /></td>
                      <td className="p-3">
                        <div className="flex items-center justify-end space-x-1.5 flex-wrap gap-y-1">
                          <ActionButton onClick={() => setDetail(c)} icon={ChevronRight} disabled={busy}>Details</ActionButton>
                          <ActionButton onClick={() => openEdit(c)} icon={Pencil} disabled={busy}>Edit</ActionButton>
                          {status === 'DRAFT' && <ActionButton onClick={() => runAction(c.id, 'submit-review', 'Submitted for review')} icon={Send} variant="primary" disabled={busy}>Submit</ActionButton>}
                          {status === 'UNDER_REVIEW' && <ActionButton onClick={() => runAction(c.id, 'approve', 'Contract approved')} icon={CheckCircle2} variant="primary" disabled={busy}>Approve</ActionButton>}
                          {status === 'APPROVED' && <ActionButton onClick={() => runAction(c.id, 'activate', 'Contract activated')} icon={PlayCircle} variant="primary" disabled={busy}>Activate</ActionButton>}
                          {(status === 'ACTIVE' || status === 'EXPIRED') && <ActionButton onClick={() => runAction(c.id, 'renew', 'Contract renewed')} icon={RotateCcw} disabled={busy}>Renew</ActionButton>}
                          {status !== 'TERMINATED' && <ActionButton onClick={() => setTerminating(c)} icon={Ban} variant="danger" disabled={busy}>Terminate</ActionButton>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
              <label className={labelCls}>Counterparty</label>
              <input value={form.counterParty} onChange={e => setForm((f: any) => ({ ...f, counterParty: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Value (USD)</label>
              <input type="number" min={0} value={form.contractValue} onChange={e => setForm((f: any) => ({ ...f, contractValue: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Risk Level</label>
              <select value={form.aiAssessedRiskLevel} onChange={e => setForm((f: any) => ({ ...f, aiAssessedRiskLevel: e.target.value }))} className={`${inputCls} bg-white`}>
                {RISK_LEVELS.map(r => <option key={r || 'none'} value={r}>{r || '— none —'}</option>)}
              </select>
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
            <div className="md:col-span-2">
              <label className={labelCls}>Risk Summary</label>
              <textarea value={form.aiRiskSummary} onChange={e => setForm((f: any) => ({ ...f, aiRiskSummary: e.target.value }))} rows={2} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-1">
            <ActionButton onClick={() => setEditing(null)} disabled={saving}>Cancel</ActionButton>
            <ActionButton onClick={save} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</ActionButton>
          </div>
        </Modal>
      )}

      {terminating && (
        <ConfirmActionModal
          title="Terminate Contract"
          targetLabel={`${terminating.contractNumber || ''} · ${terminating.title}`}
          consequence="Early termination usually carries a financial penalty, so legal and the budget owner both have to agree."
          reasonPlaceholder="Why must this contract end before its end date? Both approvers read this before signing."
          icon={Ban}
          busy={busyId === terminating.id}
          onCancel={() => setTerminating(null)}
          onConfirm={requestTermination}
        />
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
  const [deletingClause, setDeletingClause] = useState<any | null>(null); // clause awaiting the reason for a deletion request

  const load = useCallback(async () => {
    setLoading(true);
    const json = await safeFetchJson(`/api/v1/legal/contracts/${contract.id}`);
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
      if (clauseForm.id) await mutate(`/api/v1/legal/clauses/${clauseForm.id}`, 'PUT', payload);
      else await mutate(`/api/v1/legal/contracts/${contract.id}/clauses`, 'POST', payload);
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

  /**
   * Raises a deletion request for a clause. Does not delete it.
   *
   * This was the least guarded write on the page: `Delete` fired the DELETE straight
   * away with no dialog and no reason, then said "Clause deleted". Neither half holds
   * now - the gate answers 422 to a request carrying no justification, and on a 200 the
   * clause is untouched until a LEGAL_COUNSEL approves LEGAL_CLAUSE_DELETE.
   *
   * The reason goes in the query string, not a DELETE body: the handler reads either
   * (`@RequestBody(required=false)` / `@RequestParam`), but some proxies strip bodies
   * from DELETE, and a stripped reason arrives at the gate as no reason at all.
   */
  const requestClauseDeletion = async (reason: string) => {
    if (!deletingClause) return;
    const id = deletingClause.id;
    setBusyId(id);
    try {
      const env = await mutateJson(`/api/v1/legal/clauses/${id}?reason=${encodeURIComponent(reason)}`, 'DELETE');
      setDeletingClause(null);
      show(pendingApprovalMessage(env, 'Delete legal clause'));
      // The clause deliberately stays in the list. Dropping it from local state would
      // read as a completed deletion, and reopening the drawer would bring it back.
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
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
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
          <div><p className={labelCls}>Counterparty</p><p className="text-slate-700">{contract.counterParty || '-'}</p></div>
          <div><p className={labelCls}>Value</p><p className="text-slate-700 font-mono">{formatCurrency(contract.contractValue)}</p></div>
          <div><p className={labelCls}>Start</p><p className="text-slate-700 font-mono text-xs">{contract.startDate || '-'}</p></div>
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
                      <ActionButton onClick={() => setDeletingClause(cl)} icon={Trash2} variant="danger" disabled={busyId === cl.id}>Delete</ActionButton>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600">{cl.content}</p>
                  {cl.aiAnalysisNotes && <p className="text-[11px] text-slate-400 italic">{cl.aiAnalysisNotes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

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

        {deletingClause && (
          <ConfirmActionModal
            title="Delete Legal Clause"
            targetLabel={`${deletingClause.clauseType || 'Clause'} · ${contract.title}`}
            consequence="Clauses are referenced by live contracts; removing one changes what those contracts mean."
            reasonPlaceholder="Why should this clause no longer bind the parties? Legal counsel reads this before signing."
            icon={Trash2}
            busy={busyId === deletingClause.id}
            onCancel={() => setDeletingClause(null)}
            onConfirm={requestClauseDeletion}
          />
        )}
      </div>
    </div>
  );
};

// ============================================================= Legal cases

export const LoLegalCasesPage: React.FC = () => {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [statusChange, setStatusChange] = useState<any | null>(null);
  const [statusForm, setStatusForm] = useState<{ status: string; notes: string }>({ status: 'OPEN', notes: '' });
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const json = await safeFetchJson(`/api/v1/legal/cases${qs}`);
      setCases(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ title: '', description: '', caseType: 'OTHER', priority: 'MEDIUM', status: 'OPEN', courtName: '', judgeName: '', opposingParty: '', filingDate: '', expectedResolutionDate: '' });
    setEditing({});
  };
  const openEdit = (c: any) => {
    setForm({
      title: c.title ?? '', description: c.description ?? '', caseType: c.caseType ?? 'OTHER',
      priority: c.priority ?? 'MEDIUM', courtName: c.courtName ?? '', judgeName: c.judgeName ?? '',
      opposingParty: c.opposingParty ?? '', filingDate: c.filingDate ?? '', expectedResolutionDate: c.expectedResolutionDate ?? '',
    });
    setEditing(c);
  };

  const save = async () => {
    if (!form.title?.trim()) { show('Case title is required', 'err'); return; }
    setSaving(true);
    try {
      const isEdit = editing && editing.id;
      const payload: Record<string, unknown> = {
        title: form.title.trim(), description: form.description?.trim() || null, caseType: form.caseType,
        priority: form.priority, courtName: form.courtName?.trim() || null, judgeName: form.judgeName?.trim() || null,
        opposingParty: form.opposingParty?.trim() || null, filingDate: form.filingDate || null,
        expectedResolutionDate: form.expectedResolutionDate || null,
      };
      if (!isEdit) payload.status = form.status;
      const url = isEdit ? `/api/v1/legal/cases/${editing.id}` : '/api/v1/legal/cases';
      await mutate(url, isEdit ? 'PUT' : 'POST', payload);
      show(isEdit ? 'Case updated' : 'Case created');
      setEditing(null);
      await load();
    } catch (err: any) {
      show(err?.message || 'Save failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const openStatus = (c: any) => { setStatusForm({ status: c.status ?? 'OPEN', notes: c.resolutionNotes ?? '' }); setStatusChange(c); };
  const submitStatus = async () => {
    if (!statusChange) return;
    setSaving(true);
    try {
      await mutate(`/api/v1/legal/cases/${statusChange.id}/status`, 'POST', { status: statusForm.status, notes: statusForm.notes?.trim() || null });
      show('Case status updated');
      setStatusChange(null);
      await load();
    } catch (err: any) {
      show(err?.message || 'Update failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const statuses = ['', ...CASE_STATUSES];

  if (loading && cases.length === 0) return <LoadingSkeleton />;
  if (error && cases.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      {toastNode}
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Legal Cases</h2>
          <p className="text-xs text-slate-500">Track litigation, disputes, and investigations</p>
        </div>
        <div className="flex items-center space-x-2">
          <ActionButton onClick={openNew} icon={Plus} variant="primary">New Case</ActionButton>
          <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
        </div>
      </div>

      <div className="flex items-center space-x-2 flex-wrap gap-y-2">
        <Filter className="w-4 h-4 text-slate-400" />
        {statuses.map(s => (
          <button key={s || 'ALL'} onClick={() => setStatusFilter(s)}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === s ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'
            }`}>
            {s ? s.replace('_', ' ') : 'ALL'}
          </button>
        ))}
      </div>

      {cases.length === 0 ? (
        <EmptyState icon={Gavel} title="No Legal Cases" desc="No cases match the current filter." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Case</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Type</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Opposing</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Priority</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Status</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c: any) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="p-3">
                      <p className="font-medium text-slate-900">{c.title}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{c.caseNumber}{c.courtName ? ` · ${c.courtName}` : ''}</p>
                    </td>
                    <td className="p-3 text-slate-600 text-xs">{(c.caseType || '').replace(/_/g, ' ')}</td>
                    <td className="p-3 text-slate-600">{c.opposingParty || '-'}</td>
                    <td className="p-3"><Badge text={c.priority} className={riskBadge(c.priority)} /></td>
                    <td className="p-3"><Badge text={c.status} className={caseStatusBadge(c.status)} /></td>
                    <td className="p-3">
                      <div className="flex items-center justify-end space-x-1.5">
                        <ActionButton onClick={() => openEdit(c)} icon={Pencil}>Edit</ActionButton>
                        <ActionButton onClick={() => openStatus(c)} icon={ChevronRight} variant="primary">Status</ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit Case' : 'New Legal Case'} icon={Gavel} onClose={() => !saving && setEditing(null)} wide>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className={labelCls}>Title</label>
              <input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Case Type</label>
              <select value={form.caseType} onChange={e => setForm((f: any) => ({ ...f, caseType: e.target.value }))} className={`${inputCls} bg-white`}>
                {CASE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select value={form.priority} onChange={e => setForm((f: any) => ({ ...f, priority: e.target.value }))} className={`${inputCls} bg-white`}>
                {CASE_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {!editing.id && (
              <div>
                <label className={labelCls}>Initial Status</label>
                <select value={form.status} onChange={e => setForm((f: any) => ({ ...f, status: e.target.value }))} className={`${inputCls} bg-white`}>
                  {CASE_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelCls}>Opposing Party</label>
              <input value={form.opposingParty} onChange={e => setForm((f: any) => ({ ...f, opposingParty: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Court Name</label>
              <input value={form.courtName} onChange={e => setForm((f: any) => ({ ...f, courtName: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Judge Name</label>
              <input value={form.judgeName} onChange={e => setForm((f: any) => ({ ...f, judgeName: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Filing Date</label>
              <input type="date" value={form.filingDate} onChange={e => setForm((f: any) => ({ ...f, filingDate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Expected Resolution</label>
              <input type="date" value={form.expectedResolutionDate} onChange={e => setForm((f: any) => ({ ...f, expectedResolutionDate: e.target.value }))} className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Description</label>
              <textarea value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} rows={3} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-1">
            <ActionButton onClick={() => setEditing(null)} disabled={saving}>Cancel</ActionButton>
            <ActionButton onClick={save} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</ActionButton>
          </div>
        </Modal>
      )}

      {statusChange && (
        <Modal title="Change Case Status" icon={Gavel} onClose={() => !saving && setStatusChange(null)}>
          <p className="text-[11px] text-slate-400 font-mono">{statusChange.caseNumber} · {statusChange.title}</p>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>New Status</label>
              <select value={statusForm.status} onChange={e => setStatusForm(f => ({ ...f, status: e.target.value }))} className={`${inputCls} bg-white`}>
                {CASE_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Resolution / Notes</label>
              <textarea value={statusForm.notes} onChange={e => setStatusForm(f => ({ ...f, notes: e.target.value }))} rows={3} className={inputCls}
                placeholder="Optional notes recorded with the status change" />
            </div>
            {(statusForm.status === 'CLOSED' || statusForm.status === 'SETTLED') && (
              <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">Moving to {statusForm.status} will stamp the closed date to today.</p>
            )}
          </div>
          <div className="flex justify-end space-x-2 pt-1">
            <ActionButton onClick={() => setStatusChange(null)} disabled={saving}>Cancel</ActionButton>
            <ActionButton onClick={submitStatus} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Update'}</ActionButton>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============================================================= Legal notices

export const LoLegalNoticesPage: React.FC = () => {
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
      const json = await safeFetchJson('/api/v1/legal/notices');
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
      await mutate(`/api/v1/legal/notices/${id}/${path}`, 'POST');
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
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Legal Notices</h2>
          <p className="text-xs text-slate-500">Actionable alerts across contracts, clauses, and cases</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      {notices.length === 0 ? (
        <EmptyState icon={BellRing} title="No Active Notices" desc="You're all caught up — no open or acknowledged legal notices." />
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

export const LoDocumentsPage: React.FC = () => {
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
      const json = await safeFetchJson(`/api/v1/legal/documents${qs}`);
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
      await mutate(`/api/v1/legal/documents/${id}/approve`, 'POST');
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
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Documents</h2>
          <p className="text-xs text-slate-500">Legal document oversight — review and approve records</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      <div className="flex items-center space-x-2 flex-wrap gap-y-2">
        <Filter className="w-4 h-4 text-slate-400" />
        {statuses.map(s => (
          <button key={s || 'ALL'} onClick={() => setStatusFilter(s)}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === s ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'
            }`}>
            {s ? s.replace('_', ' ') : 'ALL'}
          </button>
        ))}
      </div>

      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="No Documents" desc="No documents match the current filter." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Title</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Classification</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Version</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Size</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Status</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d: any) => {
                  const status = (d.status || '').toUpperCase();
                  const busy = busyId === d.id;
                  return (
                    <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <p className="font-medium text-slate-900">{d.title}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{d.fileName}</p>
                      </td>
                      <td className="p-3"><Badge text={d.classificationLevel} className="bg-slate-100 text-slate-600" /></td>
                      <td className="p-3 text-slate-600 font-mono text-xs">v{d.versionNumber ?? 1}</td>
                      <td className="p-3 text-xs text-slate-400">{formatSize(d.fileSize)}</td>
                      <td className="p-3"><Badge text={d.status} className={docStatusBadge(d.status)} /></td>
                      <td className="p-3">
                        <div className="flex items-center justify-end space-x-1.5">
                          {status === 'PENDING_REVIEW' ? (
                            <ActionButton onClick={() => approve(d.id)} icon={CheckCircle2} variant="primary" disabled={busy}>Approve</ActionButton>
                          ) : <span className="text-[11px] text-slate-300">No actions</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================= Retention (read-only)

export const LoRetentionPage: React.FC = () => {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/legal/retention-policies');
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

  if (loading && policies.length === 0) return <LoadingSkeleton />;
  if (error && policies.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Retention Policies</h2>
          <p className="text-xs text-slate-500">Read-only view of records-retention rules and expiry actions</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <Archive className="w-4 h-4 text-purple-500" />
        <span>Read-only visibility into records-retention policies managed by Compliance</span>
      </div>

      {policies.length === 0 ? (
        <EmptyState icon={Archive} title="No Retention Policies" desc="No retention policies have been defined." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {policies.map((p: any) => (
            <div key={p.id} className="card-stat p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-xl bg-purple-50 border border-purple-100"><Archive className="w-4 h-4 text-purple-500" /></div>
                  <p className="text-sm font-bold text-slate-900">{p.name}</p>
                </div>
                <Badge text={p.active ? 'ACTIVE' : 'INACTIVE'} className={p.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'} />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{p.description || 'No description'}</p>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Retention</p>
                  <p className="text-xs font-mono text-slate-700">{formatDays(p.retentionPeriodDays)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">On Expiry</p>
                  <p className="text-xs font-mono text-slate-700">{p.actionOnExpiry || '-'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================= Audit logs (read-only)

export const LoAuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/legal/audit-logs');
      setLogs(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  const severityBadge = (sev?: string) => {
    switch ((sev || '').toUpperCase()) {
      case 'CRITICAL': return 'bg-rose-50 text-rose-600';
      case 'HIGH': return 'bg-orange-50 text-orange-600';
      case 'WARNING': case 'MEDIUM': return 'bg-amber-50 text-amber-600';
      default: return 'bg-slate-100 text-slate-500';
    }
  };

  if (loading && logs.length === 0) return <LoadingSkeleton />;
  if (error && logs.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Audit Trail</h2>
          <p className="text-xs text-slate-500">Read-only legal audit events (last 30 days)</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <ScrollText className="w-4 h-4 text-amber-500" />
        <span>Read-only view of system audit events for legal oversight</span>
      </div>

      {logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="No Audit Events" desc="No audit events recorded in the last 30 days." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Action</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Entity</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Module</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">User</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Severity</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((a: any) => (
                  <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-medium text-slate-900">{a.action}</td>
                    <td className="p-3 text-slate-600">
                      <p className="text-xs">{a.entityName || a.entityType || '-'}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{a.entityType}</p>
                    </td>
                    <td className="p-3 text-slate-600 text-xs">{a.module || '-'}</td>
                    <td className="p-3 text-slate-600 text-xs font-mono">{a.userEmail || '-'}</td>
                    <td className="p-3"><Badge text={a.severity} className={severityBadge(a.severity)} /></td>
                    <td className="p-3 text-[10px] text-slate-400 font-mono">{a.createdAt ? new Date(a.createdAt).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================= Profile / Settings

export const LoProfilePage: React.FC = () => (
  <div className="space-y-6">
    <div className="glass-panel p-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Profile</h2>
        <p className="text-xs text-slate-500">Legal Officer account</p>
      </div>
    </div>
    <EmptyState icon={User} title="Profile Settings" desc="Profile management will be available via TEAM 1 - Human Resource Management integration." />
  </div>
);

export const LoSettingsPage: React.FC = () => (
  <div className="space-y-6">
    <div className="glass-panel p-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Settings</h2>
        <p className="text-xs text-slate-500">Legal Officer account and module preferences</p>
      </div>
    </div>
    <EmptyState icon={Settings} title="Settings" desc="Account and module settings will be available via TEAM 1 - Human Resource Management integration." />
  </div>
);
