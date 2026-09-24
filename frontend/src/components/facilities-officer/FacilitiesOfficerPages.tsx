import React, { useEffect, useState, useCallback } from 'react';
import { AlertCircle, RefreshCw, Eye, ShieldCheck, ShieldAlert, Plus, Loader2, FileText, Bell } from 'lucide-react';
import { safeFetchJson } from '../../api/client';
import { facilitiesService } from '../../api/facilitiesService';
import { notificationService, type AppNotification } from '../../api/notificationService';
import { DocumentUploadPanel } from '../documents/DocumentUploadPanel';
import { visitorService } from '../../api/visitorService';
import { ID_TYPES } from '../../types/visitors';
import type {
  IdType, VisitorVerification, VisitorWatchlistEntry,
} from '../../types/visitors';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { useNotificationRealtimeStore } from '../../stores/notificationRealtimeStore';

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

const scoreTone = (score: number | null) => {
  if (score === null || score === undefined) return 'bg-slate-100 text-slate-500';
  if (score >= 0.9) return 'bg-rose-50 text-rose-600';
  if (score >= 0.7) return 'bg-amber-50 text-amber-600';
  return 'bg-emerald-50 text-emerald-600';
};

/**
 * Per-visitor ID verification. Reads the real visitor list from
 * `/v1/visitors` (the endpoint the read-only table above targets does not
 * exist yet) so each row carries the UUID `POST /v1/visitors/{id}/verify` needs.
 */
