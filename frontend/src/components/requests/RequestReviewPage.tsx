import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, CheckCheck, Loader2, FileSignature } from 'lucide-react';
import { requestReviewService, ReviewableRequest } from '../../api/requestReviewService';

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

  const run = async (id: string, action: 'approve' | 'reject' | 'complete', reason?: string) => {
    setBusy(id);
    try {
      if (action === 'approve') await requestReviewService.approve(id);
      else if (action === 'reject') await requestReviewService.reject(id, reason);
      else await requestReviewService.complete(id);
      setRequests(rs => rs.map(r => r.id === id ? { ...r, status: action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'COMPLETED', decisionNotes: reason } : r));
    } catch {
      setError('Action failed. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const onReject = (r: ReviewableRequest) => {
    const reason = window.prompt('Rejection reason (optional):', '');
    if (reason === null) return; // cancelled
    run(r.id, 'reject', reason.trim() || undefined);
  };

  const pending = requests.filter(r => r.status === 'PENDING' || r.status === 'IN_REVIEW');
  const approved = requests.filter(r => r.status === 'APPROVED');
  const decided = requests.filter(r => ['REJECTED', 'COMPLETED', 'CANCELLED'].includes(r.status));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Request Review</h1>
          <p className="text-sm text-slate-500 mt-0.5">Approve, reject or complete employee contract/legal requests. Decisions notify the requester instantly.</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading requests...
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Awaiting decision ({pending.length})</h2>
            {pending.length === 0 ? (
              <Empty text="No requests waiting for a decision." />
            ) : (
              <div className="space-y-3">
                {pending.map(r => (
                  <RequestCard key={r.id} r={r} busy={busy} onApprove={() => run(r.id, 'approve')} onReject={() => onReject(r)} onComplete={() => run(r.id, 'complete')} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Approved — ready to complete ({approved.length})</h2>
            {approved.length === 0 ? (
              <Empty text="No approved requests awaiting completion." />
            ) : (
              <div className="space-y-3">
                {approved.map(r => (
                  <RequestCard key={r.id} r={r} busy={busy} onApprove={() => run(r.id, 'approve')} onReject={() => onReject(r)} onComplete={() => run(r.id, 'complete')} />
                ))}
              </div>
            )}
          </section>

          {decided.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Decided ({decided.length})</h2>
              <div className="space-y-3">
                {decided.map(r => (
                  <RequestCard key={r.id} r={r} busy={busy} onApprove={() => run(r.id, 'approve')} onReject={() => onReject(r)} onComplete={() => run(r.id, 'complete')} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="px-6 py-8 rounded-2xl bg-white border border-slate-200 text-center text-sm text-slate-400">{text}</div>
);

const statusBadge = (status: string) => {
  switch (status) {
    case 'PENDING': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'IN_REVIEW': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'APPROVED': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'REJECTED': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'COMPLETED': return 'bg-teal-50 text-teal-700 border-teal-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-200';
  }
};

const RequestCard: React.FC<{
  r: ReviewableRequest;
  busy: string | null;
  onApprove: () => void;
  onReject: () => void;
  onComplete: () => void;
}> = ({ r, busy, onApprove, onReject, onComplete }) => {
  const isPending = r.status === 'PENDING' || r.status === 'IN_REVIEW';
  const isApproved = r.status === 'APPROVED';
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-slate-400" />
            <span className="text-[11px] font-mono text-slate-400">{r.type}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge(r.status)}`}>{r.status}</span>
          </div>
          <h3 className="text-sm font-bold text-slate-900 mt-1.5">{r.title}</h3>
          {r.description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.description}</p>}
          <p className="text-[11px] text-slate-400 mt-1.5">
            {r.requesterName ? `Requested by ${r.requesterName}` : 'Requested'} · {new Date(r.createdAt).toLocaleString()}
          </p>
          {r.decisionNotes && <p className="text-xs text-slate-500 mt-1 italic">Note: {r.decisionNotes}</p>}
        </div>
        {(isPending || isApproved) && (
          <div className="flex items-center gap-2 shrink-0">
            {isPending && (
              <>
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={busy === r.id}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Approve
                </button>
                <button
                  type="button"
                  onClick={onReject}
                  disabled={busy === r.id}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </button>
              </>
            )}
            {isApproved && (
              <button
                type="button"
                onClick={onComplete}
                disabled={busy === r.id}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                Complete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RequestReviewPage;
