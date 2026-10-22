import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Expand,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { visitorService, type VisitorIdentityArtifact } from '../../api/visitorService';

type ImageStatus = 'loading' | 'loaded' | 'error' | 'expired' | 'missing';
type ReviewAction = 'IDENTITY_APPROVE' | 'IDENTITY_REJECT' | 'APPROVE' | 'DECLINE' | 'RETRY';

type Props = {
  visitor: any;
  onClose: () => void;
  onChanged: () => Promise<void>;
};

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const errorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: string } } } }).response;
    if (response?.data?.error?.message) return response.data.error.message;
  }
  return error instanceof Error ? error.message : 'The request could not be completed.';
};

const badgeClass = (value?: string) => {
  if (['APPROVED', 'VERIFIED', 'MANUAL_REVIEW_APPROVED', 'AUTHORIZED', 'SENT'].includes(value ?? '')) {
    return 'bg-emerald-100 text-emerald-800';
  }
  if (['DECLINED', 'FAILED', 'REVOKED'].includes(value ?? '')) return 'bg-rose-100 text-rose-800';
  return 'bg-amber-100 text-amber-900';
};

export const KioskVisitorReviewModal: React.FC<Props> = ({ visitor, onClose, onChanged }) => {
  const [currentVisitor, setCurrentVisitor] = useState(visitor);
  const [artifact, setArtifact] = useState<VisitorIdentityArtifact | null>(null);
  const [imageStatus, setImageStatus] = useState<ImageStatus>('loading');
  const [loadError, setLoadError] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fullScreen, setFullScreen] = useState(false);
  const requestId = useRef(0);
  const automaticRetryUsed = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; originX: number; originY: number } | null>(null);

  const resetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  const loadArtifact = useCallback(async (allowAutomaticRetry: boolean) => {
    const id = ++requestId.current;
    setArtifact(null);
    setImageStatus('loading');
    setLoadError('');
    resetView();
    if (!allowAutomaticRetry) automaticRetryUsed.current = false;
    try {
      const artifacts = await visitorService.getIdentityArtifacts(visitor.id);
      if (id !== requestId.current) return;
      const selected = artifacts.find((item) => item.type === 'ID_FRONT') ?? artifacts[0];
      if (!selected) {
        setImageStatus('missing');
        setLoadError('No active identification document is available for this visitor.');
        return;
      }
      if (!allowedImageTypes.has(selected.mimeType)) {
        setImageStatus('error');
        setLoadError('The identification document has an unsupported media type.');
        return;
      }
      setArtifact(selected);
      setImageStatus('loading');
    } catch (error) {
      if (id !== requestId.current) return;
      setImageStatus('error');
      setLoadError(errorMessage(error));
    }
  }, [resetView, visitor.id]);

  useEffect(() => {
    void loadArtifact(false);
    return () => { requestId.current += 1; };
  }, [loadArtifact]);

  useEffect(() => {
    if (!artifact?.expiresAt) return;
    const remaining = new Date(artifact.expiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      setImageStatus('expired');
      setLoadError('The secure image link expired. Request a fresh link to continue.');
      return;
    }
    const timer = window.setTimeout(() => {
      setImageStatus('expired');
      setLoadError('The secure image link expired. Request a fresh link to continue.');
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [artifact?.expiresAt]);

  const handleImageError = () => {
    if (artifact?.expiresAt && new Date(artifact.expiresAt).getTime() <= Date.now()) {
      setImageStatus('expired');
      setLoadError('The secure image link expired. Request a fresh link to continue.');
      return;
    }
    if (!automaticRetryUsed.current) {
      automaticRetryUsed.current = true;
      void loadArtifact(true);
      return;
    }
    setImageStatus('error');
    setLoadError('The private identification image could not be loaded. Check access or storage, then retry.');
  };

  const refreshVisitor = async () => {
    await onChanged();
    const refreshed = (await visitorService.listVisitors()).find((item) => item.id === currentVisitor.id);
    if (refreshed) setCurrentVisitor(refreshed);
  };

  const perform = async (action: ReviewAction) => {
    const trimmedNotes = notes.trim();
    if (action !== 'RETRY' && trimmedNotes.length < 5) {
      setActionError('Enter review notes or a decision reason of at least 5 characters.');
      return;
    }
    if ((action === 'IDENTITY_APPROVE' || action === 'IDENTITY_REJECT') && imageStatus !== 'loaded') {
      setActionError('Load and inspect the identification image before recording an identity decision.');
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      if (action === 'IDENTITY_APPROVE' || action === 'IDENTITY_REJECT') {
        await visitorService.manualIdentityReview(
          currentVisitor.id,
          action === 'IDENTITY_APPROVE' ? 'APPROVE' : 'REJECT',
          trimmedNotes,
        );
      } else if (action === 'APPROVE' || action === 'DECLINE') {
        await visitorService.decideApproval(currentVisitor.id, action, trimmedNotes);
      } else {
        await visitorService.retryPassEmail(currentVisitor.id);
      }
      await refreshVisitor();
      setNotes('');
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const setSafeZoom = (next: number) => {
    const value = Math.min(4, Math.max(1, next));
    setZoom(value);
    if (value === 1) setPan({ x: 0, y: 0 });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || imageStatus !== 'loaded') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, originX: pan.x, originY: pan.y };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    setPan({
      x: drag.current.originX + event.clientX - drag.current.x,
      y: drag.current.originY + event.clientY - drag.current.y,
    });
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };

  const controls = (
    <div className="flex flex-wrap items-center justify-center gap-2" aria-label="Image viewer controls">
      <button type="button" aria-label="Zoom out" disabled={imageStatus !== 'loaded' || zoom <= 1} onClick={() => setSafeZoom(zoom - 0.25)} className="rounded-lg bg-white/95 p-2 text-slate-800 shadow disabled:text-slate-400"><Minus className="h-4 w-4" /></button>
      <span className="min-w-14 rounded-lg bg-slate-900/85 px-2 py-2 text-center text-xs font-bold text-white">{Math.round(zoom * 100)}%</span>
      <button type="button" aria-label="Zoom in" disabled={imageStatus !== 'loaded' || zoom >= 4} onClick={() => setSafeZoom(zoom + 0.25)} className="rounded-lg bg-white/95 p-2 text-slate-800 shadow disabled:text-slate-400"><Plus className="h-4 w-4" /></button>
      <button type="button" aria-label="Rotate left" disabled={imageStatus !== 'loaded'} onClick={() => setRotation((value) => value - 90)} className="rounded-lg bg-white/95 p-2 text-slate-800 shadow disabled:text-slate-400"><RotateCcw className="h-4 w-4" /></button>
      <button type="button" aria-label="Rotate right" disabled={imageStatus !== 'loaded'} onClick={() => setRotation((value) => value + 90)} className="rounded-lg bg-white/95 p-2 text-slate-800 shadow disabled:text-slate-400"><RotateCw className="h-4 w-4" /></button>
      <button type="button" aria-label="Reset image view" disabled={imageStatus !== 'loaded'} onClick={resetView} className="rounded-lg bg-white/95 px-3 py-2 text-xs font-bold text-slate-800 shadow disabled:text-slate-400">Reset</button>
      <button type="button" aria-label={fullScreen ? 'Exit full-screen image view' : 'Open full-screen image view'} disabled={imageStatus !== 'loaded'} onClick={() => setFullScreen((value) => !value)} className="rounded-lg bg-white/95 p-2 text-slate-800 shadow disabled:text-slate-400"><Expand className="h-4 w-4" /></button>
    </div>
  );

  const renderViewer = (expanded = false) => (
    <div className={expanded ? 'flex h-full flex-col bg-slate-950 p-4' : ''}>
      <div
        className={`relative flex select-none items-center justify-center overflow-hidden rounded-2xl bg-slate-950 ${expanded ? 'min-h-0 flex-1' : 'min-h-[430px] lg:min-h-[560px]'} ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {artifact && !['error', 'expired', 'missing'].includes(imageStatus) && (
          <img
            src={artifact.signedUrl}
            alt={`Identification document submitted by ${currentVisitor.fullName}`}
            referrerPolicy="no-referrer"
            draggable={false}
            onLoad={() => { setImageStatus('loaded'); setLoadError(''); }}
            onError={handleImageError}
            className={`max-h-full max-w-full object-contain transition-opacity ${imageStatus === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})` }}
          />
        )}
        {imageStatus === 'loading' && <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-100"><Loader2 className="h-9 w-9 animate-spin text-red-500" /><span className="text-sm font-semibold">Loading identification document...</span></div>}
        {['error', 'expired', 'missing'].includes(imageStatus) && <div role="alert" className="max-w-md p-8 text-center text-slate-100"><AlertCircle className="mx-auto h-10 w-10 text-amber-400" /><p className="mt-3 text-sm font-bold">{loadError}</p><button type="button" onClick={() => void loadArtifact(false)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-100"><RefreshCw className="h-4 w-4" />Request fresh secure link</button></div>}
        <div className="absolute bottom-3 left-3 right-3">{controls}</div>
      </div>
      {imageStatus === 'loaded' && <p role="status" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" />Identification document loaded successfully</p>}
    </div>
  );

  const notesReady = notes.trim().length >= 5;
  const evidenceReady = imageStatus === 'loaded';
  const identityPending = !['MANUAL_REVIEW_APPROVED', 'VERIFIED', 'FAILED'].includes(currentVisitor.identityVerificationStatus);
  const visitPending = currentVisitor.approvalStatus === 'PENDING';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="visitor-review-title">
      <div className="max-h-[96vh] w-full max-w-7xl overflow-y-auto rounded-2xl border border-slate-700 bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <p className="font-mono text-xs font-black text-red-700">{currentVisitor.referenceNumber}</p>
            <h2 id="visitor-review-title" className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">Review {currentVisitor.fullName}</h2>
            <p className="mt-1 text-sm font-medium text-slate-600">Identity evidence and visit authorization are separate decisions.</p>
          </div>
          <button type="button" disabled={busy} onClick={onClose} aria-label="Close visitor review" className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-100 disabled:text-slate-300"><X className="h-5 w-5" /></button>
        </header>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
          <section aria-label="Private identification document">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Private ID artifact</h3>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-800"><ShieldCheck className="h-3.5 w-3.5" />Authorized review only</span>
            </div>
            {renderViewer()}
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-950">The private bucket remains inaccessible to the public. This page requests a new five-minute signed link through the authenticated Facilities Officer route each time it opens or retries. Do not copy, download, or redistribute the image unless approved policy requires it.</p>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900">
              <dl className="grid gap-3">
                <div><dt className="text-xs font-bold uppercase text-slate-500">Purpose / destination</dt><dd className="mt-1 font-bold">{currentVisitor.purposeOfVisit}</dd><dd className="text-slate-700">{currentVisitor.host?.fullName || currentVisitor.receivingDepartment}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-slate-500">Identification</dt><dd className="mt-1 font-bold">{currentVisitor.idType || 'Not supplied'}</dd><dd className="text-slate-700">{currentVisitor.idNumberLast4 ? `Retained last four: ••••${currentVisitor.idNumberLast4}` : 'No ID number retained'}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-slate-500">Email</dt><dd className="mt-1 break-all font-semibold">{currentVisitor.email}</dd></div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeClass(currentVisitor.identityVerificationStatus)}`}>Identity: {String(currentVisitor.identityVerificationStatus).replace(/_/g, ' ')}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeClass(currentVisitor.approvalStatus)}`}>Visit: {currentVisitor.approvalStatus}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeClass(currentVisitor.accessStatus)}`}>Access: {currentVisitor.accessStatus}</span>
                </div>
                <div><dt className="text-xs font-bold uppercase text-slate-500">Pass email</dt><dd className="mt-1 font-bold">{currentVisitor.emailDeliveryStatus}</dd>{currentVisitor.emailDeliveryError && <dd className="mt-1 text-xs font-semibold text-rose-800">{currentVisitor.emailDeliveryError}</dd>}</div>
              </dl>
            </div>

            <label className="block"><span className="mb-1.5 block text-xs font-black uppercase text-slate-700">Review notes / decision reason</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={1000} placeholder="Required: at least 5 characters" className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-950 outline-none focus:border-red-700 focus:ring-2 focus:ring-red-100" /></label>
            {actionError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">{actionError}</p>}

            <div className="grid gap-2">
              {identityPending && <>
                <button type="button" disabled={busy || !evidenceReady || !notesReady} onClick={() => void perform('IDENTITY_APPROVE')} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">Approve manual identity review</button>
                <button type="button" disabled={busy || !evidenceReady || !notesReady} onClick={() => void perform('IDENTITY_REJECT')} className="rounded-xl border border-rose-300 bg-white px-4 py-3 text-sm font-black text-rose-800 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500">Reject identity review</button>
                {!evidenceReady && <p className="text-center text-xs font-semibold text-amber-800">Identity decisions unlock only after the image loads successfully.</p>}
              </>}
              {visitPending && <>
                <button type="button" disabled={busy || !notesReady || !['MANUAL_REVIEW_APPROVED', 'VERIFIED'].includes(currentVisitor.identityVerificationStatus)} onClick={() => void perform('APPROVE')} className="rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">Approve visit and issue pass</button>
                <button type="button" disabled={busy || !notesReady} onClick={() => void perform('DECLINE')} className="rounded-xl border border-slate-400 bg-white px-4 py-3 text-sm font-black text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500">Decline visit</button>
              </>}
              {currentVisitor.approvalStatus === 'APPROVED' && ['FAILED', 'NOT_CONFIGURED'].includes(currentVisitor.emailDeliveryStatus) && <button type="button" disabled={busy} onClick={() => void perform('RETRY')} className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-500">Replace pass and retry email</button>}
              {busy && <p role="status" className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Saving authorized action...</p>}
            </div>
          </aside>
        </div>
      </div>

      {fullScreen && <div className="fixed inset-0 z-[70] bg-slate-950 p-2 sm:p-5" role="dialog" aria-modal="true" aria-label="Full-screen identification image"><button type="button" onClick={() => setFullScreen(false)} aria-label="Exit full-screen image view" className="absolute right-5 top-5 z-10 rounded-xl bg-white p-2 text-slate-900 shadow"><X className="h-5 w-5" /></button>{renderViewer(true)}</div>}
    </div>
  );
};