const VisitorVerificationSection: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [idType, setIdType] = useState<Record<string, IdType>>({});
  const [idNumber, setIdNumber] = useState<Record<string, string>>({});
  const [result, setResult] = useState<VisitorVerification | null>(null);
  const [history, setHistory] = useState<VisitorVerification[]>([]);
  const [reviewNotes, setReviewNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await visitorService.listVisitors());
    } catch (err: any) {
      setError(err?.message || 'Failed to load visitors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runVerify = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const verification = await visitorService.verifyVisitor(
        id, idType[id] || 'DRIVERS_LICENSE', idNumber[id]?.trim() || undefined,
      );
      setResult(verification);
      setHistory(await visitorService.listVerifications(id));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Verification failed');
    } finally {
      setBusyId(null);
    }
  };

  const review = async (decision: 'CLEAR' | 'BLOCK') => {
    if (!result || !reviewNotes.trim()) return;
    setBusyId(result.visitorId);
    setError(null);
    try {
      const reviewed = await visitorService.reviewVisitor(result.visitorId, result.id, decision, reviewNotes.trim());
      setResult(reviewed);
      setHistory(await visitorService.listVerifications(result.visitorId));
      setReviewNotes('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Review failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card-stat p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-900">ID Verification &amp; Watchlist Screening</h3>
        </div>
        <button onClick={load} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition">
          <RefreshCw className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {loading ? (
        <p className="text-xs text-slate-400">Loading visitors…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400">No registered visitors to verify.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="p-2 text-[10px] font-semibold text-slate-500 uppercase">Visitor</th>
                <th className="p-2 text-[10px] font-semibold text-slate-500 uppercase">ID Type</th>
                <th className="p-2 text-[10px] font-semibold text-slate-500 uppercase">ID Number</th>
                <th className="p-2 text-[10px] font-semibold text-slate-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v: any) => (
                <tr key={v.id} className="border-b border-slate-50">
                  <td className="p-2">
                    <p className="font-medium text-slate-900">{v.fullName}</p>
                    <p className="text-[10px] text-slate-400">{v.company || '—'} · {v.status}</p>
                  </td>
                  <td className="p-2">
                    <select
                      value={idType[v.id] || 'DRIVERS_LICENSE'}
                      onChange={e => setIdType(s => ({ ...s, [v.id]: e.target.value as IdType }))}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white"
                    >
                      {ID_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      value={idNumber[v.id] ?? (v.idNumber || '')}
                      onChange={e => setIdNumber(s => ({ ...s, [v.id]: e.target.value }))}
                      placeholder="N02-18-998412"
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 w-40 font-mono"
                    />
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => runVerify(v.id)}
                      disabled={busyId === v.id}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold inline-flex items-center space-x-1 disabled:opacity-50"
                    >
                      {busyId === v.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <ShieldCheck className="w-3 h-3" />}
                      <span>Verify</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div className={`rounded-xl border p-4 space-y-3 ${
          result.clearanceState === 'BLOCKED'
            ? 'border-rose-200 bg-rose-50/50'
            : result.clearanceState === 'REVIEW_REQUIRED'
              ? 'border-amber-200 bg-amber-50/50'
              : 'border-emerald-200 bg-emerald-50/50'
        }`}>
          <div className="flex items-center space-x-2">
            {result.watchlistStatus === 'FLAGGED'
              ? <ShieldAlert className="w-4 h-4 text-rose-600" />
              : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
            <p className="hidden">
              {result.watchlistStatus === 'FLAGGED' ? 'Watchlist match — escalate' : 'Cleared'}
            </p>
            <p className="text-sm font-bold text-slate-900">{result.clearanceState.replace(/_/g, ' ')}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div><p className="text-slate-400 text-[10px] uppercase">Verification</p><p className="font-mono">{result.verificationStatus}</p></div>
            <div><p className="text-slate-400 text-[10px] uppercase">Watchlist</p><p className="font-mono">{result.watchlistStatus}</p></div>
            <div><p className="text-slate-400 text-[10px] uppercase">Automated</p><p className="font-mono">{result.automatedClearance}</p></div>
            <div><p className="text-slate-400 text-[10px] uppercase">Effective</p><p className="font-mono">{result.clearanceState}</p></div>
            <div>
              <p className="text-slate-400 text-[10px] uppercase">Match Score</p>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${scoreTone(result.matchScore)}`}>
                {result.matchScore ?? '—'}
              </span>
            </div>
            <div><p className="text-slate-400 text-[10px] uppercase">Verified By</p><p className="font-mono truncate">{result.verifiedBy || '—'}</p></div>
          </div>

          {result.notes && <p className="text-xs text-slate-600">{result.notes}</p>}

          {result.clearanceState === 'REVIEW_REQUIRED' && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-white p-3">
              <p className="text-[10px] font-bold uppercase text-amber-700">Authorized manual review</p>
              <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2}
                placeholder="Required review notes" className="w-full rounded-lg border border-slate-200 p-2 text-xs" />
              <div className="flex gap-2">
                <button disabled={!reviewNotes.trim() || busyId === result.visitorId} onClick={() => review('CLEAR')}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">Clear</button>
                <button disabled={!reviewNotes.trim() || busyId === result.visitorId} onClick={() => review('BLOCK')}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">Block</button>
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase text-slate-400 mb-1">Extracted Fields</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-[11px] font-mono text-slate-600">
              {Object.entries(result.extractedFields || {}).map(([k, val]) => (
                <div key={k} className="truncate">
                  <span className="text-slate-400">{k}: </span>{String(val ?? '—')}
                </div>
              ))}
            </div>
          </div>

          {history.length > 0 && (
            <div>
              <p className="text-[10px] uppercase text-slate-400 mb-1">History (newest first)</p>
              <ul className="space-y-1">
                {history.map(h => (
                  <li key={h.id} className="text-[11px] text-slate-600 flex items-center space-x-2">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      h.watchlistStatus === 'FLAGGED' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>{h.clearanceState}</span>
                    <span className="font-mono">{h.matchScore ?? '—'}</span>
                    <span className="text-slate-400">{h.verifiedAt ? new Date(h.verifiedAt).toLocaleString() : '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Watchlist management: list entries, add a new one, activate/deactivate. */
const VisitorWatchlistSection: React.FC = () => {
  const [entries, setEntries] = useState<VisitorWatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: '', idNumber: '', reason: '', severity: 'HIGH' as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await visitorService.listWatchlist());
    } catch (err: any) {
      setError(err?.message || 'Failed to load watchlist');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.fullName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await visitorService.addWatchlistEntry(
        form.fullName.trim(), form.idNumber.trim() || undefined, form.reason.trim() || undefined,
        form.severity,
      );
      setForm({ fullName: '', idNumber: '', reason: '', severity: 'HIGH' });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to add entry');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (entry: VisitorWatchlistEntry) => {
    setError(null);
    try {
      await visitorService.updateWatchlistStatus(
        entry.id, entry.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      );
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update entry');
    }
  };

  return (
    <div className="card-stat p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-4 h-4 text-rose-500" />
          <h3 className="text-sm font-bold text-slate-900">Visitor Watchlist</h3>
        </div>
        <button onClick={load} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition">
          <RefreshCw className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={form.fullName}
          onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
          placeholder="Full name *"
          className="text-xs border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-[160px]"
        />
        <input
          value={form.idNumber}
          onChange={e => setForm(f => ({ ...f, idNumber: e.target.value }))}
          placeholder="ID number"
          className="text-xs border border-slate-200 rounded-lg px-3 py-2 w-40 font-mono"
        />
        <input
          value={form.reason}
          onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
          placeholder="Reason"
          className="text-xs border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-[160px]"
        />
        <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as typeof f.severity }))}
          className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white">
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <button
          onClick={add}
          disabled={saving || !form.fullName.trim()}
          className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[11px] font-semibold inline-flex items-center space-x-1 disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          <span>Add</span>
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading watchlist…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-slate-400">The watchlist is empty.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="p-2 text-[10px] font-semibold text-slate-500 uppercase">Name</th>
                <th className="p-2 text-[10px] font-semibold text-slate-500 uppercase">ID Number</th>
                <th className="p-2 text-[10px] font-semibold text-slate-500 uppercase">Reason</th>
                <th className="p-2 text-[10px] font-semibold text-slate-500 uppercase">Severity</th>
                <th className="p-2 text-[10px] font-semibold text-slate-500 uppercase">Status</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-slate-50">
                  <td className="p-2 font-medium text-slate-900">{e.fullName}</td>
                  <td className="p-2 text-slate-600 font-mono text-xs">{e.idNumber || '—'}</td>
                  <td className="p-2 text-slate-600 text-xs">{e.reason || '—'}</td>
                  <td className="p-2 text-slate-600 text-xs font-mono">{e.severity}</td>
                  <td className="p-2">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                      e.status === 'ACTIVE' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
                    }`}>{e.status}</span>
                  </td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => toggle(e)}
                      className="px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      {e.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const FoVisitorManagementPage: React.FC = () => {
  const [visitors, setVisitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const revision = useRealtimeSyncStore(s => s.revision);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/visitors');
      setVisitors(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (revision > 0) setRetry(r => r + 1); }, [revision]);

  const updateVisit = async (visitor: any, action: 'check-in' | 'check-out') => {
    setError(null);
    try {
      if (action === 'check-in') await visitorService.checkIn(visitor.id);
      else await visitorService.checkOut(visitor.id);
      setRetry(r => r + 1);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || `Unable to ${action} visitor`);
    }
  };

  if (loading && visitors.length === 0) return <LoadingSkeleton />;
  if (error && visitors.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Visitor Management</h2>
          <p className="text-xs text-slate-500">View facility-linked visitors</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <Eye className="w-4 h-4 text-amber-500" />
        <span>Server-validated clearance, entry, departure, and visitor audit workflow</span>
      </div>

      {visitors.length === 0 ? (
        <EmptyState icon={Eye} title="No Visitors" desc="No facility-linked visitors found." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Visitor</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Company</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Facility</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Check-In</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Status</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Clearance</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {visitors.map((v: any) => (
                  <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-medium text-slate-900">{v.fullName || v.name}</td>
                    <td className="p-3 text-slate-600">{v.company || '-'}</td>
                    <td className="p-3 text-slate-600">{v.facilityName || v.facility || '-'}</td>
                    <td className="p-3 text-xs text-slate-400 font-mono">{v.actualArrival || v.expectedArrival ? new Date(v.actualArrival || v.expectedArrival).toLocaleString() : '-'}</td>
                    <td className="p-3">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        v.status === 'CHECKED_IN' ? 'bg-emerald-50 text-emerald-600' :
                        v.status === 'EXPECTED' ? 'bg-blue-50 text-blue-600' :
                        v.status === 'CHECKED_OUT' ? 'bg-slate-100 text-slate-500' :
                        'bg-amber-50 text-amber-600'
                      }`}>{v.status}</span>
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        v.clearanceState === 'CLEAR' ? 'bg-emerald-50 text-emerald-700' :
                        v.clearanceState === 'BLOCKED' ? 'bg-rose-50 text-rose-700' :
                        'bg-amber-50 text-amber-700'
                      }`}>{v.clearanceState?.replace(/_/g, ' ') || 'VERIFICATION REQUIRED'}</span>
                    </td>
                    <td className="p-3">
                      {v.status === 'REGISTERED' && (
                        <button onClick={() => updateVisit(v, 'check-in')} disabled={v.clearanceState !== 'CLEAR'}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Check in</button>
                      )}
                      {v.status === 'CHECKED_IN' && (
                        <button onClick={() => updateVisit(v, 'check-out')}
                          className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-[10px] font-semibold text-white">Check out</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Task 4 additions - verification and watchlist screening. */}
      <VisitorVerificationSection />
      <VisitorWatchlistSection />
    </div>
  );
};

export const FoDocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [documentCategory, setDocumentCategory] = useState('GENERAL_FACILITY_DOCUMENT');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/documents');
      setDocuments(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  if (loading && documents.length === 0) return <LoadingSkeleton />;
  if (error && documents.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Facility Documents</h2>
          <p className="text-xs text-slate-500">Upload and view facility-related documents</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      <DocumentUploadPanel
        documentCategory={documentCategory}
        onDocumentCategoryChange={setDocumentCategory}
        documentCategoryOptions={[
          'GENERAL_FACILITY_DOCUMENT',
          "MAYOR'S_BUSINESS_PERMIT",
          'FIRE_SAFETY_CLEARANCE',
          'SANITARY_CERTIFICATE',
          'LTFRB_CPC',
          'GOVERNMENT_MEMO_CIRCULAR',
        ]}
        onUploaded={async (uploaded) => {
          try {
            await facilitiesService.routeFacilityDocument({
              documentId: uploaded.id,
              documentCategory,
            });
            setRetry(r => r + 1);
          } catch (err: any) {
            setError(err?.message || 'Document uploaded but routing failed');
          }
        }}
      />

      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="No Documents" desc="No facility-related documents have been uploaded." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Name</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Type</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Uploaded By</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Date</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Size</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d: any) => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-medium text-slate-900">{d.title || d.name}</td>
                    <td className="p-3 text-slate-600">{d.fileType || d.type || '-'}</td>
                    <td className="p-3 text-slate-600">{d.ownerEmail || d.uploadedBy || '-'}</td>
                    <td className="p-3 text-xs text-slate-400 font-mono">{d.createdAt || d.uploadedAt ? new Date(d.createdAt || d.uploadedAt).toLocaleDateString() : '-'}</td>
                    <td className="p-3 text-xs text-slate-400">{d.fileSize || d.size ? `${(d.fileSize ?? d.size ?? 0)} bytes` : '-'}</td>
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

export const FoNotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const revision = useNotificationRealtimeStore(state => state.revision);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNotifications(await notificationService.getNotifications());
    } catch (e: any) { setError(e?.response?.data?.message || e?.message || 'Failed to load notifications.'); }
    finally { setLoading(false); }
  }, [retry]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (revision > 0) setRetry(value => value + 1); }, [revision]);

  if (loading && notifications.length === 0) return <LoadingSkeleton />;

  const typeColors: Record<string, string> = {
    NEW: 'border-l-amber-400',
    APPROVED: 'border-l-emerald-400',
    MAINTENANCE: 'border-l-blue-400',
    VISITOR: 'border-l-purple-400',
    REJECTED: 'border-l-rose-400',
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Notifications</h2>
          <p className="text-xs text-slate-500">Real-time facility updates</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      {error ? <ErrorState message={error} onRetry={() => setRetry(value => value + 1)} /> : notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No Notifications" desc="No facility notifications yet." />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className={`card-stat p-3 flex items-start space-x-3 border-l-4 ${typeColors[n.type] || 'border-l-slate-300'}`}>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">{new Date(n.createdAt).toLocaleString('en-PH')}</p>
              </div>
              {!n.read && <button onClick={async () => { await notificationService.markNotificationRead(n.id); setNotifications(rows => rows.map(row => row.id === n.id ? { ...row, read: true } : row)); }} className="rounded-lg border border-emerald-200 px-2 py-1 text-[11px] font-bold text-emerald-700">Mark read</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
