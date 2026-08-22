import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle, RefreshCw, FileText, FileSignature, Archive,
  ScrollText, User, Settings, Filter, CheckCircle2, Trash2, Plus,
  X, BellRing, Bell, ShieldAlert, Ban,
} from 'lucide-react';
import { safeFetchJson, mutateJson } from '../../api/client';
import { MIN_REASON_LENGTH } from '../governance/ConfirmActionModal';

/**
 * POST/PUT helper. Delegates to `mutateJson` so the server's own sentence reaches
 * the toast.
 *
 * The previous body built this on `safeFetchJson`, which collapses every non-2xx
 * into `null`, and then threw a fixed "Request failed. Please try again." That was
 * survivable while the writes here were unconditional. It is not now: a disposal
 * raised with too short a justification comes back 422 with a message naming the
 * ten-character minimum, and flattening it to "try again" invites the user to
 * resend the same too-short reason forever while the one instruction that would
 * fix it is thrown away. `mutateJson` throws an Error carrying the server's
 * message instead, and every catch below already shows `err.message`.
 *
 * Still returns `data` rather than the envelope, because the callers in this file
 * read fields off the DTO (a disposal decision's `status`) and none of them needs
 * the envelope message on the success path.
 */
const mutate = async (url: string, method: 'POST' | 'PUT', body?: unknown) => {
  const envelope = await mutateJson(url, method, body);
  return envelope?.data;
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
    case 'UNDER_REVIEW': return 'bg-amber-50 text-amber-600';
    case 'EXPIRED': return 'bg-rose-50 text-rose-600';
    case 'TERMINATED': return 'bg-slate-100 text-slate-500';
    default: return 'bg-blue-50 text-blue-600';
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

export const CoDocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [disposalDoc, setDisposalDoc] = useState<any | null>(null);
  const [disposalReason, setDisposalReason] = useState('');
  const { show, node: toastNode } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const json = await safeFetchJson(`/api/v1/compliance/documents${qs}`);
      setDocuments(json?.data ?? []);
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
      await mutate(`/api/v1/compliance/documents/${id}/${path}`, 'POST', body);
      show(label);
      await load();
    } catch (err: any) {
      show(err?.message || 'Action failed', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const submitDisposal = async () => {
    if (!disposalDoc) return;
    const reason = disposalReason.trim();
    // Non-blank used to be the whole rule, and it no longer matches the server.
    // `ApprovalGateService.request` refuses a justification under ten trimmed
    // characters, so a reason like "expired" cleared this check and then came back
    // 422 - which the catch in runAction reports as a failed action, with nothing on
    // screen tying it to the reason box the user just filled in.
    if (reason.length < MIN_REASON_LENGTH) {
      show(`A disposal reason of at least ${MIN_REASON_LENGTH} characters is required — the approver reads it before deciding`, 'err');
      return;
    }
    const doc = disposalDoc;
    setDisposalDoc(null);
    setDisposalReason('');
    await runAction(doc.id, 'disposal', 'Disposal requested', { reason });
  };

  // Same rule the server enforces, checked while typing so the Submit button is
  // dead until the reason can actually be accepted.
  const disposalReasonTooShort = disposalReason.trim().length < MIN_REASON_LENGTH;

  const statuses = ['', 'PENDING_REVIEW', 'APPROVED', 'ARCHIVED', 'REJECTED'];

  if (loading && documents.length === 0) return <LoadingSkeleton />;
  if (error && documents.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      {toastNode}
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Documents</h2>
          <p className="text-xs text-slate-500">Records repository — approve, archive, and request disposal</p>
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
                          {status === 'PENDING_REVIEW' && (
                            <ActionButton onClick={() => runAction(d.id, 'approve', 'Document approved')} icon={CheckCircle2} variant="primary" disabled={busy}>Approve</ActionButton>
                          )}
                          {status !== 'ARCHIVED' && status !== 'DELETED' && (
                            <ActionButton onClick={() => runAction(d.id, 'archive', 'Document archived')} icon={Archive} disabled={busy}>Archive</ActionButton>
                          )}
                          {status !== 'DELETED' && (
                            <ActionButton onClick={() => { setDisposalDoc(d); setDisposalReason(''); }} icon={Trash2} variant="danger" disabled={busy}>Dispose</ActionButton>
                          )}
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

      {disposalDoc && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => setDisposalDoc(null)}>
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
              {/* States the server's minimum where the user is typing, rather than
                  letting them find it out from a 422 after the dialog has closed. */}
              <p className="text-[11px] text-slate-400 mt-1">Minimum {MIN_REASON_LENGTH} characters. This is stored with the request and read by the approver.</p>
            </div>
            <div className="flex justify-end space-x-2 pt-1">
              <ActionButton onClick={() => setDisposalDoc(null)}>Cancel</ActionButton>
              <ActionButton onClick={submitDisposal} icon={Trash2} variant="danger" disabled={disposalReasonTooShort}>Submit Request</ActionButton>
            </div>
          </div>
        </div>
      )}
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
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Contracts</h2>
          <p className="text-xs text-slate-500">Contract register with AI-assessed risk levels</p>
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
                </tr>
              </thead>
              <tbody>
                {contracts.map((c: any) => (
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

export const CoRetentionPoliciesPage: React.FC = () => {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null); // null=closed, {}=new, {...}=edit
  const [form, setForm] = useState({ name: '', description: '', retentionPeriodDays: 365, actionOnExpiry: 'REVIEW', active: true });
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
    setForm({ name: '', description: '', retentionPeriodDays: 365, actionOnExpiry: 'REVIEW', active: true });
    setEditing({});
  };
  const openEdit = (p: any) => {
    setForm({
      name: p.name ?? '', description: p.description ?? '',
      retentionPeriodDays: p.retentionPeriodDays ?? 365,
      actionOnExpiry: p.actionOnExpiry ?? 'REVIEW', active: !!p.active,
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
        actionOnExpiry: form.actionOnExpiry, active: form.active,
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
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Retention Policies</h2>
          <p className="text-xs text-slate-500">Data retention rules and expiry actions</p>
        </div>
        <div className="flex items-center space-x-2">
          <ActionButton onClick={openNew} icon={Plus} variant="primary">New Policy</ActionButton>
          <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
        </div>
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
              <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
                <ActionButton onClick={() => openEdit(p)} icon={Settings}>Edit</ActionButton>
                <ActionButton onClick={() => toggle(p)} icon={p.active ? Ban : CheckCircle2}
                  variant={p.active ? 'neutral' : 'primary'} disabled={busyId === p.id}>
                  {p.active ? 'Deactivate' : 'Activate'}
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => !saving && setEditing(null)}>
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
              <div className="grid grid-cols-2 gap-3">
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
          <p className="text-xs text-slate-500">Read-only compliance audit events (last 30 days)</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <ScrollText className="w-4 h-4 text-amber-500" />
        <span>Read-only view of system audit events for compliance oversight</span>
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
      const result = await mutate(`/api/v1/compliance/disposals/${req.id}/${approve ? 'approve' : 'reject'}`, 'POST', { notes: notes.trim() });
      // This used to say "Disposal approved — document deleted" on every approval.
      // It is one signature, not the outcome: `ComplianceService.decideDisposal`
      // records the vote through `approvalGate.decide` and only calls
      // `approvalGate.execute` once the request reaches the quorum in
      // `SensitiveAction`. Short of quorum the document is untouched and the row
      // stays PENDING, so the old message told an approver a record was gone while
      // it was still there — and an approver who believes that stops looking for it.
      // The returned DisposalStatus is the only thing that distinguishes the three
      // outcomes; the count is deliberately not assumed, because DOCUMENT_DISPOSE
      // needing one approval today is a value that will change.
      const status = String(result?.status || '').toUpperCase();
      if (status === 'APPROVED') {
        show('Disposal approved — the document has been deleted');
      } else if (status === 'REJECTED') {
        show('Disposal rejected — the document has been kept');
      } else {
        show('Your decision was recorded. The disposal is still pending further approvals — nothing has been deleted yet');
      }
      setDecision(null);
      setNotes('');
      await load();
    } catch (err: any) {
      show(err?.message || 'Decision failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const disposalStatusBadge = (status?: string) => {
    switch ((status || '').toUpperCase()) {
      case 'PENDING': return 'bg-amber-50 text-amber-600';
      case 'APPROVED': return 'bg-emerald-50 text-emerald-600';
      case 'REJECTED': return 'bg-rose-50 text-rose-600';
      default: return 'bg-slate-100 text-slate-500';
    }
  };

  const statuses = ['', 'PENDING', 'APPROVED', 'REJECTED'];

  if (loading && requests.length === 0) return <LoadingSkeleton />;
  if (error && requests.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      {toastNode}
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Disposal Approvals</h2>
          <p className="text-xs text-slate-500">Review and decide document disposal requests</p>
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
            {s || 'ALL'}
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <EmptyState icon={Trash2} title="No Disposal Requests" desc="No disposal requests match the current filter." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Document</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Reason</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Requested</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Decision</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Status</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r: any) => {
                  const pending = (r.status || '').toUpperCase() === 'PENDING';
                  return (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors align-top">
                      <td className="p-3 font-medium text-slate-900">{r.documentTitle}</td>
                      <td className="p-3 text-slate-600 text-xs max-w-xs">{r.reason || '-'}</td>
                      <td className="p-3 text-[10px] text-slate-400 font-mono">{r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}</td>
                      <td className="p-3 text-xs text-slate-600">
                        {r.decidedBy ? (
                          <div>
                            <p className="font-mono text-[11px]">{r.decidedBy}</p>
                            {r.decisionNotes && <p className="text-[11px] text-slate-400 italic">"{r.decisionNotes}"</p>}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="p-3"><Badge text={r.status} className={disposalStatusBadge(r.status)} /></td>
                      <td className="p-3">
                        <div className="flex items-center justify-end space-x-1.5">
                          {pending ? (
                            <>
                              <ActionButton onClick={() => { setDecision({ req: r, approve: true }); setNotes(''); }} icon={CheckCircle2} variant="primary">Approve</ActionButton>
                              <ActionButton onClick={() => { setDecision({ req: r, approve: false }); setNotes(''); }} icon={Ban} variant="danger">Reject</ActionButton>
                            </>
                          ) : <span className="text-[11px] text-slate-300">Decided</span>}
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

      {decision && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => !saving && setDecision(null)}>
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
            {/* Was "Approving will permanently soft-delete the document", which is
                only true on the signature that completes the quorum — on any earlier
                one it promises a deletion that does not happen. Worded to hold in
                both cases, and it names the four-eyes rule because the gate rejects
                the requester's own approval and that refusal is otherwise a surprise. */}
            {decision.approve && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                This records your approval signature. The document is permanently soft-deleted once the required
                number of signatures exists — which may be this one — and the officer who requested the disposal
                cannot be one of them. Deletion cannot be undone from this screen.
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
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Compliance Alerts</h2>
          <p className="text-xs text-slate-500">Actionable alerts across contracts, documents, and disposals</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

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

export const CoProfilePage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Profile</h2>
          <p className="text-xs text-slate-500">Compliance Officer account</p>
        </div>
      </div>
      <EmptyState icon={User} title="Profile Settings" desc="Profile management will be available via TEAM 1 - Human Resource Management integration." />
    </div>
  );
};

export const CoSettingsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Settings</h2>
          <p className="text-xs text-slate-500">Compliance Officer account and module preferences</p>
        </div>
      </div>
      <EmptyState icon={Settings} title="Settings" desc="Account and module settings will be available via TEAM 1 - Human Resource Management integration." />
    </div>
  );
};
