import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle, RefreshCw, Bell, User, Eye,
  Settings, ShieldCheck, ShieldAlert, Plus, Loader2,
  ScanLine, XCircle, Camera, UserCheck, CheckCircle2, MapPin, Clock3,
} from 'lucide-react';
import { safeFetchJson, extractErrorMessage } from '../../api/client';
import { facilitiesService } from '../../api/facilitiesService';
import { notificationService, type AppNotification } from '../../api/notificationService';
import { DocumentUploadPanel } from '../documents/DocumentUploadPanel';
import { visitorService } from '../../api/visitorService';
import { ID_TYPES } from '../../types/visitors';
import type {
  IdType, VisitorVerification, VisitorWatchlistEntry,
} from '../../types/visitors';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { reservationPortalService } from '../../api/reservationPortalService';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { useNotificationRealtimeStore } from '../../stores/notificationRealtimeStore';
import { DashboardHero } from '../ui/DashboardPrimitives';
import { DataTable, DataTableStatusBadge, type DataTableColumn } from '../ui/data-table';

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
  const [denyTarget, setDenyTarget] = useState<any | null>(null);
  const [denialReason, setDenialReason] = useState('');
  const [denySaving, setDenySaving] = useState(false);
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

  const runVerifyAndAllow = async (visitor: any) => {
    setBusyId(visitor.id);
    setError(null);
    try {
      const response = await visitorService.verifyAndAllow(visitor.id, idType[visitor.id] || 'DRIVERS_LICENSE', idNumber[visitor.id]?.trim() || undefined);
      const verification = response.verification as VisitorVerification;
      setResult(verification);
      setRows(current => current.map(row => row.id === visitor.id ? { ...row, ...response.visitor } : row));
      setHistory(await visitorService.listVerifications(visitor.id));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Visitor could not be allowed');
    } finally {
      setBusyId(null);
    }
  };

  const runDeny = async () => {
    if (!denyTarget || !denialReason.trim()) return;
    setDenySaving(true);
    setError(null);
    try {
      const denied = await visitorService.denyVisitor(denyTarget.id, denialReason.trim());
      setRows(current => current.map(row => row.id === denyTarget.id ? { ...row, ...denied } : row));
      setDenyTarget(null);
      setDenialReason('');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Visitor could not be denied');
    } finally {
      setDenySaving(false);
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
      if (decision === 'CLEAR') await visitorService.checkIn(result.visitorId);
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

      <DataTable
        data={rows}
        rowKey={(row: any) => row.id}
        caption="Visitor identity verification queue"
        loading={loading}
        error={error}
        onRetry={() => void load()}
        columns={[
          { id: 'visitor', header: 'Visitor', searchableValue: (row: any) => `${row.fullName ?? ''} ${row.company ?? ''}`, cell: (row: any) => <><p className="font-medium text-slate-900">{row.fullName}</p><p className="text-xs text-slate-500">{row.company || '—'}</p></>, sortable: true },
          { id: 'status', header: 'Status', cell: (row: any) => <DataTableStatusBadge value={row.status} />, searchableValue: (row: any) => row.status, sortable: true },
          { id: 'idType', header: 'ID type', cell: (row: any) => <select aria-label={`ID type for ${row.fullName}`} value={idType[row.id] || 'DRIVERS_LICENSE'} onChange={event => setIdType(current => ({ ...current, [row.id]: event.target.value as IdType }))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">{ID_TYPES.map(type => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}</select> },
          { id: 'idNumber', header: 'ID number', cell: (row: any) => <input aria-label={`ID number for ${row.fullName}`} value={idNumber[row.id] ?? (row.idNumber || '')} onChange={event => setIdNumber(current => ({ ...current, [row.id]: event.target.value }))} placeholder="N02-18-998412" className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs" /> },
        ] satisfies DataTableColumn<any>[]}
        searchableText={(row: any) => `${row.fullName ?? ''} ${row.company ?? ''} ${row.status ?? ''} ${row.idNumber ?? ''}`}
        searchPlaceholder="Search verification queue…"
        paginationEnabled={false}
        rowActions={(row: any) => <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => void runVerifyAndAllow(row)} disabled={busyId === row.id || row.status === 'DENIED' || row.status === 'CHECKED_IN'} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{busyId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}Verify &amp; allow</button><button type="button" onClick={() => setDenyTarget(row)} disabled={busyId === row.id || row.status === 'DENIED' || row.status === 'CHECKED_OUT'} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><ShieldAlert className="h-3.5 w-3.5" />Deny / flag</button></div>}
        emptyTitle="No registered visitors"
        emptyDescription="There are no visitors waiting for identity verification."
      />

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

      {denyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="text-base font-bold text-slate-900">Deny / Flag Visitor</h3><p className="mt-1 text-xs text-slate-500">{denyTarget.fullName || denyTarget.name}</p></div>
              <button type="button" onClick={() => setDenyTarget(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close denial dialog"><XCircle className="h-5 w-5" /></button>
            </div>
            <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Denial reason</label>
            <textarea value={denialReason} onChange={event => setDenialReason(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10" placeholder="e.g. Mismatched ID or Security Watchlist Match" />
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setDenyTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="button" onClick={() => void runDeny()} disabled={denySaving || !denialReason.trim()} className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-50">{denySaving && <Loader2 className="h-4 w-4 animate-spin" />}Confirm denial</button></div>
          </div>
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

      <DataTable
        data={entries}
        rowKey={(row) => row.id}
        caption="Visitor watchlist"
        loading={loading}
        columns={[
          { id: 'name', header: 'Name', accessor: (row) => row.fullName, sortable: true },
          { id: 'idNumber', header: 'ID number', accessor: (row) => row.idNumber || '—', sortable: true },
          { id: 'reason', header: 'Reason', accessor: (row) => row.reason || '—' },
          { id: 'severity', header: 'Severity', accessor: (row) => <DataTableStatusBadge value={row.severity} />, searchableValue: (row) => row.severity, sortable: true },
          { id: 'status', header: 'Status', accessor: (row) => <DataTableStatusBadge value={row.status} />, searchableValue: (row) => row.status, sortable: true },
        ] satisfies DataTableColumn<VisitorWatchlistEntry>[]}
        searchableText={(row) => `${row.fullName} ${row.idNumber ?? ''} ${row.reason ?? ''} ${row.severity} ${row.status}`}
        searchPlaceholder="Search watchlist…"
        paginationEnabled={false}
        rowActions={(row) => <button type="button" onClick={() => void toggle(row)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">{row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>}
        emptyTitle="Watchlist empty"
        emptyDescription="No visitor watchlist entries are configured."
      />
    </div>
  );
};

export const FoVisitorManagementPage: React.FC = () => {
  const [visitors, setVisitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [occupancy, setOccupancy] = useState({ current: 0, maxCapacity: 1, rate: 0 });
  const [checkOutId, setCheckOutId] = useState<string | null>(null);
  const revision = useRealtimeSyncStore(s => s.revision);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [json, liveOccupancy] = await Promise.all([safeFetchJson('/api/v1/visitors'), visitorService.getOccupancy()]);
      setVisitors(json?.data ?? []);
      setOccupancy(liveOccupancy);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (revision > 0) setRetry(r => r + 1); }, [revision]);

  const checkOut = async (visitorId: string) => {
    setCheckOutId(visitorId);
    setError(null);
    try {
      await visitorService.checkOut(visitorId);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Check-out failed');
    } finally {
      setCheckOutId(null);
    }
  };

  if (loading && visitors.length === 0) return <LoadingSkeleton />;
  if (error && visitors.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <DashboardHero title="Visitor Management" subtitle="Live visitor screening and occupancy control" actions={
        <div className="flex flex-wrap items-center gap-2"><span className="portal-header-badge rounded-full px-3 py-1.5 text-[11px] font-semibold">Live Hub Occupancy: {occupancy.current} / {occupancy.maxCapacity}</span><button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh visitors"><RefreshCw className="h-4 w-4" /></button></div>
      } />

      <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <Eye className="w-4 h-4 text-amber-500" />
        <span>Server-validated clearance, entry, departure, and visitor audit workflow</span>
      </div>

      <DataTable
        data={visitors}
        rowKey={(row: any) => row.id}
        caption="Facility visitors"
        loading={loading}
        error={error}
        onRetry={() => setRetry(value => value + 1)}
        columns={[
          { id: 'visitor', header: 'Visitor', accessor: (row: any) => row.fullName || row.name, sortable: true },
          { id: 'company', header: 'Company', accessor: (row: any) => row.company || '—', sortable: true },
          { id: 'facility', header: 'Facility', accessor: (row: any) => row.facilityName || row.facility || '—', sortable: true },
          { id: 'arrival', header: 'Check-in', accessor: (row: any) => row.actualArrival || row.expectedArrival ? new Date(row.actualArrival || row.expectedArrival).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '—', sortValue: (row: any) => row.actualArrival || row.expectedArrival ? new Date(row.actualArrival || row.expectedArrival) : null, sortable: true, optional: true },
          { id: 'status', header: 'Status', searchableValue: (row: any) => row.status, cell: (row: any) => <><DataTableStatusBadge value={row.status} />{row.denialReason && <p className="mt-1 max-w-xs text-xs text-rose-700">{row.denialReason}</p>}</>, sortable: true },
          { id: 'clearance', header: 'Clearance', accessor: (row: any) => <DataTableStatusBadge value={row.clearanceState || 'VERIFICATION_REQUIRED'} />, searchableValue: (row: any) => row.clearanceState, sortable: true },
        ] satisfies DataTableColumn<any>[]}
        searchableText={(row: any) => `${row.fullName ?? row.name ?? ''} ${row.company ?? ''} ${row.facilityName ?? row.facility ?? ''} ${row.status ?? ''} ${row.clearanceState ?? ''}`}
        searchPlaceholder="Search visitors…"
        onRefresh={() => setRetry(value => value + 1)}
        rowActions={(row: any) => <button type="button" onClick={() => void checkOut(row.id)} disabled={checkOutId === row.id || row.status !== 'CHECKED_IN'} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">{checkOutId === row.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Log check-out</button>}
        emptyTitle="No visitors"
        emptyDescription="No facility-linked visitors were found."
      />

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
      <DashboardHero title="Facility Documents" subtitle="Upload and view facility-related documents" actions={
        <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh facility documents"><RefreshCw className="h-4 w-4" /></button>
      } />

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

      <DataTable
        data={documents}
        rowKey={(row: any) => row.id}
        caption="Facility documents"
        loading={loading}
        error={error}
        onRetry={() => setRetry(value => value + 1)}
        columns={[
          { id: 'name', header: 'Name', accessor: (row: any) => row.title || row.name, sortable: true },
          { id: 'type', header: 'Type', accessor: (row: any) => row.fileType || row.type || '—', sortable: true },
          { id: 'owner', header: 'Uploaded by', accessor: (row: any) => row.ownerEmail || row.uploadedBy || '—', sortable: true },
          { id: 'date', header: 'Date', accessor: (row: any) => row.createdAt || row.uploadedAt ? new Date(row.createdAt || row.uploadedAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : '—', sortValue: (row: any) => row.createdAt || row.uploadedAt ? new Date(row.createdAt || row.uploadedAt) : null, sortable: true },
          { id: 'size', header: 'Size', accessor: (row: any) => row.fileSize || row.size ? `${row.fileSize ?? row.size ?? 0} bytes` : '—', sortValue: (row: any) => row.fileSize ?? row.size ?? 0, sortable: true, align: 'right' },
        ] satisfies DataTableColumn<any>[]}
        searchableText={(row: any) => `${row.title ?? row.name ?? ''} ${row.fileType ?? row.type ?? ''} ${row.ownerEmail ?? row.uploadedBy ?? ''}`}
        searchPlaceholder="Search documents…"
        onRefresh={() => setRetry(value => value + 1)}
        emptyTitle="No documents"
        emptyDescription="No facility-related documents have been uploaded."
      />
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
      <DashboardHero title="Notifications" subtitle="Real-time facility updates" actions={
        <button onClick={() => setRetry(r => r + 1)} className="portal-header-action rounded-lg p-2" aria-label="Refresh notifications"><RefreshCw className="h-4 w-4" /></button>
      } />

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

type QrCheckInResult = {
  inviteeEmail: string;
  checkedIn: boolean;
  checkedInAt?: string;
  checkedOutAt?: string;
  title: string;
  startTime: string;
  status: string;
  facilityName: string;
};

type QrScanRecord = QrCheckInResult & { scannedAt: string };

function qrTokenFromValue(rawValue: string): string {
  const value = rawValue.trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    const queryToken = url.searchParams.get('token')?.trim();
    if (queryToken) return queryToken;
    const segments = url.pathname.split('/').filter(Boolean);
    const guestPassIndex = segments.findIndex((segment) => segment.toLowerCase() === 'guest-pass');
    return guestPassIndex >= 0 ? decodeURIComponent(segments[guestPassIndex + 1] ?? '').trim() : value;
  } catch {
    return value;
  }
}

function qrDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export const QrCheckInPage: React.FC = () => {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const controlsRef = React.useRef<IScannerControls | null>(null);
  const scanLockRef = React.useRef(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<QrCheckInResult | null>(null);
  const [history, setHistory] = useState<QrScanRecord[]>([]);
  const [scanMode, setScanMode] = useState<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN');

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  const checkIn = useCallback(async (rawValue: string) => {
    const token = qrTokenFromValue(rawValue);
    if (!token || scanLockRef.current) return;
    scanLockRef.current = true;
    stopCamera();
    setProcessing(true);
    setError('');
    try {
      const scanResult = (scanMode === 'CHECK_IN'
        ? await reservationPortalService.checkInPass(token)
        : await reservationPortalService.checkOutPass(token)) as QrCheckInResult;
      setResult(scanResult);
      setHistory((current) => [{ ...scanResult, scannedAt: new Date().toISOString() }, ...current].slice(0, 8));
      setManualToken('');
    } catch (checkInError) {
      setError(extractErrorMessage(checkInError));
    } finally {
      setProcessing(false);
      scanLockRef.current = false;
    }
  }, [scanMode, stopCamera]);

  const startCamera = useCallback(async () => {
    if (!videoRef.current || cameraActive) return;
    setCameraError('');
    setError('');
    setResult(null);
    try {
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        (scanResult) => { if (scanResult) void checkIn(scanResult.getText()); },
      );
      setCameraActive(true);
    } catch (cameraException) {
      setCameraError(cameraException instanceof Error ? cameraException.message : 'Camera access was unavailable.');
      stopCamera();
    }
  }, [cameraActive, checkIn, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div className="space-y-6">
      <DashboardHero title="QR Guest Check-in" subtitle="Scan a Team 8 digital pass to record guest arrival or departure." actions={
        <div className="portal-header-badge flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold"><ShieldCheck className="h-3.5 w-3.5" />Facilities Officer control</div>
      } />

      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm"><span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Scan mode</span><button type="button" onClick={() => setScanMode('CHECK_IN')} className={`rounded-lg px-3 py-2 text-xs font-bold ${scanMode === 'CHECK_IN' ? 'bg-red-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Check-In</button><button type="button" onClick={() => setScanMode('CHECK_OUT')} className={`rounded-lg px-3 py-2 text-xs font-bold ${scanMode === 'CHECK_OUT' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Check-Out</button></div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">Camera scanner</h3><p className="mt-1 text-xs text-slate-500">Current action: <span className="font-bold text-red-700">{scanMode === 'CHECK_IN' ? 'Check-In' : 'Check-Out'}</span></p></div>{cameraActive ? <button type="button" onClick={stopCamera} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><XCircle className="h-4 w-4" />Stop camera</button> : <button type="button" onClick={() => void startCamera()} disabled={processing} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-800 disabled:opacity-60"><Camera className="h-4 w-4" />Start camera</button>}</div>
          <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-950"><video ref={videoRef} className={cameraActive ? 'h-full w-full object-cover' : 'hidden'} muted playsInline />{!cameraActive && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-white/60"><ScanLine className="h-10 w-10 text-white/40" /><p className="text-sm">Camera is paused</p><p className="max-w-xs text-xs text-white/40">Start the camera or use the secure token fallback below.</p></div>}</div>
          {cameraError && <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{cameraError} You can still use manual token entry.</span></div>}
          <form onSubmit={(event) => { event.preventDefault(); void checkIn(manualToken); }} className="mt-5 flex flex-col gap-2 sm:flex-row"><input value={manualToken} onChange={(event) => setManualToken(event.target.value)} placeholder="Paste QR pass URL or token" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-700 focus:ring-2 focus:ring-red-700/10" /><button type="submit" disabled={processing || !manualToken.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}{scanMode === 'CHECK_IN' ? 'Check in pass' : 'Check out pass'}</button></form>
          {(error || processing) && <div className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>{error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}<span>{error || `Verifying pass and recording ${scanMode === 'CHECK_IN' ? 'check-in' : 'check-out'}...`}</span></div>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{result ? <><div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5" />Pass {result.checkedIn ? 'checked in' : 'checked out'}</div><div className="mt-5 space-y-4"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Invitee</p><p className="mt-1 text-sm font-bold text-slate-900">{result.inviteeEmail}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Reservation</p><p className="mt-1 text-sm font-bold text-slate-900">{result.title}</p></div><div className="space-y-2 rounded-xl bg-slate-50 p-4 text-xs text-slate-600"><p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-red-700" />{result.facilityName}</p><p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-red-700" />{qrDateTime(result.startTime)}</p><p className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{result.checkedIn ? `Checked in ${qrDateTime(result.checkedInAt ?? '')}` : `Checked out ${qrDateTime(result.checkedOutAt ?? '')}`}</p></div></div></> : <div className="flex min-h-[260px] flex-col items-center justify-center text-center"><UserCheck className="h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">No pass scanned yet</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">A successful scan displays the guest and reservation details here.</p></div>}</section>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">Recent scans</h3><p className="mt-1 text-xs text-slate-500">This list is kept in the current officer session.</p></div><button type="button" onClick={() => setHistory([])} disabled={history.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" />Clear</button></div>
        <DataTable
          data={history}
          rowKey={(row) => `${row.inviteeEmail}-${row.scannedAt}`}
          caption="Recent QR pass scans"
          columns={[
            { id: 'guest', header: 'Guest', accessor: (row) => row.inviteeEmail, sortable: true },
            { id: 'reservation', header: 'Reservation', accessor: (row) => row.title, sortable: true },
            { id: 'location', header: 'Location', accessor: (row) => row.facilityName, sortable: true },
            { id: 'scanned', header: 'Scanned', accessor: (row) => qrDateTime(row.scannedAt), sortValue: (row) => new Date(row.scannedAt), sortable: true },
          ] satisfies DataTableColumn<QrScanRecord>[]}
          searchableText={(row) => `${row.inviteeEmail} ${row.title} ${row.facilityName}`}
          searchPlaceholder="Search recent scans…"
          paginationEnabled={false}
          emptyTitle="No recent scans"
          emptyDescription="No QR passes have been scanned during this officer session."
        />
      </div>
    </div>
  );
};
