import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle, RefreshCw, Calendar, FileText, Bell, User, Eye,
  Building2, Settings, ShieldCheck, ShieldAlert, Plus, Loader2,
} from 'lucide-react';
import { safeFetchJson } from '../../api/client';
import { facilitiesService } from '../../api/facilitiesService';
import { DocumentUploadPanel } from '../documents/DocumentUploadPanel';
import { visitorService } from '../../api/visitorService';
import { ID_TYPES } from '../../types/visitors';
import type {
  IdType, VisitorVerification, VisitorWatchlistEntry,
} from '../../types/visitors';

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

export const FoReservationsPage: React.FC = () => {
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await safeFetchJson('/api/v1/facilities-officer/reservations');
      setReservations(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  if (loading && reservations.length === 0) return <LoadingSkeleton />;
  if (error && reservations.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Facilities Reservation</h2>
          <p className="text-xs text-slate-500">Manage room and vehicle bay bookings</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <Building2 className="w-4 h-4 text-emerald-600" />
        <span>Full transactional access: Create, Read, Update reservations (approvals escalated to Facilities Manager)</span>
      </div>

      {reservations.length === 0 ? (
        <EmptyState icon={Calendar} title="No Reservations" desc="No reservations have been created yet." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Title</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Requester</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Room/Bay</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Date/Time</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-medium text-slate-900">{r.title}</td>
                    <td className="p-3 text-slate-600">{r.requesterName || r.employeeName || '-'}</td>
                    <td className="p-3 text-slate-600">{r.roomName || r.bay || '-'}</td>
                    <td className="p-3 text-slate-600">
                      <p className="text-xs">{new Date(r.startTime).toLocaleDateString()}</p>
                      <p className="text-[10px] text-slate-400">{new Date(r.startTime).toLocaleTimeString()} - {new Date(r.endTime).toLocaleTimeString()}</p>
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        r.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' :
                        r.status === 'PENDING' ? 'bg-amber-50 text-amber-600' :
                        r.status === 'REJECTED' ? 'bg-rose-50 text-rose-600' :
                        'bg-slate-100 text-slate-500'
                      }`}>{r.status}</span>
                    </td>
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
          result.watchlistStatus === 'FLAGGED'
            ? 'border-rose-200 bg-rose-50/50'
            : 'border-emerald-200 bg-emerald-50/50'
        }`}>
          <div className="flex items-center space-x-2">
            {result.watchlistStatus === 'FLAGGED'
              ? <ShieldAlert className="w-4 h-4 text-rose-600" />
              : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
            <p className="text-sm font-bold text-slate-900">
              {result.watchlistStatus === 'FLAGGED' ? 'Watchlist match — escalate' : 'Cleared'}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div><p className="text-slate-400 text-[10px] uppercase">Verification</p><p className="font-mono">{result.verificationStatus}</p></div>
            <div><p className="text-slate-400 text-[10px] uppercase">Watchlist</p><p className="font-mono">{result.watchlistStatus}</p></div>
            <div>
              <p className="text-slate-400 text-[10px] uppercase">Match Score</p>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${scoreTone(result.matchScore)}`}>
                {result.matchScore ?? '—'}
              </span>
            </div>
            <div><p className="text-slate-400 text-[10px] uppercase">Verified By</p><p className="font-mono truncate">{result.verifiedBy || '—'}</p></div>
          </div>

          {result.notes && <p className="text-xs text-slate-600">{result.notes}</p>}

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
                    }`}>{h.watchlistStatus}</span>
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
  const [form, setForm] = useState({ fullName: '', idNumber: '', reason: '' });
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
      );
      setForm({ fullName: '', idNumber: '', reason: '' });
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
        <span>Read-only view of visitors associated with facility visits</span>
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
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await safeFetchJson('/api/v1/notifications');
      setNotifications(json?.data ?? []);
    } catch {} finally { setLoading(false); }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

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

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No Notifications" desc="No facility notifications yet." />
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any) => (
            <div key={n.id} className={`card-stat p-3 flex items-start space-x-3 border-l-4 ${typeColors[n.type] || 'border-l-slate-300'}`}>
              <div className="flex-1">
                <p className="text-sm text-slate-900">{n.message || n.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{n.details || n.relatedEntityType || ''}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">{n.timestamp || n.createdAt ? new Date(n.timestamp || n.createdAt).toLocaleString() : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const FoProfilePage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Profile</h2>
          <p className="text-xs text-slate-500">Facilities Officer account</p>
        </div>
      </div>
      <EmptyState icon={User} title="Profile Settings" desc="Profile management will be available via TEAM 1 - Human Resource Management integration." />
    </div>
  );
};

export const FoSettingsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Settings</h2>
          <p className="text-xs text-slate-500">Facilities Officer account and module preferences</p>
        </div>
      </div>
      <EmptyState icon={Settings} title="Settings" desc="Account and module settings will be available via TEAM 1 - Human Resource Management integration." />
    </div>
  );
};
