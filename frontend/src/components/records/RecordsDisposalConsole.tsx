import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, FileWarning, Loader2, RefreshCw, Scale, ShieldCheck, Trash2, X } from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import { governanceService, RetentionDisposalQueueItem } from '../../api/governanceService';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { DashboardHero } from '../ui/DashboardPrimitives';
import { DataTable, DataTableRowActions, DataTableStatusBadge, type DataTableColumn } from '../ui/data-table';

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
};

export const RecordsDisposalConsole: React.FC = () => {
  const [items, setItems] = useState<RetentionDisposalQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [selectedItem, setSelectedItem] = useState<RetentionDisposalQueueItem | null>(null);
  const [notes, setNotes] = useState('');
  const revision = useRealtimeSyncStore((state) => state.revision);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await governanceService.getPendingDisposalQueue());
    } catch (reason) {
      setError(extractErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  useEffect(() => {
    if (!selectedItem) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyAction) setSelectedItem(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busyAction, selectedItem]);

  const closeModal = () => {
    if (busyAction) return;
    setSelectedItem(null);
    setNotes('');
  };

  const handleExecuteDisposal = async () => {
    if (!selectedItem) return;
    const itemId = selectedItem.id;
    setBusyAction(`dispose:${itemId}`);
    setError('');
    setFeedback('');
    try {
      await governanceService.executeDisposal(itemId, notes.trim());
      setSelectedItem(null);
      setNotes('');
      setFeedback('Disposal recorded successfully.');
      await load();
    } catch (reason) {
      setError(extractErrorMessage(reason));
    } finally {
      setBusyAction('');
    }
  };

  const handleLegalHold = async (item: RetentionDisposalQueueItem) => {
    setBusyAction(`hold:${item.id}`);
    setError('');
    setFeedback('');
    try {
      await governanceService.placeDisposalOnLegalHold(item.id);
      setFeedback('Disposal item placed on legal hold.');
      await load();
    } catch (reason) {
      setError(extractErrorMessage(reason));
    } finally {
      setBusyAction('');
    }
  };

  const columns: DataTableColumn<RetentionDisposalQueueItem>[] = [
    { id: 'record', header: 'Record', searchableValue: (item) => `${item.source_table} ${item.id}`, cell: (item) => <div><p className="font-semibold text-slate-900">{item.source_table.replace(/_/g, ' ')}</p><p className="mt-1 font-mono text-[10px] text-slate-500" title={item.id}>Queue {item.id.slice(0, 8)}…</p></div> },
    { id: 'reason', header: 'Disposition reason', searchableValue: (item) => item.reason, cell: (item) => <p className="max-w-xl truncate text-sm text-slate-700" title={item.reason}>{item.reason || 'Not provided'}</p> },
    { id: 'flagged', header: 'Flagged at', sortable: true, sortValue: (item) => item.flagged_at, accessor: (item) => formatDateTime(item.flagged_at) },
    { id: 'status', header: 'Status', cell: () => <DataTableStatusBadge value="PENDING_DELETION" /> },
  ];

  return (
    <div className="space-y-6">
      <DashboardHero eyebrow="Records Governance" title="Lifecycle & Defensible Disposal" subtitle="Review retention items flagged by the cloud disposal scheduler before recording a final decision." actions={
          <button onClick={() => void load()} title="Refresh disposal queue" aria-label="Refresh disposal queue" className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
      } />

      {feedback && <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5 shrink-0" />{feedback}</div>}
      {error && <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-500">Pending review</p><FileWarning className="h-5 w-5 text-amber-600" /></div>
          <p className="mt-3 text-3xl font-bold text-slate-950">{items.length}</p>
          <p className="mt-1 text-xs text-slate-500">Queue items awaiting a decision</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-500">Decision authority</p><ShieldCheck className="h-5 w-5 text-[#D02F34]" /></div>
          <p className="mt-3 text-lg font-bold text-slate-950">Records Officer</p>
          <p className="mt-1 text-xs text-slate-500">Server-audited account action</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-500">Data source</p><Scale className="h-5 w-5 text-slate-500" /></div>
          <p className="mt-3 text-lg font-bold text-slate-950">Supabase Cloud</p>
          <p className="mt-1 text-xs text-slate-500">Live retention disposal queue</p>
        </div>
      </section>

      <div>
        <div className="mb-3 flex items-center justify-between gap-4"><div><h2 className="text-sm font-bold text-slate-900">Pending Disposal Queue</h2><p className="mt-1 text-xs text-slate-500">Only server-authorized records with status <span className="font-mono">PENDING_DELETION</span> are shown.</p></div><DataTableStatusBadge value={`${items.length} PENDING`} tone="warning" /></div>
        <DataTable
          data={items}
          columns={columns}
          rowKey={(item) => item.id}
          caption="Pending records disposal queue"
          loading={loading}
          error={error || undefined}
          onRetry={load}
          onRefresh={load}
          searchableText={(item) => `${item.source_table} ${item.reason} ${item.id}`}
          searchPlaceholder="Search pending disposal records..."
          emptyTitle="No pending disposal items"
          emptyDescription="The queue is clear for the current retention cycle."
          rowActions={(item) => busyAction.endsWith(`:${item.id}`) ? <Loader2 className="h-5 w-5 animate-spin text-brand-500" aria-label="Updating disposal item" /> : <DataTableRowActions row={item} label={`Actions for ${item.source_table}`} actions={[
            { id: 'hold', label: 'Place on legal hold', icon: Scale, disabled: Boolean(busyAction), onSelect: handleLegalHold },
            { id: 'dispose', label: 'Execute disposal', icon: Trash2, destructive: true, disabled: Boolean(busyAction), onSelect: (row) => { setSelectedItem(row); setNotes(''); setError(''); setFeedback(''); } },
          ]} />}
        />
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="disposal-modal-title" className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div><p className="text-xs font-bold uppercase tracking-wider text-red-700">Final review</p><h2 id="disposal-modal-title" className="mt-1 text-lg font-bold text-slate-950">Confirm permanent deletion</h2></div>
              <button onClick={closeModal} title="Close confirmation" aria-label="Close confirmation" disabled={Boolean(busyAction)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p className="font-semibold">This decision is permanent.</p><p className="mt-1 text-xs leading-5">The queue item will be marked as disposed and the action will be attributed to your authenticated Records Officer account.</p></div>
              <dl className="grid gap-3 text-xs sm:grid-cols-2"><div><dt className="font-semibold text-slate-400">Queue ID</dt><dd className="mt-1 break-all font-mono text-slate-700">{selectedItem.id}</dd></div><div><dt className="font-semibold text-slate-400">Source Table</dt><dd className="mt-1 font-mono text-slate-700">{selectedItem.source_table}</dd></div></dl>
              <label className="block text-sm font-semibold text-slate-800" htmlFor="disposal-notes">Notes / Justification <span className="font-normal text-slate-400">(optional)</span><textarea id="disposal-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={4} placeholder="Add the business justification or disposal reference..." className="mt-2 block w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400 focus:border-red-700 focus:ring-2 focus:ring-red-100" disabled={Boolean(busyAction)} /></label>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4"><button onClick={closeModal} disabled={Boolean(busyAction)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Cancel</button><button onClick={() => void handleExecuteDisposal()} disabled={Boolean(busyAction)} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60">{busyAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Confirm Permanent Deletion</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
