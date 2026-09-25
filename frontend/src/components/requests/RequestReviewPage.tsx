import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, CheckCheck, Loader2 } from 'lucide-react';
import { requestReviewService, ReviewableRequest } from '../../api/requestReviewService';
import { ReasonDialog } from '../ui/SharedUI';
import { DashboardHero } from '../ui/DashboardPrimitives';
import { PortalLoadingOverlay } from '../ui/PortalLoadingOverlay';
import { DataTable, DataTableStatusBadge, type DataTableColumn } from '../ui/data-table';

/**
 * Shared review page for employee contract/legal requests, used by Contract
 * Officers, Legal Officers and SUPER_ADMINs. Approving/rejecting/completing a
 * request notifies the requester (persisted REST snapshot + Realtime marker).
 */
export const RequestReviewPage: React.FC = () => {
  const [requests, setRequests] = useState<ReviewableRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectRequest, setRejectRequest] = useState<ReviewableRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await requestReviewService.getForReview();
      setRequests(data);
      setError(null);
    } catch {
      setError('Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (id: string, action: 'approve' | 'reject' | 'complete', reason?: string): Promise<boolean> => {
    setBusy(id);
    try {
      if (action === 'approve') await requestReviewService.approve(id);
      else if (action === 'reject') await requestReviewService.reject(id, reason);
      else await requestReviewService.complete(id);
      setRequests(rs => rs.map(r => r.id === id ? { ...r, status: action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'COMPLETED', decisionNotes: reason } : r));
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Action failed. Try again.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const onReject = (r: ReviewableRequest) => setRejectRequest(r);

  return (
    <div className="p-8">
      <div className="mb-6">
        <DashboardHero title="Request Review" subtitle="Approve, reject or complete employee contract/legal requests. Decisions notify the requester instantly." actions={
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Refresh
        </button>
        } />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <PortalLoadingOverlay message="Loading requests..." />
      ) : (
        <DataTable
          data={requests}
          rowKey={(row) => row.id}
          caption="Employee requests for officer review"
          columns={[
            { id: 'request', header: 'Request', searchableValue: (row) => `${row.title} ${row.description ?? ''} ${row.decisionNotes ?? ''}`, cell: (row) => <><p className="font-semibold text-slate-900">{row.title}</p>{row.description && <p className="mt-1 max-w-md truncate text-xs text-slate-500" title={row.description}>{row.description}</p>}{row.decisionNotes && <p className="mt-1 text-xs italic text-slate-500">Note: {row.decisionNotes}</p>}</>, sortable: true },
            { id: 'type', header: 'Type', accessor: (row) => <DataTableStatusBadge value={row.type} />, searchableValue: (row) => row.type, sortable: true },
            { id: 'requester', header: 'Requester', accessor: (row) => row.requesterName || 'Not provided', sortable: true },
            { id: 'created', header: 'Created', accessor: (row) => new Date(row.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }), sortValue: (row) => new Date(row.createdAt), sortable: true },
            { id: 'status', header: 'Status', accessor: (row) => <DataTableStatusBadge value={row.status} />, searchableValue: (row) => row.status, sortable: true },
          ] satisfies DataTableColumn<ReviewableRequest>[]}
          searchableText={(row) => `${row.title} ${row.description ?? ''} ${row.requesterName ?? ''} ${row.type} ${row.status} ${row.decisionNotes ?? ''}`}
          searchPlaceholder="Search review requests…"
          filterRow={(row) => !statusFilter || row.status === statusFilter}
          filters={<select aria-label="Request status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-control border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><option value="">All statuses</option><option value="PENDING">Pending</option><option value="IN_REVIEW">In review</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select>}
          activeFilters={statusFilter ? [{ id: 'status', label: 'Status', value: statusFilter, onRemove: () => setStatusFilter('') }] : []}
          onClearFilters={() => setStatusFilter('')}
          onRefresh={() => void load()}
          rowActions={(row) => { const isPending = row.status === 'PENDING' || row.status === 'IN_REVIEW'; const isApproved = row.status === 'APPROVED'; if (!isPending && !isApproved) return null; return <div className="flex flex-wrap justify-end gap-2">{isPending && <><button type="button" onClick={() => void run(row.id, 'approve')} disabled={busy === row.id} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{busy === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Approve</button><button type="button" onClick={() => onReject(row)} disabled={busy === row.id} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" />Reject</button></>}{isApproved && <button type="button" onClick={() => void run(row.id, 'complete')} disabled={busy === row.id} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50">{busy === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}Complete</button>}</div>; }}
          emptyTitle="No review requests"
          emptyDescription="No employee requests are available in your authorized review scope."
          filteredEmptyTitle="No requests match the current filters"
        />
      )}
      <ReasonDialog
        open={Boolean(rejectRequest)}
        title="Reject request"
        description={rejectRequest ? `Provide a reason for rejecting “${rejectRequest.title}”.` : undefined}
        label="Rejection reason"
        confirmLabel="Reject request"
        required={false}
        busy={Boolean(rejectRequest && busy === rejectRequest.id)}
        onClose={() => setRejectRequest(null)}
        onConfirm={async (reason) => {
          if (!rejectRequest) return;
          const succeeded = await run(rejectRequest.id, 'reject', reason || undefined);
          if (succeeded) setRejectRequest(null);
          else throw new Error('The rejection failed. Your reason has been preserved.');
        }}
      />
    </div>
  );
};

export default RequestReviewPage;
